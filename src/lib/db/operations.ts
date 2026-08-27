import { PrismaClient } from "@prisma/client";
import { Chess } from "chess.js";
import { fetchWikibooksSnippet, type WikibooksResult } from "../api/wikibooks";
import { parseFullFen, positionKeyFromFen } from "../core/fen";
import { isValidUciMove } from "../core/uci";

export const prisma = new PrismaClient();

export async function getOrCreatePosition(rawFen: string) {
  const fullFen = parseFullFen(rawFen);
  const positionKey = positionKeyFromFen(fullFen);

  return prisma.position.upsert({
    where: { positionKey },
    update: {},
    create: { positionKey }
  });
}

export async function getOrCreatePositionCache(fen: string, openingMetadata?: { eco: string, name: string }, _legacyHistory?: string[]) {
  const normFen = positionKeyFromFen(parseFullFen(fen));
  let pos = await prisma.positionCache.findUnique({ where: { fen: normFen } });
  
  if (!pos) { 
    pos = await prisma.positionCache.create({ 
      data: { 
        fen: normFen,
        eco: openingMetadata?.eco || null,
        openingName: openingMetadata?.name || null
      } 
    }); 
  } else if (openingMetadata && openingMetadata.name) {
    pos = await prisma.positionCache.update({
      where: { fen: normFen },
      data: {
        eco: openingMetadata.eco,
        openingName: openingMetadata.name
      }
    });
  }
  return pos;
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
    return { status: "CACHED" as const, text: node.wikiText };
  }
  if (node.pgn.trim() !== node.pgn) {
    throw new Error("Cannot enrich RepertoireNode with non-canonical PGN history");
  }

  const result = await fetcher(node.pgn === "" ? [] : node.pgn.split(/\s+/));
  if (result.status === "TECHNICAL_FAILURE") return result;

  const wikiText = result.status === "DESCRIPTION" ? result.text : null;
  if (wikiText !== null && (wikiText.trim() !== wikiText || wikiText.length === 0)) {
    throw new Error("Invalid Wikibooks description persistence result");
  }
  const update = await prisma.repertoireNode.updateMany({
    where: { id: node.id, wikibooksChecked: false, wikiText: null },
    data: { wikibooksChecked: true, wikiText }
  });
  if (update.count !== 1) {
    const current = await prisma.repertoireNode.findUnique({ where: { id: node.id } });
    if (!current) throw new Error(`RepertoireNode ${node.id} disappeared during Wikibooks persistence`);
    validateRepertoireNodeWikibooksState(current);
    if (!current.wikibooksChecked) throw new Error("RepertoireNode Wikibooks state changed concurrently");
  }
  return result;
}

