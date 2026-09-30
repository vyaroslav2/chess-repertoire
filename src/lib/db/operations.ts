import { Prisma, PrismaClient } from "@prisma/client";
import { Chess } from "chess.js";
import { fetchWikibooksSnippet, type WikibooksResult } from "../api/wikibooks";
import { parseFullFen, positionKeyFromFen } from "../core/fen";
import { isValidUciMove } from "../core/uci";
import type { ExplorerDataset } from "../core/config";

export const prisma = new PrismaClient();

type DbClient = PrismaClient | Prisma.TransactionClient;

/** DB.36: the first node to reach a positionKey owns it. Returns the owner's id. */
export async function claimPosition(client: DbClient, repertoireId: string, positionKey: string, nodeId: string) {
  const existing = await client.position.findUnique({ where: { repertoireId_positionKey: { repertoireId, positionKey } } });
  if (existing) return existing.nodeId;
  await client.position.create({ data: { repertoireId, positionKey, nodeId } });
  return nodeId;
}

type WikibooksFetcher = (history: string[]) => Promise<WikibooksResult>;

function validateRepertoireNodeWikibooksState(node: { wikibooksChecked: boolean; wikiText: string | null }): void {
  if (!node.wikibooksChecked && node.wikiText !== null) {
    throw new Error("Invalid RepertoireNode Wikibooks state: unchecked node cannot contain text");
  }
}

export async function ensureRepertoireNodeWikibooks(
  nodeId: string,
  fetcher: WikibooksFetcher = fetchWikibooksSnippet
) {
  const node = await prisma.repertoireNode.findUnique({ where: { id: nodeId } });
  if (!node) throw new Error(`Cannot enrich missing RepertoireNode ${nodeId}`);
  validateRepertoireNodeWikibooksState(node);
  if (node.wikibooksChecked) {
    await prisma.wikibooksHistoryCache.upsert({
      where: { repertoireId_history: { repertoireId: node.repertoireId, history: node.history } },
      update: { wikiText: node.wikiText },
      create: { repertoireId: node.repertoireId, history: node.history, wikiText: node.wikiText }
    });
    return { status: "CACHED" as const, text: node.wikiText };
  }
  if (node.displayPgn.trim() !== node.displayPgn) {
    throw new Error("Cannot enrich RepertoireNode with non-canonical PGN history");
  }

  const durable = await prisma.wikibooksHistoryCache.findUnique({
    where: { repertoireId_history: { repertoireId: node.repertoireId, history: node.history } }
  });
  if (durable) {
    await prisma.repertoireNode.update({
      where: { id: node.id },
      data: { wikibooksChecked: true, wikiText: durable.wikiText }
    });
    return { status: "CACHED" as const, text: durable.wikiText };
  }

  const result = await fetcher(node.displayPgn === "" ? [] : node.displayPgn.split(/\s+/));
  if (result.status === "TECHNICAL_FAILURE") return result;

  const wikiText = result.status === "DESCRIPTION" ? result.text : null;
  if (wikiText !== null && (wikiText.trim() !== wikiText || wikiText.length === 0)) {
    throw new Error("Invalid Wikibooks description persistence result");
  }
  const update = await prisma.$transaction(async tx => {
    await tx.wikibooksHistoryCache.upsert({
      where: { repertoireId_history: { repertoireId: node.repertoireId, history: node.history } },
      update: { wikiText },
      create: { repertoireId: node.repertoireId, history: node.history, wikiText }
    });
    return tx.repertoireNode.updateMany({
      where: { id: node.id, wikibooksChecked: false, wikiText: null },
      data: { wikibooksChecked: true, wikiText }
    });
  });
  if (update.count !== 1) {
    const current = await prisma.repertoireNode.findUnique({ where: { id: node.id } });
    if (!current) throw new Error(`RepertoireNode ${node.id} disappeared during Wikibooks persistence`);
    validateRepertoireNodeWikibooksState(current);
    if (!current.wikibooksChecked) throw new Error("RepertoireNode Wikibooks state changed concurrently");
  }
  return result;
}

// --- DB.31 Explorer cache ---

export type ExplorerMoveRow = {
  uci: string;
  san: string;
  games: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
};

export type ExplorerCacheEntry = {
  positionTotalGames: number;
  eco: string | null;
  openingName: string | null;
  moves: ExplorerMoveRow[];
};

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function validateExplorerMoveRows(moves: ExplorerMoveRow[]): void {
  if (!Array.isArray(moves)) {
    throw new Error("Invalid explorer bucket: moves must be an array");
  }

  for (const move of moves) {
    if (!move || typeof move !== "object") {
      throw new Error("Invalid explorer bucket: move must be an object");
    }

    if (!isValidUciMove(move.uci)) {
      throw new Error("Invalid explorer bucket: invalid UCI/LAN move");
    }
    if (typeof move.san !== "string" || move.san.trim() === "") {
      throw new Error("Invalid explorer bucket: SAN must be non-empty");
    }
    if (!isFiniteNonNegativeInteger(move.games) ||
        !isFiniteNonNegativeInteger(move.whiteWins) ||
        !isFiniteNonNegativeInteger(move.draws) ||
        !isFiniteNonNegativeInteger(move.blackWins)) {
      throw new Error("Invalid explorer bucket: statistics must be finite non-negative integers");
    }
    if (move.games !== move.whiteWins + move.draws + move.blackWins) {
      throw new Error("Invalid explorer bucket: games must equal the result-count sum");
    }
  }
}

