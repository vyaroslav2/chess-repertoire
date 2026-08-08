import * as dotenv from "dotenv";
dotenv.config();

const LICHESS_API_TOKEN = process.env.LICHESS_API_TOKEN;

async function fetchAllDatabases(fen: string) {
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  console.log("Stripped FEN:", strippedFen);
  
  let amateur = { moves: [], totalGames: 0 };
  try {
    const amateurUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(strippedFen)}&speeds=classical,rapid&ratings=1600,1800,2000`;
    console.log("URL:", amateurUrl);
    const amateurRes = await fetch(amateurUrl, { headers: { 'Authorization': `Bearer ${LICHESS_API_TOKEN}`, 'Accept': 'application/json' }});
    amateur = await amateurRes.json();
    amateur.totalGames = amateur.white + amateur.draws + amateur.black;
    console.log("Amateur data:", amateur);
  } catch (e) {
    console.error("Error:", e);
  }
}

fetchAllDatabases("rn1qkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3");