export type ExplorerMoveRow = {
  uci: string;
  san: string;
  games: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
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

export async function saveHumanExplorerBucket(snapshotId: string, positionKey: string, databaseType: HumanDatabaseType, moves: ExplorerMoveRow[]) {
  validateDatabaseType(databaseType);
  validateExplorerMoveRows(moves);

  return prisma.$transaction(async (tx) => {
    await tx.explorerMoveCache.deleteMany({
      where: { snapshotId, positionKey, databaseType }
    });

    if (moves.length > 0) {
      await tx.explorerMoveCache.createMany({
        data: moves.map(m => ({
          snapshotId,
          positionKey,
          databaseType,
          ...m
        }))
      });
    }

    await tx.humanExplorerFetch.upsert({
      where: {
        snapshotId_positionKey_databaseType: {
          snapshotId,
          positionKey,
          databaseType
        }
      },
      update: {},
      create: {
        snapshotId,
        positionKey,
        databaseType
      }
    });
  });
}

export type ReadHumanExplorerBucketResult =
  | { status: "missing" }
  | { status: "empty" }
  | { status: "success", moves: (ExplorerMoveRow & { id: string })[] };

export async function readHumanExplorerBucket(snapshotId: string, positionKey: string, databaseType: HumanDatabaseType): Promise<ReadHumanExplorerBucketResult> {
  validateDatabaseType(databaseType);

  const fetchMarker = await prisma.humanExplorerFetch.findUnique({
    where: { snapshotId_positionKey_databaseType: { snapshotId, positionKey, databaseType } }
  });

  if (!fetchMarker) return { status: "missing" };

  const rows = await prisma.explorerMoveCache.findMany({
    where: { snapshotId, positionKey, databaseType }
  });

  if (rows.length === 0) return { status: "empty" };

  return { status: "success", moves: rows };
}

export type RemoteEngineSource = "LICHESS" | "CHESSDB";

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
  return evaluations.map(evaluation => {
    if (!evaluation || typeof evaluation !== "object") {
      throw new Error("Invalid remote engine result: evaluation must be an object");
    }
    if (!isValidUciMove(evaluation.uci)) {
      throw new Error("Invalid remote engine result: malformed UCI/LAN move");
    }
    if (seenUci.has(evaluation.uci)) {
      throw new Error(`Invalid remote engine result: duplicate UCI move ${evaluation.uci}`);
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

    return { ...evaluation, san: parsedMove.san };
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
    const fetch = await tx.remoteEngineFetch.upsert({
      where: { fullFen_source_evaluationProfile: { fullFen, source, evaluationProfile } },
      update: { fetchedAt: new Date() },
      create: { fullFen, source, evaluationProfile }
    });

    await tx.remoteEngineEvalCache.deleteMany({ where: { fetchId: fetch.id } });
    if (validated.length > 0) {
      await tx.remoteEngineEvalCache.createMany({
        data: validated.map(evaluation => ({
          fetchId: fetch.id,
          uci: evaluation.uci,
          san: evaluation.san,
          cp: evaluation.cp,
          mate: evaluation.mate
        }))
      });
    }

    return fetch;
  });
}

export type ReadRemoteEngineResult =
  | { status: "missing" }
  | { status: "empty", fetch: { id: string; fullFen: string; source: string; evaluationProfile: string; fetchedAt: Date } }
  | { status: "success", fetch: { id: string; fullFen: string; source: string; evaluationProfile: string; fetchedAt: Date }, evaluations: Array<RemoteEngineEvaluation & { id: string; fetchId: string; san: string | null }> };

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

  const fetch = await prisma.remoteEngineFetch.findUnique({
    where: { fullFen_source_evaluationProfile: { fullFen, source, evaluationProfile } },
    include: { evaluations: { orderBy: { uci: "asc" } } }
  });
  if (!fetch) return { status: "missing" };

  const { evaluations, ...fetchMarker } = fetch;
  if (evaluations.length === 0) return { status: "empty", fetch: fetchMarker };
  return { status: "success", fetch: fetchMarker, evaluations };
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

export const RESPONSE_EVALUATION_SOURCES = ["Lichess Cloud Evaluation", "ChessDB", "Local Deep Stockfish"] as const;
export const RESPONSE_SELECTION_METHODS = ["Ordinary API", "Corrected after Deep Verification", "Local Engine Fallback", "Hardcoded Opening"] as const;
export const RESPONSE_MOVE_ORIGINS = ["Human Move", "Engine Move", "Hardcoded Move"] as const;
export type ResponseEvaluationSource = typeof RESPONSE_EVALUATION_SOURCES[number];
export type ResponseSelectionMethod = typeof RESPONSE_SELECTION_METHODS[number];
export type ResponseMoveOrigin = typeof RESPONSE_MOVE_ORIGINS[number];
export type ResponsePersistenceInput = {
  fromNodeId: string; toNodeId: string; uci: string; san?: string | null;
  cp: number | null; mate: number | null; source: ResponseEvaluationSource;
  selectionMethod: ResponseSelectionMethod; moveOrigin: ResponseMoveOrigin;
  deepVerified: boolean; localEvaluationProfile: string | null; weightedCount?: number | null;
};

function isNonEmptyCanonicalString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

export function validateResponsePersistence(input: ResponsePersistenceInput): void {
  if (!RESPONSE_EVALUATION_SOURCES.includes(input.source as ResponseEvaluationSource)) throw new Error("Invalid RESPONSE source");
  if (!RESPONSE_SELECTION_METHODS.includes(input.selectionMethod as ResponseSelectionMethod)) throw new Error("Invalid RESPONSE selectionMethod");
  if (!RESPONSE_MOVE_ORIGINS.includes(input.moveOrigin as ResponseMoveOrigin)) throw new Error("Invalid RESPONSE moveOrigin");
  if (!isValidUciMove(input.uci)) throw new Error("Invalid RESPONSE UCI/LAN move");
  const hasCp = typeof input.cp === "number" && Number.isFinite(input.cp);
  const hasMate = typeof input.mate === "number" && Number.isInteger(input.mate) && input.mate !== 0;
  if (!((hasCp && input.mate === null) || (input.cp === null && hasMate))) throw new Error("Invalid RESPONSE evaluation: exactly one of finite cp or non-zero integer mate is required");
  if (typeof input.deepVerified !== "boolean") throw new Error("Invalid RESPONSE deepVerified value");
  if (input.deepVerified && !isNonEmptyCanonicalString(input.localEvaluationProfile)) throw new Error("Invalid RESPONSE: deepVerified requires localEvaluationProfile");
  if (input.localEvaluationProfile !== null && !isNonEmptyCanonicalString(input.localEvaluationProfile)) throw new Error("Invalid RESPONSE localEvaluationProfile");
  if (input.weightedCount !== undefined && input.weightedCount !== null &&
      (typeof input.weightedCount !== "number" || !Number.isFinite(input.weightedCount) || input.weightedCount < 0)) throw new Error("Invalid RESPONSE weightedCount");
}

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

export async function saveLocalEngineBaseline(
  fullFen: string,
  evaluationProfile: string,
  evaluation: LocalEngineEvaluation
) {
  const validated = validateLocalEngineEvaluation(fullFen, evaluationProfile, evaluation);
  return prisma.$transaction(async tx => {
    const previous = await tx.localEngineBaseline.findUnique({ where: { fullFen_evaluationProfile: { fullFen, evaluationProfile } } });
    const changed = previous !== null && (previous.bestUci !== validated.uci || previous.cp !== validated.cp || previous.mate !== validated.mate);
    const saved = await tx.localEngineBaseline.upsert({
    where: { fullFen_evaluationProfile: { fullFen, evaluationProfile } },
    update: {
      bestUci: validated.uci,
      san: validated.san,
      cp: validated.cp,
      mate: validated.mate,
      analysedAt: new Date()
    },
    create: {
      fullFen,
      evaluationProfile,
      bestUci: validated.uci,
      san: validated.san,
      cp: validated.cp,
      mate: validated.mate
    }
    });
    if (changed) await tx.repertoireMove.updateMany({
      where: { playerTurn: "RESPONSE", deepVerified: true, localEvaluationProfile: evaluationProfile, fromNode: { fullFen } },
      data: { deepVerified: false }
    });
    return saved;
  });
}

export async function readLocalEngineBaseline(fullFen: string, evaluationProfile: string) {
  validateLocalEngineIdentity(fullFen, evaluationProfile);
  const row = await prisma.localEngineBaseline.findUnique({
    where: { fullFen_evaluationProfile: { fullFen, evaluationProfile } }
  });
  if (!row) return null;
  const evaluation = validateLocalEngineEvaluation(fullFen, evaluationProfile, {
    uci: row.bestUci,
    san: row.san,
    cp: row.cp,
    mate: row.mate
  });
  return { ...row, ...evaluation };
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
    const previous = await tx.localEngineCandidate.findUnique({ where: { fullFen_candidateUci_evaluationProfile: { fullFen, candidateUci, evaluationProfile } } });
    const changed = previous !== null && (previous.cp !== validated.cp || previous.mate !== validated.mate);
    const saved = await tx.localEngineCandidate.upsert({
    where: { fullFen_candidateUci_evaluationProfile: { fullFen, candidateUci, evaluationProfile } },
    update: {
      san: validated.san,
      cp: validated.cp,
      mate: validated.mate,
      analysedAt: new Date()
    },
    create: {
      fullFen,
      candidateUci,
      evaluationProfile,
      san: validated.san,
      cp: validated.cp,
      mate: validated.mate
    }
    });
    if (changed) await tx.repertoireMove.updateMany({
      where: { playerTurn: "RESPONSE", uci: candidateUci, deepVerified: true, localEvaluationProfile: evaluationProfile, fromNode: { fullFen } },
      data: { deepVerified: false }
    });
    return saved;
  });
}