function validateOpeningPair(eco: string | null, openingName: string | null, label: string): void {
  const hasEco = typeof eco === "string" && eco.trim() !== "";
  const hasName = typeof openingName === "string" && openingName.trim() !== "";
  if (hasEco !== hasName || (!hasEco && (eco !== null || openingName !== null))) {
    throw new Error(`Invalid ${label}: eco and openingName must both be set or both be null`);
  }
}

function validateCacheProfile(cacheProfile: string): void {
  if (typeof cacheProfile !== "string" || cacheProfile.trim() === "" || cacheProfile.trim() !== cacheProfile) {
    throw new Error("Invalid cache profile: must be non-empty and canonical");
  }
}

export async function saveExplorerCache(positionKey: string, cacheProfile: string, entry: ExplorerCacheEntry) {
  validateCacheProfile(cacheProfile);
  validateExplorerMoveRows(entry.moves);
  if (!isFiniteNonNegativeInteger(entry.positionTotalGames)) {
    throw new Error("Invalid explorer bucket: positionTotalGames must be a finite non-negative integer");
  }
  validateOpeningPair(entry.eco, entry.openingName, "explorer opening");

  return prisma.$transaction(async tx => {
    await tx.positionCache.deleteMany({ where: { positionKey, cacheProfile } });
    return tx.positionCache.create({
      data: {
        positionKey,
        cacheProfile,
        positionTotalGames: entry.positionTotalGames,
        eco: entry.eco,
        openingName: entry.openingName,
        moves: { create: entry.moves.map(move => ({ ...move })) }
      }
    });
  });
}

export type ReadExplorerCacheResult =
  | { status: "missing" }
  | { status: "empty"; positionTotalGames: number; eco: string | null; openingName: string | null }
  | { status: "success"; positionTotalGames: number; eco: string | null; openingName: string | null; moves: (ExplorerMoveRow & { id: string })[] };

export async function readExplorerCache(positionKey: string, cacheProfile: string): Promise<ReadExplorerCacheResult> {
  validateCacheProfile(cacheProfile);
  const row = await prisma.positionCache.findUnique({
    where: { positionKey_cacheProfile: { positionKey, cacheProfile } },
    include: { moves: true }
  });
  if (!row) return { status: "missing" };
  const header = { positionTotalGames: row.positionTotalGames, eco: row.eco, openingName: row.openingName };
  if (row.moves.length === 0) return { status: "empty", ...header };
  return {
    status: "success",
    ...header,
    moves: row.moves.map(({ id, uci, san, games, whiteWins, draws, blackWins }) => ({ id, uci, san, games, whiteWins, draws, blackWins }))
  };
}

export type HumanDatabaseType = ExplorerDataset;

// --- DB.32 EngineCache ---

export type RemoteEngineSource = "LICHESS" | "CHESSDB";
type EngineName = RemoteEngineSource | "LOCAL";

export type RemoteEngineEvaluation = {
  uci: string;
  san?: string | null;
  cp: number | null;
  mate: number | null;
};

function validateRemoteEngineSource(source: string): asserts source is RemoteEngineSource {
  if (source !== "LICHESS" && source !== "CHESSDB") {
    throw new Error(`Invalid remote engine source: ${source}`);
  }
}

function validateRemoteEngineResult(
  fullFen: string,
  source: RemoteEngineSource,
  evaluationProfile: string,
  evaluations: RemoteEngineEvaluation[]
): Array<RemoteEngineEvaluation & { san: string }> {
  const canonicalFullFen = parseFullFen(fullFen);
  if (canonicalFullFen !== fullFen) {
    throw new Error("Invalid remote engine result: FullFen must be canonical");
  }
  validateRemoteEngineSource(source);
  if (typeof evaluationProfile !== "string" || evaluationProfile.trim() === "" || evaluationProfile.trim() !== evaluationProfile) {
    throw new Error("Invalid remote engine result: evaluationProfile must be non-empty and canonical");
  }
  if (!Array.isArray(evaluations)) {
    throw new Error("Invalid remote engine result: evaluations must be an array");
  }

  const seenUci = new Set<string>();
  return evaluations.flatMap(evaluation => {
    if (!evaluation || typeof evaluation !== "object") {
      throw new Error("Invalid remote engine result: evaluation must be an object");
    }
    if (!isValidUciMove(evaluation.uci)) {
      throw new Error("Invalid remote engine result: malformed UCI/LAN move");
    }
    if (seenUci.has(evaluation.uci)) {
      return [];
    }
    seenUci.add(evaluation.uci);

    const hasCp = typeof evaluation.cp === "number" && Number.isFinite(evaluation.cp);
    const hasMate = typeof evaluation.mate === "number" && Number.isInteger(evaluation.mate);
    if (!((hasCp && evaluation.mate === null) || (evaluation.cp === null && hasMate))) {
      throw new Error("Invalid remote engine result: exactly one of finite cp or integer mate is required");
    }

    const chess = new Chess(canonicalFullFen);
    let parsedMove;
    try {
      parsedMove = chess.move({
        from: evaluation.uci.slice(0, 2),
        to: evaluation.uci.slice(2, 4),
        promotion: evaluation.uci.length === 5 ? evaluation.uci[4] : undefined
      });
    } catch {
      throw new Error(`Invalid remote engine result: illegal UCI move ${evaluation.uci}`);
    }
    if (!parsedMove || parsedMove.lan !== evaluation.uci) {
      throw new Error(`Invalid remote engine result: illegal UCI move ${evaluation.uci}`);
    }
    if (evaluation.san !== undefined && evaluation.san !== null &&
        (typeof evaluation.san !== "string" || evaluation.san.trim() === "" || evaluation.san !== parsedMove.san)) {
      throw new Error(`Invalid remote engine result: SAN does not match UCI move ${evaluation.uci}`);
    }

    return [{ ...evaluation, san: parsedMove.san }];
  });
}

