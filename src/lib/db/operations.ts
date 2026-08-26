import { PrismaClient } from "@prisma/client";
import { Chess } from "chess.js";
import { fetchWikibooksSnippet } from "../api/wikibooks";
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

export async function getOrCreatePositionCache(fen: string, openingMetadata?: { eco: string, name: string }, history?: string[]) {
  const normFen = positionKeyFromFen(parseFullFen(fen));
  let pos = await prisma.positionCache.findUnique({ where: { fen: normFen } });
  
  if (!pos) { 
    let wikiText = null;
    if (history && history.length > 0) {
       wikiText = await fetchWikibooksSnippet(history);
    }
    pos = await prisma.positionCache.create({ 
      data: { 
        fen: normFen,
        eco: openingMetadata?.eco || null,
        openingName: openingMetadata?.name || null,
        wikiText: wikiText
      } 
    }); 
  } else if (openingMetadata && openingMetadata.name && !pos.openingName) {
    let wikiText = pos.wikiText;
    if (!wikiText && history && history.length > 0) {
       wikiText = await fetchWikibooksSnippet(history);
    }
    
    pos = await prisma.positionCache.update({
      where: { fen: normFen },
      data: {
        eco: openingMetadata.eco,
        openingName: openingMetadata.name,
        wikiText: wikiText
      }
    });
  }
  return pos;
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

export async function createRepertoireMove(data: {
  repertoireId: string,
  fromNodeId: string,
  toNodeId: string,
  san: string,
  playerTurn: string,
  prob?: number,
  trueProbability?: number,
  weightedCount?: number,
  lichessCp?: number,
  chessdbCp?: number,
  engineSource?: string
}) {
  return prisma.repertoireMove.upsert({
    where: {
      fromNodeId_san: {
        fromNodeId: data.fromNodeId,
        san: data.san
      }
    },
    update: data,
    create: data
  });
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