export async function readLocalEngineCandidate(fullFen: string, candidateUci: string, evaluationProfile: string) {
  validateLocalEngineIdentity(fullFen, evaluationProfile);
  if (!isValidUciMove(candidateUci)) throw new Error("Invalid Local Engine candidate identity");
  const row = await prisma.localEngineCandidate.findUnique({
    where: { fullFen_candidateUci_evaluationProfile: { fullFen, candidateUci, evaluationProfile } }
  });
  if (!row) return null;
  const evaluation = validateLocalEngineEvaluation(fullFen, evaluationProfile, {
    uci: row.candidateUci,
    san: row.san,
    cp: row.cp,
    mate: row.mate
  }, candidateUci);
  return { ...row, ...evaluation };
}

export async function getRepertoireNode(repertoireId: string, pgn: string) {
  return prisma.repertoireNode.findUnique({
    where: {
      repertoireId_pgn: {
        repertoireId,
        pgn
      }
    }
  });
}

export async function createRepertoireNode(repertoireId: string, rawFen: string, pgn: string, cumulativeProb: number) {
  const fullFen = parseFullFen(rawFen);
  const positionKey = positionKeyFromFen(fullFen);

  await getOrCreatePosition(fullFen);

  return prisma.repertoireNode.create({
    data: {
      repertoireId,
      fullFen,
      positionKey,
      pgn,
      cumulativeProb
    }
  });
}

