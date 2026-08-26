import { runLocalStockfish } from "../src/lib/core/verifier";
import { evaluateBlackMove } from "../src/lib/core/evaluator";
import { prisma, getOrCreatePosition, getOrCreatePositionCache, saveHumanExplorerBucket, getOrCreateHumanDataSnapshot } from "../src/lib/db/operations";
import { computeExplorerRequestProfile, defaultConfig } from "../src/lib/core/config";
import { Chess } from "chess.js";
import { parseFullFen, positionKeyFromFen } from "../src/lib/core/fen";

// Ensure burner DB
process.env.DATABASE_URL = "file:./burner.db";

async function runTest() {
  console.log("=== Phase 1: Setup and Basic Health Check ===");
  const fen = "r1bq1rk1/ppp1bppp/2n2n2/3p4/3P4/2PB1N2/PP3PPP/RNBQ1RK1 b - - 4 8";
  const fullFen = parseFullFen(fen);
  const normFen = positionKeyFromFen(fullFen);
  console.log(`Test FEN: ${fen}`);
  const chess = new Chess(fen);
  
  console.log("Running local Stockfish directly...");
  const localPvs = await runLocalStockfish(fullFen, 15, 18);
  
  if (!Array.isArray(localPvs) || localPvs.length === 0) {
    throw new Error("runLocalStockfish did not return a valid array of moves.");
  }
  
  const firstPv = localPvs[0];
  if (firstPv.cp === undefined || !firstPv.moves) {
    throw new Error("runLocalStockfish objects are missing required 'cp' or 'moves' properties.");
  }
  console.log(`Local Stockfish returned ${localPvs.length} PVs.`);
  
  console.log("Checking sorting logic (Black's turn)...");
  const topMoveCp = firstPv.cp;
  const bottomMoveCp = localPvs[localPvs.length - 1].cp;
  
  console.log(`Top move CP (White perspective): ${topMoveCp}`);
  console.log(`Bottom move CP (White perspective): ${bottomMoveCp}`);
  
  if (topMoveCp > bottomMoveCp) {
    console.log("[BUG EXPOSED] The sorting logic in verifier.ts sorts by highest White CP first. On Black's turn, this pushes White's best moves to the top!");
  } else {
    console.log("Sorting is correct (lowest CP first).");
  }

  console.log("\n[Sorted Moves from Local Stockfish]");
  for (let i = 0; i < localPvs.length; i++) {
      console.log(`${i+1}. ${localPvs[i].moves.split(' ')[0]} (CP: ${localPvs[i].cp})`);
  }

  console.log("\n=== Phase 2: Mocking External APIs ===");
  const originalFetch = global.fetch;
  
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.includes("cloud-eval") || url.includes("lichess.org")) {
      console.log(`[MOCK] Intercepted Lichess request for ${url}. Returning 404 to trigger instant failure...`);
      return new Response("Not Found", { status: 404 });
    }
    if (url.includes("chessdb.cn")) {
      console.log(`[MOCK] Intercepted ChessDB request for ${url}. Throwing network error...`);
      throw new Error("Mocked Network Error for ChessDB");
    }
    return originalFetch(input, init);
  };
  
  console.log("\n=== Phase 3: Verify the Fallback Mechanism ===");
  await getOrCreatePositionCache(fullFen);
  
  // Clean up any existing engine eval cache so it's forced to fetch
  
  // Inject some fake explorer data so candidateMoves isn't empty (bypassing Lichess explorer limits)
  const reqProfile = computeExplorerRequestProfile(defaultConfig);
  const user = await prisma.user.upsert({
    where: { username: "local-stockfish-test" },
    update: {},
    create: { username: "local-stockfish-test" }
  });
  let repertoire = await prisma.repertoire.findFirst({ where: { userId: user.id, title: "Local Stockfish Test" } });
  if (!repertoire) {
    repertoire = await prisma.repertoire.create({ data: { userId: user.id, title: "Local Stockfish Test", color: "black" } });
  }
  await getOrCreatePosition(fullFen);
  const snapshot = await getOrCreateHumanDataSnapshot(repertoire.id, reqProfile);
  const snapshotId = snapshot.id;

  await prisma.explorerMoveCache.deleteMany({ where: { positionKey: normFen } });
  
  const fakeData = [
      { uci: "f8e8", san: "Re8", games: 100, whiteWins: 30, draws: 40, blackWins: 30 },
      { uci: "h7h6", san: "h6", games: 50, whiteWins: 15, draws: 20, blackWins: 15 }
  ];
  
  await saveHumanExplorerBucket(snapshotId, normFen, "MASTERS", fakeData);
  await saveHumanExplorerBucket(snapshotId, normFen, "ELITE", fakeData);
  await saveHumanExplorerBucket(snapshotId, normFen, "AMATEUR", fakeData);

  console.log("Calling evaluateBlackMove...");
  const evalResult = await evaluateBlackMove(fen, chess, 8, [], snapshotId);
  
  if (evalResult.selectedMoveSan === null) {
      console.error("Pipeline failed to select a move!");
  } else {
      console.log(`Pipeline selected move: ${evalResult.selectedMoveSan}`);
      console.log(`Eval Source: ${evalResult.evalSource}`);
      console.log(`Selected Engine CP: ${evalResult.selectedEngineCp}`);
      
      if (evalResult.evalSource !== "Local Stockfish") {
          console.warn(`Expected evalSource to be 'Local Stockfish', but got '${evalResult.evalSource}'`);
      } else {
          console.log("Fallback mechanism successfully verified!");
      }
  }

  console.log("\n=== Phase 4: ChessDB Comparison & Accuracy Check ===");
  global.fetch = originalFetch; // Restore connectivity
  
  try {
      const chessdbUrl = `https://www.chessdb.cn/cdb.php?action=queryall&board=${encodeURIComponent(normFen)}`;
      console.log(`Querying ChessDB directly for baseline: ${chessdbUrl}`);
      const res = await fetch(chessdbUrl);
      const text = await res.text();
      const chessdbPvs: { moves: string; cp: number }[] = [];
      
      if (text.includes("move:")) {
          const moves = text.split("|");
          for (const m of moves) {
              const match = m.match(/move:([^,]+),score:([^,]+)/);
              if (match) {
                  chessdbPvs.push({ moves: match[1], cp: -parseInt(match[2], 10) }); // White perspective
              }
          }
      }
      
      chessdbPvs.sort((a, b) => a.cp - b.cp);
      const sortedLocal = [...localPvs].sort((a, b) => a.cp - b.cp);
      
      console.log(`\n[ANALYTICS: ALL CANDIDATES COMPARISON]`);
      console.log(`Rank | Local Stockfish          | ChessDB Cloud`);
      console.log(`-----------------------------------------------------`);
      const maxLen = Math.max(sortedLocal.length, chessdbPvs.length);
      for (let i = 0; i < maxLen; i++) {
          const localStr = sortedLocal[i] ? `${sortedLocal[i].moves.split(' ')[0]} (CP: ${sortedLocal[i].cp})`.padEnd(24) : 'N/A'.padEnd(24);
          const cdbStr = chessdbPvs[i] ? `${chessdbPvs[i].moves} (CP: ${chessdbPvs[i].cp})` : 'N/A';
          console.log(`  ${i+1}  | ${localStr} | ${cdbStr}`);
      }
      
      const localBestMove = sortedLocal[0];
      const chessdbTopCp = chessdbPvs[0] ? chessdbPvs[0].cp : 0;
      const chessdbTopLan = chessdbPvs[0] ? chessdbPvs[0].moves : '';
      
      const diff = Math.abs(localBestMove.cp - chessdbTopCp);
      console.log(`\nAbsolute Top CP Difference: ${diff}`);
      if (chessdbTopLan === localBestMove.moves.split(" ")[0]) {
          console.log(`Match: YES (Engines agree on top candidate)`);
      } else {
          console.log(`Match: NO (Engines chose different top candidates, normal for different depths)`);
      }
  } catch (e) {
      console.error("Failed to query ChessDB for comparison.", e);
  }

  console.log("\n=== Phase 5: Cleanup ===");
  await prisma.$disconnect();
  console.log("Done.");
}

runTest().catch(console.error);
