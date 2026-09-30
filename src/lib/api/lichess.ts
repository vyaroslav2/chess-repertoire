import { lichessHeaders, requestApi } from './retry';
import { readExplorerCache, saveExplorerCache, ExplorerMoveRow, HumanDatabaseType } from '../db/operations';
import { parseFullFen, positionKeyFromFen } from '../core/fen';
import { computeExplorerCacheProfile, defaultConfig } from '../core/config';
import { Chess } from 'chess.js';

type PublicExplorerMove = {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  games: number;
};

export type ExplorerOpening = { eco: string; name: string };

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

function toOpening(eco: string | null, openingName: string | null): ExplorerOpening | null {
  return eco !== null && openingName !== null ? { eco, name: openingName } : null;
}

function parseOpening(opening: unknown): ExplorerOpening | null {
  if (opening === undefined || opening === null) return null;
  if (typeof opening !== "object") throw new Error("Invalid source result: opening is not an object");
  const record = opening as Record<string, unknown>;
  if (typeof record.eco !== "string" || record.eco.trim() === "" ||
      typeof record.name !== "string" || record.name.trim() === "") {
    throw new Error("Invalid source result: opening ECO and name must both be non-empty strings");
  }
  return { eco: record.eco, name: record.name };
}

/**
 * EX.05: the games of all returned moves against the position's own total.
 * Returns the share of games with no move. Only the Amateur shortfall is recorded
 * as unaccountedDropped; for Masters and Elite the warning is all.
 */
export function checkExplorerGameCounts(
  dbType: HumanDatabaseType,
  totalGames: number,
  positionTotalGames: number
): number {
  if (totalGames > positionTotalGames) {
    throw new Error(`Explorer ${dbType} move counts (${totalGames} games) are more than the position's total games (${positionTotalGames}).`);
  }
  if (totalGames === positionTotalGames) return 0;
  const missing = positionTotalGames - totalGames;
  const missingShare = missing / positionTotalGames;
  console.log(`[WARNING] Explorer move counts do not add up to the position's total games. Missing: ${missing} games (${(missingShare * 100).toFixed(2)}%).`);
  return dbType === "AMATEUR" ? missingShare : 0;
}

export async function fetchAllDatabases(
  fen: string,
  requestedBuckets: readonly HumanDatabaseType[] = ["MASTERS", "ELITE", "AMATEUR"]
) {
  const fullFen = parseFullFen(fen);
  const posKey = positionKeyFromFen(fullFen);

  async function processBucket(
    dbType: HumanDatabaseType,
    url: string
  ) {
    const cacheProfile = computeExplorerCacheProfile(dbType, defaultConfig);
    const cached = await readExplorerCache(posKey, cacheProfile);
    if (cached.status === "success" || cached.status === "empty") {
      const moves = cached.status === "success" ? cached.moves.map(toPublicMove) : [];
      const totalGames = moves.reduce((sum, m) => sum + m.games, 0);
      const unaccountedShare = checkExplorerGameCounts(dbType, totalGames, cached.positionTotalGames);
      return {
        moves, totalGames, positionTotalGames: cached.positionTotalGames, unaccountedShare,
        opening: toOpening(cached.eco, cached.openingName), retrieval: "CACHE" as const
      };
    }

    // AR.11: Explorer throws on give-up, so any result here is an answer.
    const result = await requestApi("Explorer", url, { body: "json", headers: lichessHeaders(true) });
    if (result.kind !== "answer") {
      throw new Error(`Required Lichess Explorer ${dbType} request failed for position ${posKey}`);
    }
    const data = result.body;

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

    const returnedMoves = validMoves.map(toPublicMove);
    const totalGames = returnedMoves.reduce((sum, m) => sum + m.games, 0);
    // The position's own total, as Explorer reports it. EX.05 compares it with totalGames.
    if (!isNonNegativeInteger(data.white) || !isNonNegativeInteger(data.draws) || !isNonNegativeInteger(data.black)) {
      throw new Error("Invalid source result: position statistic counts are missing or invalid");
    }
    const positionTotalGames = data.white + data.draws + data.black;
    const opening = parseOpening(data.opening);
    const unaccountedShare = checkExplorerGameCounts(dbType, totalGames, positionTotalGames);

    await saveExplorerCache(posKey, cacheProfile, {
      positionTotalGames,
      eco: opening?.eco ?? null,
      openingName: opening?.name ?? null,
      moves: validMoves
    });
    // EX.05: the fetch ran, so the row must be there now.
    if ((await readExplorerCache(posKey, cacheProfile)).status === "missing") {
      throw new Error(`Explorer ${dbType} cache row is missing after the fetch for position ${posKey}`);
    }

    return { moves: returnedMoves, totalGames, positionTotalGames, unaccountedShare, opening, retrieval: "FRESH" as const };
  }

  const mastersUrl = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fullFen)}`;
  const skippedBucket = () => ({ moves: [], totalGames: 0, positionTotalGames: 0, unaccountedShare: 0, opening: null, retrieval: "SKIPPED" as const });
  const mRes = requestedBuckets.includes("MASTERS")
    ? await processBucket("MASTERS", mastersUrl)
    : skippedBucket();

  const eliteSpeeds = defaultConfig.explorerEliteSpeeds.join(',');
  const eliteRatings = defaultConfig.explorerEliteRatings.join(',');
  const eliteUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(fullFen)}&speeds=${eliteSpeeds}&ratings=${eliteRatings}`;
  const eRes = requestedBuckets.includes("ELITE")
    ? await processBucket("ELITE", eliteUrl)
    : skippedBucket();

  const amateurSpeeds = defaultConfig.explorerSpeeds.join(',');
  const amateurRatings = defaultConfig.explorerRatings.join(',');
  const amateurUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(fullFen)}&speeds=${amateurSpeeds}&ratings=${amateurRatings}`;
  const aRes = requestedBuckets.includes("AMATEUR")
    ? await processBucket("AMATEUR", amateurUrl)
    : skippedBucket();

  return [mRes, eRes, aRes];
}

/** DB.06 rule 1: Masters, then Elite, then Amateur, among the datasets that were fetched. */
export function pickExplorerOpening(results: ReadonlyArray<{ opening: ExplorerOpening | null }>): ExplorerOpening | null {
  for (const result of results) {
    if (result.opening) return result.opening;
  }
  return null;
}

/** DB.06 rule 4: a position never sent to Explorer is fetched for the name only (Masters). */
export async function fetchMastersOpeningMetadata(fen: string): Promise<ExplorerOpening | null> {
  const [masters] = await fetchAllDatabases(fen, ["MASTERS"]);
  return masters.opening;
}
