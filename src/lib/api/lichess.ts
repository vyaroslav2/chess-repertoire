import { fetchWithRetry, delay } from './retry';
import { prisma, saveExplorerMoveCache } from '../db/operations';
import { parseFullFen, positionKeyFromFen } from '../core/fen';
import { defaultConfig } from '../core/config';

export async function fetchAllDatabases(fen: string) {
  const fullFen = parseFullFen(fen);
  const posKey = positionKeyFromFen(fullFen);
  
  // Try to load from Cache first
  const cachedMasters = await prisma.explorerMoveCache.findMany({ where: { positionId: posKey, dbType: "masters" } });
  const cachedElite = await prisma.explorerMoveCache.findMany({ where: { positionId: posKey, dbType: "elite" } });
  const cachedAmateur = await prisma.explorerMoveCache.findMany({ where: { positionId: posKey, dbType: "amateur" } });

  let masters: any = { moves: [], totalGames: 0, opening: null };
  let elite: any = { moves: [], totalGames: 0 };
  let amateur: any = { moves: [], totalGames: 0 };

  const reconstructCache = (cachedRows: any[]) => {
    let totalGames = 0;
    const moves = cachedRows.filter(row => row.san !== "_EMPTY_").map(row => {
      totalGames += row.games;
      return {
        san: row.san,
        white: row.whiteWins,
        draws: row.draws,
        black: row.blackWins,
        games: row.games
      };
    });
    return { moves, totalGames };
  };

  // If all three exist, we skip Lichess entirely
  if (cachedMasters.length > 0 && cachedElite.length > 0 && cachedAmateur.length > 0) {
    masters = reconstructCache(cachedMasters);
    elite = reconstructCache(cachedElite);
    amateur = reconstructCache(cachedAmateur);
    return [masters, elite, amateur];
  }

  // Otherwise, fetch from APIs and Cache
  try {
    const mastersUrl = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fullFen)}`;
    const mData = await fetchWithRetry(mastersUrl, defaultConfig.api.lichessExplorer.retryAttempts);
    if (mData) {
      masters = mData;
      masters.totalGames = masters.white + masters.draws + masters.black;
      if (mData.moves && mData.moves.length > 0) {
        for (const m of mData.moves) {
          const total = m.white + m.draws + m.black;
          await saveExplorerMoveCache(fullFen, "masters", { san: m.san, games: total, whiteWins: m.white, draws: m.draws, blackWins: m.black });
        }
      } else {
        await saveExplorerMoveCache(fullFen, "masters", { san: "_EMPTY_", games: 0, whiteWins: 0, draws: 0, blackWins: 0 });
      }
    }
  } catch (e) {}

  await delay(defaultConfig.api.betweenRequestDelayMs);

  try {
    const eliteSpeeds = defaultConfig.humanExplorerRequest.elite.speeds.join(',');
    const eliteRatings = defaultConfig.humanExplorerRequest.elite.ratings.join(',');
    const eliteUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(fullFen)}&speeds=${eliteSpeeds}&ratings=${eliteRatings}`;
    const eData = await fetchWithRetry(eliteUrl, defaultConfig.api.lichessExplorer.retryAttempts);
    if (eData) {
      elite = eData;
      elite.totalGames = elite.white + elite.draws + elite.black;
      if (eData.moves && eData.moves.length > 0) {
        for (const m of eData.moves) {
          const total = m.white + m.draws + m.black;
          await saveExplorerMoveCache(fullFen, "elite", { san: m.san, games: total, whiteWins: m.white, draws: m.draws, blackWins: m.black });
        }
      } else {
        await saveExplorerMoveCache(fullFen, "elite", { san: "_EMPTY_", games: 0, whiteWins: 0, draws: 0, blackWins: 0 });
      }
    }
  } catch (e) {}

  await delay(defaultConfig.api.betweenRequestDelayMs);

  try {
    const amateurSpeeds = defaultConfig.humanExplorerRequest.amateur.speeds.join(',');
    const amateurRatings = defaultConfig.humanExplorerRequest.amateur.ratings.join(',');
    const amateurUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(fullFen)}&speeds=${amateurSpeeds}&ratings=${amateurRatings}`;
    const aData = await fetchWithRetry(amateurUrl, defaultConfig.api.lichessExplorer.retryAttempts);
    if (aData) {
      amateur = aData;
      amateur.totalGames = amateur.white + amateur.draws + amateur.black;
      if (aData.moves && aData.moves.length > 0) {
        for (const m of aData.moves) {
          const total = m.white + m.draws + m.black;
          await saveExplorerMoveCache(fullFen, "amateur", { san: m.san, games: total, whiteWins: m.white, draws: m.draws, blackWins: m.black });
        }
      } else {
        await saveExplorerMoveCache(fullFen, "amateur", { san: "_EMPTY_", games: 0, whiteWins: 0, draws: 0, blackWins: 0 });
      }
    }
  } catch (e) {}

  return [masters, elite, amateur];
}
