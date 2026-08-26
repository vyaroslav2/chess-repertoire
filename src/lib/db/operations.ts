import { PrismaClient } from "@prisma/client";
import { fetchWikibooksSnippet } from "../api/wikibooks";
import { parseFullFen, positionKeyFromFen } from "../core/fen";

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

    const uciIsShaped = typeof move.uci === "string" &&
      /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move.uci) &&
      move.uci.slice(0, 2) !== move.uci.slice(2, 4) &&
      (move.uci.length === 4 ||
        (move.uci[1] === "7" && move.uci[3] === "8") ||
        (move.uci[1] === "2" && move.uci[3] === "1"));
    if (!uciIsShaped) {
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

export async function saveEngineEvalCache(fen: string, source: string, evalData: { san: string, cp: number, mate: number | null, rank: number }) {
  const normFen = positionKeyFromFen(parseFullFen(fen));
  return prisma.engineEvalCache.upsert({
    where: {
      positionId_san_source: {
        positionId: normFen,
        san: evalData.san,
        source: source
      }
    },
    update: {
      cp: evalData.cp,
      mate: evalData.mate,
      rank: evalData.rank
    },
    create: {
      positionId: normFen,
      san: evalData.san,
      cp: evalData.cp,
      mate: evalData.mate,
      rank: evalData.rank,
      source: source
    }
  });
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

export async function createRepertoireNode(repertoireId: string, rawFen: string, pgn: string, cumulativeProb: number, isAmateurTrap: boolean = false, isMasterThreat: boolean = false) {
  const fullFen = parseFullFen(rawFen);
  const positionKey = positionKeyFromFen(fullFen);

  await getOrCreatePosition(fullFen);

  return prisma.repertoireNode.create({
    data: {
      repertoireId,
      fullFen,
      positionKey,
      pgn,
      cumulativeProb,
      isAmateurTrap,
      isMasterThreat
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