async function upsertEngineCache(client: DbClient, fullFen: string, engine: EngineName, engineProfile: string) {
  return client.engineCache.upsert({
    where: { fullFen_engine_engineProfile: { fullFen, engine, engineProfile } },
    update: { fetchedAt: new Date() },
    create: { fullFen, engineProfile, engine }
  });
}

export async function saveRemoteEngineResult(
  fullFen: string,
  source: RemoteEngineSource,
  evaluationProfile: string,
  evaluations: RemoteEngineEvaluation[]
) {
  const validated = validateRemoteEngineResult(fullFen, source, evaluationProfile, evaluations);

  return prisma.$transaction(async tx => {
    const cache = await upsertEngineCache(tx, fullFen, source, evaluationProfile);
    await tx.engineCacheEvaluation.deleteMany({ where: { cacheId: cache.id } });
    if (validated.length > 0) {
      await tx.engineCacheEvaluation.createMany({
        data: validated.map((evaluation, index) => ({
          cacheId: cache.id,
          uci: evaluation.uci,
          san: evaluation.san,
          cp: evaluation.cp,
          mate: evaluation.mate,
          rank: index + 1
        }))
      });
    }
    return cache;
  });
}

/** Explicit refresh entry point: fetch a complete source snapshot, then replace it atomically. */
export async function refreshRemoteEngineResult(
  fullFen: string,
  source: RemoteEngineSource,
  evaluationProfile: string,
  fetchSnapshot: () => Promise<RemoteEngineEvaluation[]>
) {
  const evaluations = await fetchSnapshot();
  return saveRemoteEngineResult(fullFen, source, evaluationProfile, evaluations);
}

type EngineCacheMarker = { id: string; fullFen: string; source: string; evaluationProfile: string; fetchedAt: Date };

export type ReadRemoteEngineResult =
  | { status: "missing" }
  | { status: "empty", fetch: EngineCacheMarker }
  | { status: "success", fetch: EngineCacheMarker, evaluations: Array<RemoteEngineEvaluation & { id: string; fetchId: string; san: string | null; rank: number | null }> };

export async function readRemoteEngineResult(
  fullFen: string,
  source: RemoteEngineSource,
  evaluationProfile: string
): Promise<ReadRemoteEngineResult> {
  const canonicalFullFen = parseFullFen(fullFen);
  if (canonicalFullFen !== fullFen) throw new Error("FullFen must be canonical");
  validateRemoteEngineSource(source);
  if (typeof evaluationProfile !== "string" || evaluationProfile.trim() === "" || evaluationProfile.trim() !== evaluationProfile) {
    throw new Error("evaluationProfile must be non-empty and canonical");
  }

  const cache = await prisma.engineCache.findUnique({
    where: { fullFen_engine_engineProfile: { fullFen, engine: source, engineProfile: evaluationProfile } },
    include: { evaluations: { orderBy: { uci: "asc" } } }
  });
  if (!cache) return { status: "missing" };

  const fetch = { id: cache.id, fullFen: cache.fullFen, source: cache.engine, evaluationProfile: cache.engineProfile, fetchedAt: cache.fetchedAt };
  if (cache.evaluations.length === 0) return { status: "empty", fetch };
  return {
    status: "success",
    fetch,
    evaluations: cache.evaluations.map(evaluation => ({
      id: evaluation.id, fetchId: evaluation.cacheId, uci: evaluation.uci, san: evaluation.san,
      cp: evaluation.cp, mate: evaluation.mate, rank: evaluation.rank
    }))
  };
}

export async function readRemoteEngineCandidate(
  fullFen: string,
  source: RemoteEngineSource,
  evaluationProfile: string,
  uci: string
) {
  const result = await readRemoteEngineResult(fullFen, source, evaluationProfile);
  if (result.status === "missing") return { status: "missing" as const };
  if (result.status === "empty") return { status: "unavailable" as const, fetch: result.fetch };
  const evaluation = result.evaluations.find(item => item.uci === uci);
  return evaluation
    ? { status: "success" as const, fetch: result.fetch, evaluation }
    : { status: "unavailable" as const, fetch: result.fetch };
}

export type LocalEngineEvaluation = {
  uci: string;
  san?: string | null;
  cp: number | null;
  mate: number | null;
};

function validateLocalEngineIdentity(fullFen: string, evaluationProfile: string): string {
  const canonicalFullFen = parseFullFen(fullFen);
  if (canonicalFullFen !== fullFen) {
    throw new Error("Invalid Local Engine evidence: FullFen must be canonical");
  }
  if (typeof evaluationProfile !== "string" || evaluationProfile.trim() === "" || evaluationProfile.trim() !== evaluationProfile) {
    throw new Error("Invalid Local Engine evidence: evaluationProfile must be non-empty and canonical");
  }
  return canonicalFullFen;
}

