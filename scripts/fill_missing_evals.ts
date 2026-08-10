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

async function fetchWithRetry(url: string, retries = 3, useToken = true) {
  const headers: any = { 'Accept': 'application/json' };
  if (useToken) headers['Authorization'] = `Bearer ${LICHESS_API_TOKEN}`;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { headers });
      if (response.status === 429) {
        const waitTime = 10 * (i+1);
        console.log(`[WARNING] Lichess rate limit (429). Waiting ${waitTime/1000}s before retry...`);
        await delay(waitTime);
        continue;
      }
      if (!response.ok) {
        console.log(`Lichess error ${response.status} on ${url}`);
        return null;
      }
      return await response.json();
    } catch (e: any) {
      console.log(`[WARNING] Network error fetching ${url}: ${e.message}`);
      await delay(1000);
      continue;
    }
  }
  console.log(`[SKIPPED] Rate limit/errors exhausted for ${url}.`);
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
    // TEMPORARILY COMMENTED OUT: Force fallback to Chessdb
    // const cloudData = await fetchWithRetry(cloudUrl, 3, false);
    const cloudData: any = null;
    
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
        console.log(`  -> Lichess Cloud Eval: ${(matchedCp / 100).toFixed(2)}`);
        count++;
      } else {
        console.log(`  -> No matching engine PV found for move ${move.san} in Lichess Cloud Eval.`);
      }
    } else {
      console.log(`  -> Lichess Cloud eval unavailable. Falling back to Chessdb...`);
      
      try {
        const chessdbUrl = `https://www.chessdb.cn/cdb.php?action=queryall&board=${encodeURIComponent(strippedFen)}`;
        const chessdbRes = await fetch(chessdbUrl);
        
        if (chessdbRes.ok) {
          const text = await chessdbRes.text();
          
          if (text.includes("move:")) {
            const moves = text.split("|");
            let matchedCp = null;
            
            const tempChess = new Chess(move.fromPosition.fen);
            
            for (const m of moves) {
              const moveMatch = m.match(/move:([^,]+),score:([^,]+)/);
              if (moveMatch) {
                const lan = moveMatch[1];
                const scoreCp = parseInt(moveMatch[2], 10);
                
                try {
                  const fromSq = lan.substring(0, 2);
                  const toSq = lan.substring(2, 4);
                  const promotion = lan.length === 5 ? lan[4] : undefined;
                  
                  const moveResult = tempChess.move({ from: fromSq, to: toSq, promotion } as any);
                  tempChess.undo();
                  
                  if (moveResult.san === move.san) {
                    matchedCp = scoreCp;
                    break;
                  }
                } catch (e) {}
              }
            }
            
            if (matchedCp !== null) {
              await prisma.move.update({
                where: { id: move.id },
                data: { eval: matchedCp / 100 }
              });
              console.log(`  -> Chessdb Eval: ${(matchedCp / 100).toFixed(2)}`);
              count++;
            } else {
              console.log(`  -> No matching move found in Chessdb for ${move.san}.`);
            }
          } else {
             console.log(`  -> Chessdb returned no valid moves: ${text.substring(0, 50)}...`);
          }
        } else {
          console.log(`  -> Chessdb request failed with status ${chessdbRes.status}`);
        }
      } catch (e: any) {
        console.log(`  -> Chessdb fetch error: ${e.message}`);
      }
    }
    
    // Generous delay to prevent hitting 429
    await delay(3000);
  }

  console.log(`\nFinished! Successfully backfilled ${count} out of ${missingMoves.length} evaluations.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
