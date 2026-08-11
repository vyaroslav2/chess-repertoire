import { evaluateBlackMove } from '../src/lib/core/evaluator';
import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';
import { saveExplorerMoveCache } from '../src/lib/api/lichess';

const normalizeFen = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

const prisma = new PrismaClient();

async function runTest() {
  console.log("=== Phase 1: Environment Isolation (Local Stockfish Only) ===");
  // FEN: 4r1k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1 (White rook just moved to e1, Black plays Rxe1#)
  const fen = "4r1k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1"; 
  const normFen = normalizeFen(fen);
  console.log(`Test FEN: ${fen} (Black has Rxe1#)`);

  const chess = new Chess(fen);

  console.log("\n=== Phase 2: Mocking External APIs & Injecting Fake Human Moves ===");
  const originalFetch = global.fetch;
  
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.includes("cloud-eval") || url.includes("lichess.org")) {
      console.log(`[MOCK] Intercepted Lichess request for ${url}. Returning 404 to trigger instant failure...`);
      return new Response("Not Found", { status: 404 });
    }
    if (url.includes("chessdb.cn")) {
      console.log(`[MOCK] Intercepted ChessDB request for ${url}. Throwing network error...`);
      throw new Error("Mock ChessDB Network Error");
    }
    return originalFetch(input, init);
  };

  // Inject terrible human moves to prove they are ignored
  await prisma.explorerMoveCache.deleteMany({ where: { positionId: normFen } });
  
  const fakeData = [
      { san: "h6", games: 5000, whiteWins: 1000, draws: 1000, blackWins: 3000 },
      { san: "Kf8", games: 2000, whiteWins: 500, draws: 500, blackWins: 1000 }
  ];
  
  for (const m of fakeData) {
      await saveExplorerMoveCache(normFen, "masters", m);
      await saveExplorerMoveCache(normFen, "elite", m);
      await saveExplorerMoveCache(normFen, "amateur", m);
  }

  console.log("\n=== Phase 3 & 4: Triggering Kill Mode & Deep Search ===");
  console.log("Calling evaluateBlackMove...");
  const evalResult = await evaluateBlackMove(fen, chess, 10, []);
  
  console.log("\n=== Phase 5: Strict Execution & Database Saving ===");
  console.log(`Pipeline selected move: ${evalResult.selectedMoveSan}`);
  console.log(`Eval Source: ${evalResult.evalSource}`);
  console.log(`Selected Engine CP: ${evalResult.selectedEngineCp}`);
  
  if (evalResult.selectedMoveSan === "Rxe1#") {
      console.log("SUCCESS: Kill Mode identified the forced mate and executed it!");
  } else {
      console.error("FAILED: System did not pick the forced mate!");
  }

  if (evalResult.evalSource === "Local Deep Stockfish") {
      console.log("SUCCESS: Kill Mode used the Deep Search baseline!");
  } else {
      console.error("FAILED: System did not use Local Deep Stockfish!");
  }
  
  if (evalResult.selectedEngineCp <= -29000) {
      console.log(`SUCCESS: Kill Mode correctly mapped the CP to an extreme mate value (${evalResult.selectedEngineCp})!`);
  } else {
      console.error(`FAILED: CP was not mapped correctly (Expected <= -29000, got ${evalResult.selectedEngineCp})`);
  }

  console.log("\n=== Teardown ===");
  await prisma.explorerMoveCache.deleteMany({ where: { positionId: normFen } });
  await prisma.$disconnect();
  console.log("Done.");
}

runTest().catch(e => {
  console.error("Test script failed:", e);
  process.exit(1);
});