function validateLocalEngineEvaluation(
  fullFen: string,
  evaluationProfile: string,
  evaluation: LocalEngineEvaluation,
  expectedUci?: string
): LocalEngineEvaluation & { san: string } {
  const canonicalFullFen = validateLocalEngineIdentity(fullFen, evaluationProfile);
  if (!evaluation || typeof evaluation !== "object" || !isValidUciMove(evaluation.uci)) {
    throw new Error("Invalid Local Engine evidence: malformed UCI/LAN move");
  }
  if (expectedUci !== undefined && evaluation.uci !== expectedUci) {
    throw new Error(`Invalid Local Engine evidence: expected root ${expectedUci} but received ${evaluation.uci}`);
  }

  const hasCp = typeof evaluation.cp === "number" && Number.isFinite(evaluation.cp);
  const hasMate = typeof evaluation.mate === "number" && Number.isInteger(evaluation.mate);
  if (!((hasCp && evaluation.mate === null) || (evaluation.cp === null && hasMate))) {
    throw new Error("Invalid Local Engine evidence: exactly one of finite cp or integer mate is required");
  }

  const chess = new Chess(canonicalFullFen);
  let parsedMove;
  try {
    parsedMove = chess.move({
      from: evaluation.uci.slice(0, 2),
      to: evaluation.uci.slice(2, 4),
      promotion: evaluation.uci.length === 5 ? evaluation.uci[4] : undefined
    });
  } catch {
    throw new Error(`Invalid Local Engine evidence: illegal UCI move ${evaluation.uci}`);
  }
  if (!parsedMove || parsedMove.lan !== evaluation.uci) {
    throw new Error(`Invalid Local Engine evidence: illegal UCI move ${evaluation.uci}`);
  }
  if (evaluation.san !== undefined && evaluation.san !== null &&
      (typeof evaluation.san !== "string" || evaluation.san !== parsedMove.san)) {
    throw new Error(`Invalid Local Engine evidence: SAN does not match UCI move ${evaluation.uci}`);
  }

  return { ...evaluation, san: parsedMove.san };
}

/** Local Stockfish runs with localStockfishMultiPv = 1: its best move is the evaluation ranked 1. */
export async function saveLocalEngineBaseline(
  fullFen: string,
  evaluationProfile: string,
  evaluation: LocalEngineEvaluation
) {
  const validated = validateLocalEngineEvaluation(fullFen, evaluationProfile, evaluation);
  return prisma.$transaction(async tx => {
    const cache = await upsertEngineCache(tx, fullFen, "LOCAL", evaluationProfile);
    await tx.engineCacheEvaluation.updateMany({ where: { cacheId: cache.id, rank: 1, uci: { not: validated.uci } }, data: { rank: null } });
    const saved = await tx.engineCacheEvaluation.upsert({
      where: { cacheId_uci: { cacheId: cache.id, uci: validated.uci } },
      update: { san: validated.san, cp: validated.cp, mate: validated.mate, rank: 1 },
      create: { cacheId: cache.id, uci: validated.uci, san: validated.san, cp: validated.cp, mate: validated.mate, rank: 1 }
    });
    return { fullFen, evaluationProfile, bestUci: saved.uci, san: saved.san, cp: saved.cp, mate: saved.mate };
  });
}

export async function readLocalEngineBaseline(fullFen: string, evaluationProfile: string) {
  validateLocalEngineIdentity(fullFen, evaluationProfile);
  const cache = await prisma.engineCache.findUnique({
    where: { fullFen_engine_engineProfile: { fullFen, engine: "LOCAL", engineProfile: evaluationProfile } },
    include: { evaluations: { where: { rank: 1 } } }
  });
  const row = cache?.evaluations[0];
  if (!row) return null;
  const evaluation = validateLocalEngineEvaluation(fullFen, evaluationProfile, {
    uci: row.uci,
    san: row.san,
    cp: row.cp,
    mate: row.mate
  });
  return { fullFen, evaluationProfile, bestUci: row.uci, ...evaluation };
}

export async function saveLocalEngineCandidate(
  fullFen: string,
  candidateUci: string,
  evaluationProfile: string,
  evaluation: LocalEngineEvaluation
) {
  if (!isValidUciMove(candidateUci)) {
    throw new Error("Invalid Local Engine candidate identity");
  }
  const validated = validateLocalEngineEvaluation(fullFen, evaluationProfile, evaluation, candidateUci);
  return prisma.$transaction(async tx => {
    const cache = await upsertEngineCache(tx, fullFen, "LOCAL", evaluationProfile);
    const saved = await tx.engineCacheEvaluation.upsert({
      where: { cacheId_uci: { cacheId: cache.id, uci: candidateUci } },
      update: { san: validated.san, cp: validated.cp, mate: validated.mate },
      create: { cacheId: cache.id, uci: candidateUci, san: validated.san, cp: validated.cp, mate: validated.mate, rank: null }
    });
    return { fullFen, evaluationProfile, candidateUci: saved.uci, san: saved.san, cp: saved.cp, mate: saved.mate };
  });
}

