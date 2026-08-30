import { fetchWithRetry } from './retry';
import { readHumanExplorerBucket, saveHumanExplorerBucket, ExplorerMoveRow, HumanDatabaseType } from '../db/operations';
import { parseFullFen, positionKeyFromFen } from '../core/fen';
import { defaultConfig } from '../core/config';
import { Chess } from 'chess.js';

type PublicExplorerMove = {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  games: number;
};

function toPublicMove(move: ExplorerMoveRow): PublicExplorerMove {
  return {
    uci: move.uci,
    san: move.san,
    white: move.whiteWins,
    draws: move.draws,
    black: move.blackWins,
    games: move.games
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

export async function fetchAllDatabases(
  fen: string,
  snapshotId: string,
  requestedBuckets: readonly HumanDatabaseType[] = ["MASTERS", "ELITE", "AMATEUR"]
) {
  const fullFen = parseFullFen(fen);
  const posKey = positionKeyFromFen(fullFen);

  async function processBucket(
    dbType: HumanDatabaseType,
    url: string,
    retryCount: number
  ) {
    const cached = await readHumanExplorerBucket(snapshotId, posKey, dbType);
    if (cached.status === "success" || cached.status === "empty") {
      const moves = cached.status === "success" ? cached.moves.map(toPublicMove) : [];
      const totalGames = moves.reduce((sum, m) => sum + m.games, 0);
      return { moves, totalGames, opening: null, retrieval: "CACHE" as const };
    }

    const data = await fetchWithRetry(url, retryCount, true, "explorer");
    if (!data) {
      throw new Error(`Required Lichess Explorer ${dbType} request failed for position ${posKey}`);
    }

    const chess = new Chess(fullFen);
    const validMoves: ExplorerMoveRow[] = [];

    if (!data || typeof data !== "object") {
      throw new Error("Invalid source result: response is not an object");
    }

    if (!Array.isArray(data.moves)) {
      throw new Error("Invalid source result: moves is missing or not an array");
    }

    for (const sourceMove of data.moves) {
      if (!sourceMove || typeof sourceMove !== "object") {
        throw new Error("Invalid source result: move is not an object");
      }

      const m = sourceMove as Record<string, unknown>;
      if (typeof m.san !== "string" || m.san.trim() === "") {
        throw new Error("Invalid source result: move has empty SAN");
      }

      if (!isNonNegativeInteger(m.white) ||
          !isNonNegativeInteger(m.draws) ||
          !isNonNegativeInteger(m.black)) {
        throw new Error("Invalid source result: invalid statistic counts");
      }

      const white = m.white;
      const draws = m.draws;
      const black = m.black;
      const total = white + draws + black;
      let uci = "";
      try {
        const cMove = chess.move(m.san);
        if (!cMove) throw new Error("Invalid move");
        uci = cMove.lan;
        chess.undo();
      } catch {
        throw new Error(`Invalid move ${m.san} for ${fullFen}`);
      }

      validMoves.push({
        uci,
        san: m.san,
        games: total,
        whiteWins: white,
        draws,
        blackWins: black
      });
    }

    await saveHumanExplorerBucket(snapshotId, posKey, dbType, validMoves);

    const returnedMoves = validMoves.map(toPublicMove);
    const totalGames = returnedMoves.reduce((sum, m) => sum + m.games, 0);
    return { moves: returnedMoves, totalGames, opening: data.opening || null, retrieval: "FRESH" as const };
  }

  const mastersUrl = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fullFen)}`;
  const skippedBucket = () => ({ moves: [], totalGames: 0, opening: null, retrieval: "SKIPPED" as const });
  const mRes = requestedBuckets.includes("MASTERS")
    ? await processBucket("MASTERS", mastersUrl, defaultConfig.api.lichessExplorer.retryAttempts)
    : skippedBucket();

  const eliteSpeeds = defaultConfig.humanExplorerRequest.elite.speeds.join(',');
  const eliteRatings = defaultConfig.humanExplorerRequest.elite.ratings.join(',');
  const eliteUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(fullFen)}&speeds=${eliteSpeeds}&ratings=${eliteRatings}`;
  const eRes = requestedBuckets.includes("ELITE")
    ? await processBucket("ELITE", eliteUrl, defaultConfig.api.lichessExplorer.retryAttempts)
    : skippedBucket();

  const amateurSpeeds = defaultConfig.humanExplorerRequest.amateur.speeds.join(',');
  const amateurRatings = defaultConfig.humanExplorerRequest.amateur.ratings.join(',');
  const amateurUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(fullFen)}&speeds=${amateurSpeeds}&ratings=${amateurRatings}`;
  const aRes = requestedBuckets.includes("AMATEUR")
    ? await processBucket("AMATEUR", amateurUrl, defaultConfig.api.lichessExplorer.retryAttempts)
    : skippedBucket();

  return [mRes, eRes, aRes];
}

export async function fetchMastersOpeningMetadata(fen: string) {
  const fullFen = parseFullFen(fen);
  const url = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fullFen)}`;
  const data = await fetchWithRetry(url, defaultConfig.api.lichessExplorer.retryAttempts, true, "explorer");
  if (!data || typeof data !== "object") {
    throw new Error(`Required Lichess Explorer MASTERS metadata request failed for position ${positionKeyFromFen(fullFen)}`);
  }
  if (!Array.isArray((data as Record<string, unknown>).moves)) {
    throw new Error("Invalid Masters opening metadata response: moves is missing or not an array");
  }
  const opening = (data as Record<string, unknown>).opening;
  if (opening === undefined || opening === null) return null;
  if (typeof opening !== "object") throw new Error("Invalid Masters opening metadata: opening is not an object");
  const record = opening as Record<string, unknown>;
  if (typeof record.eco !== "string" || record.eco.trim() === "" ||
      typeof record.name !== "string" || record.name.trim() === "") {
    throw new Error("Invalid Masters opening metadata: ECO and name must both be non-empty strings");
  }
  return { eco: record.eco, name: record.name };
}
