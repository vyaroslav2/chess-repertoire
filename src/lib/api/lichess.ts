import { fetchWithRetry, delay } from './retry';
import { prisma, saveExplorerMoveCache } from '../db/operations';
import { normalizeFen } from '../core/fen';

export async function fetchAllDatabases(fen: string) {
  const normFen = normalizeFen(fen);
  
  // Try to load from Cache first
  const cachedMasters = await prisma.explorerMoveCache.findMany({ where: { positionId: normFen, dbType: "masters" } });
  const cachedElite = await prisma.explorerMoveCache.findMany({ where: { positionId: normFen, dbType: "elite" } });
  const cachedAmateur = await prisma.explorerMoveCache.findMany({ where: { positionId: normFen, dbType: "amateur" } });

  let masters: any = { moves: [], totalGames: 0, opening: null };
  let elite: any = { moves: [], totalGames: 0 };
  let amateur: any = { moves: [], totalGames: 0 };

  const reconstructCache = (cachedRows: any[]) => {
    let totalGames = 0;
    const moves = cachedRows.map(row => {
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
    const mastersUrl = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(normFen)}`;
    const mData = await fetchWithRetry(mastersUrl);
    if (mData) {
      masters = mData;
      masters.totalGames = masters.white + masters.draws + masters.black;
      if (mData.moves) {
        for (const m of mData.moves) {
          const total = m.white + m.draws + m.black;
          await saveExplorerMoveCache(normFen, "masters", { san: m.san, games: total, whiteWins: m.white, draws: m.draws, blackWins: m.black });
        }
      }
    }
  } catch (e) {}

  await delay(1000); 

  try {
    const eliteUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(normFen)}&speeds=classical,rapid&ratings=2500`;
    const eData = await fetchWithRetry(eliteUrl);
    if (eData) {
      elite = eData;
      elite.totalGames = elite.white + elite.draws + elite.black;
      if (eData.moves) {
        for (const m of eData.moves) {
          const total = m.white + m.draws + m.black;
          await saveExplorerMoveCache(normFen, "elite", { san: m.san, games: total, whiteWins: m.white, draws: m.draws, blackWins: m.black });
        }
      }
    }
  } catch (e) {}

  await delay(1000);

  try {
    const amateurUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(normFen)}&speeds=classical,rapid&ratings=1600,1800,2000`;
    const aData = await fetchWithRetry(amateurUrl);
    if (aData) {
      amateur = aData;
      amateur.totalGames = amateur.white + amateur.draws + amateur.black;
      if (aData.moves) {
        for (const m of aData.moves) {
          const total = m.white + m.draws + m.black;
          await saveExplorerMoveCache(normFen, "amateur", { san: m.san, games: total, whiteWins: m.white, draws: m.draws, blackWins: m.black });
        }
      }
    }
  } catch (e) {}

  return [masters, elite, amateur];
}