export async function readLocalEngineCandidate(fullFen: string, candidateUci: string, evaluationProfile: string) {
  validateLocalEngineIdentity(fullFen, evaluationProfile);
  if (!isValidUciMove(candidateUci)) throw new Error("Invalid Local Engine candidate identity");
  const cache = await prisma.engineCache.findUnique({
    where: { fullFen_engine_engineProfile: { fullFen, engine: "LOCAL", engineProfile: evaluationProfile } },
    include: { evaluations: { where: { uci: candidateUci } } }
  });
  const row = cache?.evaluations[0];

  if (!row) return null;
  const evaluation = validateLocalEngineEvaluation(fullFen, evaluationProfile, {
    uci: row.uci,
    san: row.san,
    cp: row.cp,
    mate: row.mate
  }, candidateUci);
  return { fullFen, evaluationProfile, candidateUci: row.uci, ...evaluation };
}

// --- DB.08 - DB.15 moves ---

export const RESPONSE_EVALUATION_SOURCES = ["Lichess Cloud Evaluation", "ChessDB", "Local Deep Stockfish"] as const;
export const RESPONSE_SELECTION_METHODS = ["Ordinary API", "Corrected after Deep Verification", "Local Engine Fallback", "Hardcoded Opening"] as const;
export const RESPONSE_MOVE_ORIGINS = ["Human Move", "Engine Move", "Hardcoded Move"] as const;
export type ResponseEvaluationSource = typeof RESPONSE_EVALUATION_SOURCES[number];
export type ResponseSelectionMethod = typeof RESPONSE_SELECTION_METHODS[number];
export type ResponseMoveOrigin = typeof RESPONSE_MOVE_ORIGINS[number];

/** DB.13 the human evidence behind a Black move. */
export type ResponseHumanEvidence = {
  mastersGames?: number | null;
  eliteGames?: number | null;
  weightedGames?: number | null;
  totalMastersGames?: number | null;
  mastersMoveShare?: number | null;
  totalEliteGames?: number | null;
  eliteMoveShare?: number | null;
};

export type ResponsePersistenceInput = ResponseHumanEvidence & {
  fromNodeId: string; toNodeId: string | null; uci: string; san?: string | null;
  cp: number | null; mate: number | null; source: ResponseEvaluationSource;
  selectionMethod: ResponseSelectionMethod; moveOrigin: ResponseMoveOrigin;
  deepVerified: boolean;
  /** The local profile the deepVerified evidence was read under. Checked, never stored (DB.14). */
  localEvaluationProfile: string | null;
  stopReason?: "Repetition" | "Transposition" | null;
  engineRank?: number | null;
};

function isNonEmptyCanonicalString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

export function validateResponsePersistence(input: ResponsePersistenceInput): void {
  if (!RESPONSE_EVALUATION_SOURCES.includes(input.source as ResponseEvaluationSource)) throw new Error("Invalid RESPONSE source");
  if (!RESPONSE_SELECTION_METHODS.includes(input.selectionMethod as ResponseSelectionMethod)) throw new Error("Invalid RESPONSE selectionMethod");
  if (!RESPONSE_MOVE_ORIGINS.includes(input.moveOrigin as ResponseMoveOrigin)) throw new Error("Invalid RESPONSE moveOrigin");
  if (!isValidUciMove(input.uci)) throw new Error("Invalid RESPONSE UCI/LAN move");
  // DB.14 exactly one of cp or mate; DB.12 mate is never zero.
  const hasCp = typeof input.cp === "number" && Number.isFinite(input.cp);
  const hasMate = typeof input.mate === "number" && Number.isInteger(input.mate) && input.mate !== 0;
  if (!((hasCp && input.mate === null) || (input.cp === null && hasMate))) throw new Error("Invalid RESPONSE evaluation: exactly one of finite cp or non-zero integer mate is required");
  if (typeof input.deepVerified !== "boolean") throw new Error("Invalid RESPONSE deepVerified value");
  if (input.deepVerified && !isNonEmptyCanonicalString(input.localEvaluationProfile)) throw new Error("Invalid RESPONSE: deepVerified requires localEvaluationProfile");
  if (input.localEvaluationProfile !== null && !isNonEmptyCanonicalString(input.localEvaluationProfile)) throw new Error("Invalid RESPONSE localEvaluationProfile");
  if (input.weightedGames !== undefined && input.weightedGames !== null &&
      (typeof input.weightedGames !== "number" || !Number.isFinite(input.weightedGames) || input.weightedGames < 0)) throw new Error("Invalid RESPONSE weightedGames");
  for (const [label, value] of [["mastersGames", input.mastersGames], ["eliteGames", input.eliteGames], ["totalMastersGames", input.totalMastersGames], ["totalEliteGames", input.totalEliteGames], ["engineRank", input.engineRank]] as const) {
    if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 0)) throw new Error(`Invalid RESPONSE ${label}`);
  }
  for (const [label, value] of [["mastersMoveShare", input.mastersMoveShare], ["eliteMoveShare", input.eliteMoveShare]] as const) {
    if (value !== undefined && value !== null && (!Number.isFinite(value) || value < 0 || value > 1)) throw new Error(`Invalid RESPONSE ${label}`);
  }
  const stopReason = input.stopReason ?? null;
  if (stopReason === "Repetition") {
    if (input.toNodeId !== null) throw new Error("Invalid RESPONSE repetition: toNodeId must be null");
  } else if (!isNonEmptyCanonicalString(input.toNodeId)) {
    throw new Error("Invalid RESPONSE: non-repetition requires toNodeId");
  }
}

