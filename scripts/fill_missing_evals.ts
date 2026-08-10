import { PrismaClient } from "@prisma/client";
import { Chess } from "chess.js";
import * as dotenv from "dotenv";
import * as fs from "fs";

if (fs.existsSync("C:\\Files\\.env")) {
  dotenv.config({ path: "C:\\Files\\.env" });
}
dotenv.config();

const prisma = new PrismaClient();
const LICHESS_API_TOKEN = process.env.LICHESS_API_TOKEN;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function fetchWithRetry(url: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${LICHESS_API_TOKEN}`, 'Accept': 'application/json' }});
    if (response.status === 429) {
      const waitTime = 10000 * (i+1);
      console.log(`[WARNING] Lichess rate limit (429). Waiting ${waitTime/1000}s before retry...`);
      await delay(waitTime);
      continue;
    }
    if (!response.ok) {
      console.log(`Lichess error ${response.status} on ${url}`);
      return null;
    }
    return await response.json();
  }
  console.log(`[SKIPPED] Rate limit exhausted for ${url}.`);
  return null;
}

async function main() {
  console.log("Looking for moves with missing evaluations...");

  const missingMoves = await prisma.move.findMany({
    where: { eval: null },
    include: { fromPosition: true }
  });

  if (missingMoves.length === 0) {
    console.log("No missing evaluations found.");
    return;
  }

  console.log(`Found ${missingMoves.length} moves missing evaluation. Starting backfill...`);

  let count = 0;
  for (const move of missingMoves) {
    if (!move.fromPosition) continue;
    
    // We only want the first 4 tokens of the FEN for the Cloud Eval API
    const strippedFen = move.fromPosition.fen.split(" ").slice(0, 4).join(" ");
    
    console.log(`Fetching eval for FEN: ${strippedFen} (Move: ${move.san})`);
    
    const cloudUrl = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(strippedFen)}&multiPv=5`;
    const cloudData = await fetchWithRetry(cloudUrl);
    
    if (cloudData && !cloudData.error && cloudData.pvs && cloudData.pvs.length > 0) {
      const enginePvs = cloudData.pvs;
      
      let matchedCp = null;
      
      const tempChess = new Chess(move.fromPosition.fen);
      
      for (const pv of enginePvs) {
        const lan = pv.moves.split(" ")[0];
        try {
          const fromSq = lan.substring(0, 2);
          const toSq = lan.substring(2, 4);
          const promotion = lan.length === 5 ? lan[4] : undefined;
          
          const moveResult = tempChess.move({ from: fromSq, to: toSq, promotion } as any);
          tempChess.undo();
          
          if (moveResult.san === move.san) {
            matchedCp = pv.cp;
            break;
          }
        } catch(e) {}
      }
      
      if (matchedCp !== null) {
        await prisma.move.update({
          where: { id: move.id },
          data: { eval: matchedCp / 100 }
        });
        console.log(`  -> Successfully backfilled Eval: ${(matchedCp / 100).toFixed(2)}`);
        count++;
      } else {
        console.log(`  -> No matching engine PV found for move ${move.san} in this position.`);
      }
    } else {
      console.log(`  -> Cloud eval unavailable (or error/rate limited).`);
    }
    
    // Generous delay to prevent hitting 429
    await delay(3000);
  }

  console.log(`\nFinished! Successfully backfilled ${count} out of ${missingMoves.length} evaluations.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