export async function createOpponentMove(data: {
  repertoireId: string,
  fromNodeId: string,
  toNodeId: string,
  san: string,
  uci?: string,
  prob?: number,
  trueProbability?: number
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
  const complete = { ...data, repertoireId: fromNode.repertoireId, uci: move.lan, san: move.san, playerTurn: "OPPONENT", weightedCount: null, cp: null, mate: null, source: null, selectionMethod: null, moveOrigin: null, deepVerified: false, localEvaluationProfile: null };
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

export async function createResponseMove(input: ResponsePersistenceInput) {
  validateResponsePersistence(input);
  const [fromNode, toNode] = await Promise.all([
    prisma.repertoireNode.findUnique({ where: { id: input.fromNodeId } }),
    prisma.repertoireNode.findUnique({ where: { id: input.toNodeId } })
  ]);
  if (!fromNode || !toNode) throw new Error("RESPONSE source or destination node does not exist");
  if (fromNode.repertoireId !== toNode.repertoireId) throw new Error("RESPONSE cannot cross repertoires");
  if (input.deepVerified) {
    const [baseline, candidate] = await Promise.all([
      prisma.localEngineBaseline.findUnique({ where: { fullFen_evaluationProfile: { fullFen: fromNode.fullFen, evaluationProfile: input.localEvaluationProfile! } } }),
      prisma.localEngineCandidate.findUnique({ where: { fullFen_candidateUci_evaluationProfile: { fullFen: fromNode.fullFen, candidateUci: input.uci, evaluationProfile: input.localEvaluationProfile! } } })
    ]);
    if (!baseline || (baseline.bestUci !== input.uci && !candidate)) throw new Error("Invalid RESPONSE: compatible Local Deep evidence is missing");
  }
  const chess = new Chess(fromNode.fullFen);
  let move;
  try { move = chess.move({ from: input.uci.slice(0, 2), to: input.uci.slice(2, 4), promotion: input.uci[4] }); }
  catch { throw new Error(`Invalid RESPONSE: illegal UCI move ${input.uci}`); }
  if (!move || move.lan !== input.uci) throw new Error(`Invalid RESPONSE: illegal UCI move ${input.uci}`);
  if (input.san !== undefined && input.san !== null && input.san !== move.san) throw new Error("Invalid RESPONSE: SAN does not match UCI");
  const resultingFullFen = parseFullFen(chess.fen());
  if (resultingFullFen !== toNode.fullFen) throw new Error("Invalid RESPONSE destination: resulting FullFen does not match toNode.fullFen");
  const complete = {
    repertoireId: fromNode.repertoireId, fromNodeId: input.fromNodeId, toNodeId: input.toNodeId,
    uci: input.uci, san: move.san, playerTurn: "RESPONSE", prob: null, trueProbability: null,
    weightedCount: input.weightedCount ?? null, cp: input.cp, mate: input.mate, source: input.source,
    selectionMethod: input.selectionMethod, moveOrigin: input.moveOrigin, deepVerified: input.deepVerified,
    localEvaluationProfile: input.localEvaluationProfile
  };
  return prisma.$transaction(async tx => {
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
  return prisma.$transaction(async tx => {
    const response = await tx.repertoireMove.findUnique({
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
      localEvaluationProfile: response.localEvaluationProfile,
      weightedCount: response.weightedCount
    });
    const baseline = await tx.localEngineBaseline.findUnique({
      where: { fullFen_evaluationProfile: { fullFen: input.expectedFullFen, evaluationProfile: input.localEvaluationProfile } }
    });
    const candidate = await tx.localEngineCandidate.findUnique({
      where: { fullFen_candidateUci_evaluationProfile: { fullFen: input.expectedFullFen, candidateUci: input.expectedUci, evaluationProfile: input.localEvaluationProfile } }
    });
    const baselineMatches = baseline !== null && baseline.bestUci === input.expectedBaseline.uci &&
      baseline.cp === input.expectedBaseline.cp && baseline.mate === input.expectedBaseline.mate;
    const candidateMatches = input.expectedBaseline.uci === input.expectedUci
      ? input.expectedCandidate.uci === input.expectedUci && input.expectedCandidate.cp === input.expectedBaseline.cp && input.expectedCandidate.mate === input.expectedBaseline.mate
      : candidate !== null && candidate.candidateUci === input.expectedCandidate.uci && candidate.cp === input.expectedCandidate.cp && candidate.mate === input.expectedCandidate.mate;
    if (!baselineMatches || !candidateMatches || input.expectedCandidate.uci !== input.expectedUci) {
      throw new Error("DV pass persistence: compatible Local Deep evidence is missing");
    }
    const update = await tx.repertoireMove.updateMany({
      where: { id: input.responseId, uci: input.expectedUci, deepVerified: false },
      data: { deepVerified: true, localEvaluationProfile: input.localEvaluationProfile }
    });
    if (update.count !== 1) throw new Error("DV pass persistence: RESPONSE changed concurrently");
    return tx.repertoireMove.findUniqueOrThrow({ where: { id: input.responseId } });
  });
}

/** Compatibility API for existing OPPONENT callers only. */
export async function createRepertoireMove(data: Parameters<typeof createOpponentMove>[0] & { playerTurn: string }) {
  if (data.playerTurn !== "OPPONENT") throw new Error("Use createResponseMove for complete RESPONSE persistence");
  const { playerTurn: _playerTurn, ...opponent } = data;
  return createOpponentMove(opponent);
}

export async function getCompatibleHumanDataSnapshot(repertoireId: string, explorerRequestProfile: string) {
  return prisma.humanDataSnapshot.findFirst({
    where: {
      repertoireId,
      explorerRequestProfile
    },
    orderBy: {
      startedAt: 'desc'
    }
  });
}

export async function getOrCreateHumanDataSnapshot(repertoireId: string, explorerRequestProfile: string) {
  const existing = await getCompatibleHumanDataSnapshot(repertoireId, explorerRequestProfile);
  if (existing) {
    return existing;
  }
  return createHumanDataSnapshot(repertoireId, explorerRequestProfile);
}

export async function createHumanDataSnapshot(repertoireId: string, explorerRequestProfile: string) {
  return prisma.humanDataSnapshot.create({
    data: {
      repertoireId,
      explorerRequestProfile
    }
  });
}

export type HumanDatabaseType = "MASTERS" | "ELITE" | "AMATEUR";

function validateDatabaseType(dbType: string): asserts dbType is HumanDatabaseType {
  if (dbType !== "MASTERS" && dbType !== "ELITE" && dbType !== "AMATEUR") {
    throw new Error(`Invalid human database type: ${dbType}`);
  }
}

export async function checkHumanExplorerFetch(snapshotId: string, positionKey: string, databaseType: HumanDatabaseType) {
  validateDatabaseType(databaseType);
  return prisma.humanExplorerFetch.findUnique({
    where: {
      snapshotId_positionKey_databaseType: {
        snapshotId,
        positionKey,
        databaseType
      }
    }
  });
}

export async function recordHumanExplorerFetch(snapshotId: string, positionKey: string, databaseType: HumanDatabaseType) {
  validateDatabaseType(databaseType);
  return prisma.humanExplorerFetch.upsert({
    where: {
      snapshotId_positionKey_databaseType: {
        snapshotId,
        positionKey,
        databaseType
      }
    },
    update: {},
    create: {
      snapshotId,
      positionKey,
      databaseType
    }
  });
}

export async function getHumanExplorerFetchesForPosition(snapshotId: string, positionKey: string) {
  return prisma.humanExplorerFetch.findMany({
    where: {
      snapshotId,
      positionKey
    }
  });
}