/** DB.13: the share fields are always the games field over its total. */
export function responseHumanEvidence(input: {
  mastersGames: number | null;
  eliteGames: number | null;
  weightedGames: number | null;
  totalMastersGames: number | null;
  totalEliteGames: number | null;
}): Required<ResponseHumanEvidence> {
  const share = (games: number | null, total: number | null) =>
    games !== null && total !== null && total > 0 ? games / total : null;
  return {
    ...input,
    mastersMoveShare: share(input.mastersGames, input.totalMastersGames),
    eliteMoveShare: share(input.eliteGames, input.totalEliteGames)
  };
}

// --- DB.03 - DB.16 nodes ---

export async function getRepertoireNode(repertoireId: string, history: string) {
  return prisma.repertoireNode.findFirst({ where: { repertoireId, history } });
}

export type OpeningMetadataState = {
  status: "PRESENT" | "VALID_ABSENCE";
  eco: string | null;
  openingName: string | null;
};

/** DB.06: PRESENT carries both names; VALID_ABSENCE carries neither. */
export function validateOpeningMetadataState(state: { status: string | null; eco: string | null; openingName: string | null }, label: string): asserts state is OpeningMetadataState {
  if (state.status !== "PRESENT" && state.status !== "VALID_ABSENCE") throw new Error(`${label}: opening metadata status is missing`);
  if (state.status === "PRESENT" && (!state.eco || !state.openingName)) throw new Error(`${label}: PRESENT opening metadata requires both eco and openingName`);
  if (state.status === "VALID_ABSENCE" && (state.eco !== null || state.openingName !== null)) throw new Error(`${label}: VALID_ABSENCE opening metadata cannot contain eco or openingName`);
}

export async function createRepertoireNode(
  repertoireId: string,
  rawFen: string,
  history: string,
  routeProb: number,
  options: {
    displayPgn?: string;
    siblingIndex?: number | null;
    cumProb?: number;
    eco?: string | null;
    openingName?: string | null;
    openingMetadataStatus?: "PRESENT" | "VALID_ABSENCE";
  } = {}
) {
  const fullFen = parseFullFen(rawFen);
  const positionKey = positionKeyFromFen(fullFen);
  const hasOpeningState = options.openingMetadataStatus !== undefined ||
    options.eco !== undefined || options.openingName !== undefined;
  if (hasOpeningState) {
    validateOpeningMetadataState({
      status: options.openingMetadataStatus ?? null,
      eco: options.eco ?? null,
      openingName: options.openingName ?? null
    }, "Invalid RepertoireNode");
  }

  const existingCanonical = await prisma.repertoireNode.findFirst({ where: { repertoireId, history } });
  if (existingCanonical) {
    if (hasOpeningState) {
      return prisma.repertoireNode.update({
        where: { id: existingCanonical.id },
        data: {
          eco: options.eco ?? null,
          openingName: options.openingName ?? null,
          openingMetadataStatus: options.openingMetadataStatus
        }
      });
    }
    return existingCanonical;
  }
  return prisma.$transaction(async tx => {
    const node = await tx.repertoireNode.create({
      data: {
        repertoireId,
        fullFen,
        positionKey,
        history,
        displayPgn: options.displayPgn ?? history,
        eco: options.eco ?? null,
        openingName: options.openingName ?? null,
        openingMetadataStatus: options.openingMetadataStatus ?? null,
        // DB.04 / S2.06: at creation both are the probability arriving down this route,
        // unless a cascade has already raised what arrives (HM.06: routeProb never includes it).
        routeProb,
        cumProb: options.cumProb ?? routeProb,
        siblingIndex: options.siblingIndex ?? null
      }
    });
    await claimPosition(tx, repertoireId, positionKey, node.id);
    return node;
  });
}

export async function createOpponentMove(data: {
  repertoireId: string,
  fromNodeId: string,
  toNodeId: string,
  san: string,
  uci?: string,
  moveProb?: number
}) {
  const [fromNode, toNode] = await Promise.all([
    prisma.repertoireNode.findUnique({ where: { id: data.fromNodeId } }),
    prisma.repertoireNode.findUnique({ where: { id: data.toNodeId } })
  ]);
  if (!fromNode || !toNode) throw new Error("OPPONENT source or destination node does not exist");
  if (fromNode.repertoireId !== toNode.repertoireId) throw new Error("OPPONENT cannot cross repertoires");
  if (data.repertoireId !== fromNode.repertoireId) throw new Error("OPPONENT repertoireId does not match source node repertoire");
  const chess = new Chess(fromNode.fullFen);
  let move;
  try { move = data.uci ? chess.move({ from: data.uci.slice(0, 2), to: data.uci.slice(2, 4), promotion: data.uci[4] }) : chess.move(data.san); }
  catch { throw new Error("Invalid OPPONENT move"); }
  if (!move || (data.uci && move.lan !== data.uci) || move.san !== data.san) throw new Error("Invalid OPPONENT UCI/SAN state");
  const resultingFullFen = parseFullFen(chess.fen());
  if (resultingFullFen !== toNode.fullFen) throw new Error("Invalid OPPONENT destination: resulting FullFen does not match toNode.fullFen");
  const complete = {
    repertoireId: fromNode.repertoireId, fromNodeId: data.fromNodeId, toNodeId: data.toNodeId,
    uci: move.lan, san: move.san, playerTurn: "OPPONENT", moveProb: data.moveProb ?? null
  };
  return prisma.repertoireMove.upsert({
    where: {
      fromNodeId_uci: {
        fromNodeId: data.fromNodeId,
        uci: move.lan
      }
    },
    update: complete,
    create: complete
  });
}

