import { fetchWithRetry, delay } from './retry';

export async function fetchAllDatabases(fen: string) {
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  let masters: any = { moves: [], totalGames: 0 };
  let elite: any = { moves: [], totalGames: 0 };
  let amateur: any = { moves: [], totalGames: 0 };

  try {
    const mastersUrl = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(strippedFen)}`;
    const mData = await fetchWithRetry(mastersUrl);
    if (mData) {
      masters = mData;
      masters.totalGames = masters.white + masters.draws + masters.black;
    }
  } catch (e) {}

  await delay(1000); 

  try {
    const eliteUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(strippedFen)}&speeds=classical,rapid&ratings=2500`;
    const eData = await fetchWithRetry(eliteUrl);
    if (eData) {
      elite = eData;
      elite.totalGames = elite.white + elite.draws + elite.black;
    }
  } catch (e) {}

  await delay(1000);

  try {
    const amateurUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(strippedFen)}&speeds=classical,rapid&ratings=1600,1800,2000`;
    const aData = await fetchWithRetry(amateurUrl);
    if (aData) {
      amateur = aData;
      amateur.totalGames = amateur.white + amateur.draws + amateur.black;
    }
  } catch (e) {}

  return [masters, elite, amateur];
}