const NOT_REPETITION = { OR: [{ stopReason: null }, { stopReason: { not: "Repetition" } }] };

/** HM.04: a dropped move's node is only an ending, never a route owner or ancestor. */
export const NOT_TOO_RARE_NODE = { incomingMoves: { none: { stopReason: "Too rare" } } };

/**
 * What arrives at a node by every non-repetition route: each incoming White move
 * carries its source's cumProb times moveProb; a Black move carries its source's cumProb.
 * `tooRare` marks a dropped move's node, which holds what arrives in rareDropped (HM.23).
 */
export async function sumIncomingRouteProb(client: DbClient, nodeId: string) {
  const incoming = await client.repertoireMove.findMany({
    where: { toNodeId: nodeId, ...NOT_REPETITION },
    include: { fromNode: { select: { cumProb: true } } }
  });
  const sum = incoming.reduce((total, edge) => total + (edge.playerTurn === "OPPONENT"
    ? edge.fromNode.cumProb * (edge.moveProb ?? 0)
    : edge.fromNode.cumProb), 0);
  return { sum, count: incoming.length, tooRare: incoming.some(edge => edge.stopReason === "Too rare") };
}

/** Recompute every reachable route from canonical incoming-edge sums. */
export async function propagateRepertoireProbabilities(repertoireId: string, startNodeId: string) {
  return prisma.$transaction(async tx => {
    const start = await sumIncomingRouteProb(tx, startNodeId);
    if (start.count > 0) {
      await tx.repertoireNode.updateMany({
        where: { id: startNodeId, repertoireId },
        // HM.04: a dropped move's node keeps cumProb at 0; what arrives goes to rareDropped.
        data: start.tooRare ? { cumProb: 0, rareDropped: start.sum } : { cumProb: start.sum }
      });
      if (start.tooRare) return;
    }
    // This is the production form of the transposition cascade.  Keep it a
    // stack so the generator and the probability propagation agree on which
    // newly reached position is handled first.  The sum at each destination
    // is still computed from every incoming route, so changing traversal order
    // cannot create or lose probability.
    const pending = [startNodeId];
    const nodeCount = await tx.repertoireNode.count({ where: { repertoireId } });
    const maximumSteps = Math.max(1, nodeCount * nodeCount);
    let steps = 0;
    while (pending.length > 0) {
      if (++steps > maximumSteps) throw new Error("Repertoire probability graph did not converge");
      const sourceId = pending.pop()!;
      const source = await tx.repertoireNode.findUnique({ where: { id: sourceId } });
      if (!source || source.repertoireId !== repertoireId) continue;
      const outgoing = await tx.repertoireMove.findMany({ where: { fromNodeId: sourceId } });
      for (const edge of outgoing) {
        if (edge.stopReason === "Repetition") continue;
        if (edge.toNodeId === null) throw new Error("Non-repetition repertoire move is missing its destination");
        const { sum: cumProb, tooRare } = await sumIncomingRouteProb(tx, edge.toNodeId);
        const destination = await tx.repertoireNode.findUnique({ where: { id: edge.toNodeId } });
        if (destination && tooRare) {
          // HM.04: a cascade that reaches a dropped move adds to its rareDropped, and stops there.
          if (destination.rareDropped !== cumProb) {
            await tx.repertoireNode.update({ where: { id: destination.id }, data: { rareDropped: cumProb } });
          }
          continue;
        }
        if (destination && destination.cumProb !== cumProb) {
          await tx.repertoireNode.update({
            where: { id: destination.id },
            data: { cumProb }
          });
          pending.push(destination.id);
        }
      }
    }
  });
}

async function hasLocalDeepEvidence(fullFen: string, uci: string, evaluationProfile: string) {
  const [baseline, candidate] = await Promise.all([
    readLocalEngineBaseline(fullFen, evaluationProfile),
    readLocalEngineCandidate(fullFen, uci, evaluationProfile)
  ]);
  return { baseline, candidate, ok: baseline !== null && (baseline.bestUci === uci || candidate !== null) };
}

export async function createResponseMove(input: ResponsePersistenceInput) {
  validateResponsePersistence(input);
  const [fromNode, toNode] = await Promise.all([
    prisma.repertoireNode.findUnique({ where: { id: input.fromNodeId } }),
    input.toNodeId === null ? Promise.resolve(null) : prisma.repertoireNode.findUnique({ where: { id: input.toNodeId } })
  ]);
  if (!fromNode || (input.toNodeId !== null && !toNode)) throw new Error("RESPONSE source or destination node does not exist");
  if (toNode && fromNode.repertoireId !== toNode.repertoireId) throw new Error("RESPONSE cannot cross repertoires");
  if (input.deepVerified && !(await hasLocalDeepEvidence(fromNode.fullFen, input.uci, input.localEvaluationProfile!)).ok) {
    throw new Error("Invalid RESPONSE: compatible Local Deep evidence is missing");
  }
  const chess = new Chess(fromNode.fullFen);
  let move;
  try { move = chess.move({ from: input.uci.slice(0, 2), to: input.uci.slice(2, 4), promotion: input.uci[4] }); }
  catch { throw new Error(`Invalid RESPONSE: illegal UCI move ${input.uci}`); }
  if (!move || move.lan !== input.uci) throw new Error(`Invalid RESPONSE: illegal UCI move ${input.uci}`);
  if (input.san !== undefined && input.san !== null && input.san !== move.san) throw new Error("Invalid RESPONSE: SAN does not match UCI");
  const resultingFullFen = parseFullFen(chess.fen());
  if (toNode && resultingFullFen !== toNode.fullFen) throw new Error("Invalid RESPONSE destination: resulting FullFen does not match toNode.fullFen");
  if (input.stopReason === "Repetition") {
    const repeatedAncestor = await prisma.repertoireNode.findFirst({
      where: { repertoireId: fromNode.repertoireId, positionKey: positionKeyFromFen(resultingFullFen) }
    });
    if (!repeatedAncestor || !(repeatedAncestor.history === "" || fromNode.history.startsWith(`${repeatedAncestor.history} `))) {
      throw new Error("Invalid RESPONSE repetition: resulting position is not an ancestor on this route");
    }
  }
  const complete = {
    repertoireId: fromNode.repertoireId, fromNodeId: input.fromNodeId, toNodeId: input.toNodeId,
    uci: input.uci, san: move.san, playerTurn: "RESPONSE", moveProb: null,
    stopReason: input.stopReason ?? null,
    mastersGames: input.mastersGames ?? null, eliteGames: input.eliteGames ?? null,
    weightedGames: input.weightedGames ?? null,
    totalMastersGames: input.totalMastersGames ?? null, mastersMoveShare: input.mastersMoveShare ?? null,
    totalEliteGames: input.totalEliteGames ?? null, eliteMoveShare: input.eliteMoveShare ?? null,
    cp: input.cp, mate: input.mate, source: input.source,
    selectionMethod: input.selectionMethod, moveOrigin: input.moveOrigin,
    engineRank: input.engineRank ?? null, deepVerified: input.deepVerified
  };
  return prisma.$transaction(async tx => {
    // DB.09: one RESPONSE per position.
    const existing = await tx.repertoireMove.findFirst({ where: { fromNodeId: input.fromNodeId, playerTurn: "RESPONSE" } });
    if (existing) return tx.repertoireMove.update({ where: { id: existing.id }, data: complete });
    return tx.repertoireMove.create({ data: complete });
  });
}

export async function markResponseDeepVerified(input: {
  responseId: string;
  expectedUci: string;
  expectedFullFen: string;
  localEvaluationProfile: string;
  expectedBaseline: { uci: string; cp: number | null; mate: number | null };
  expectedCandidate: { uci: string; cp: number | null; mate: number | null };
}) {
  const response = await prisma.repertoireMove.findUnique({
    where: { id: input.responseId },
    include: { fromNode: true }
  });
  if (!response || response.playerTurn !== "RESPONSE") throw new Error("DV pass persistence: RESPONSE no longer exists");
  if (response.uci !== input.expectedUci || response.fromNode.fullFen !== input.expectedFullFen) {
    throw new Error("DV pass persistence: RESPONSE changed after verification");
  }
  validateResponsePersistence({
    fromNodeId: response.fromNodeId,
    toNodeId: response.toNodeId,
    uci: response.uci,
    san: response.san,
    cp: response.cp,
    mate: response.mate,
    source: response.source as ResponseEvaluationSource,
    selectionMethod: response.selectionMethod as ResponseSelectionMethod,
    moveOrigin: response.moveOrigin as ResponseMoveOrigin,
    deepVerified: false,
    localEvaluationProfile: null,
    weightedGames: response.weightedGames,
    stopReason: response.stopReason as ResponsePersistenceInput["stopReason"]
  });
  const { baseline, candidate } = await hasLocalDeepEvidence(input.expectedFullFen, input.expectedUci, input.localEvaluationProfile);
  const baselineMatches = baseline !== null && baseline.bestUci === input.expectedBaseline.uci &&
    baseline.cp === input.expectedBaseline.cp && baseline.mate === input.expectedBaseline.mate;
  const candidateMatches = input.expectedBaseline.uci === input.expectedUci
    ? input.expectedCandidate.uci === input.expectedUci && input.expectedCandidate.cp === input.expectedBaseline.cp && input.expectedCandidate.mate === input.expectedBaseline.mate
    : candidate !== null && candidate.candidateUci === input.expectedCandidate.uci && candidate.cp === input.expectedCandidate.cp && candidate.mate === input.expectedCandidate.mate;
  if (!baselineMatches || !candidateMatches || input.expectedCandidate.uci !== input.expectedUci) {
    throw new Error("DV pass persistence: compatible Local Deep evidence is missing");
  }
  const update = await prisma.repertoireMove.updateMany({
    where: { id: input.responseId, uci: input.expectedUci, deepVerified: false },
    data: { deepVerified: true }
  });
  if (update.count !== 1) throw new Error("DV pass persistence: RESPONSE changed concurrently");
  return prisma.repertoireMove.findUniqueOrThrow({ where: { id: input.responseId } });
}

/** Compatibility API for existing OPPONENT callers only. */
export async function createRepertoireMove(data: Parameters<typeof createOpponentMove>[0] & { playerTurn: string }) {
  if (data.playerTurn !== "OPPONENT") throw new Error("Use createResponseMove for complete RESPONSE persistence");
  const { playerTurn: _playerTurn, ...opponent } = data;
  return createOpponentMove(opponent);
}
