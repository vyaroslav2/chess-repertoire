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

async function getOrCreatePosition(fen: string) {
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  let pos = await prisma.position.findUnique({ where: { fen: strippedFen } });
  if (!pos) pos = await prisma.position.create({ data: { fen: strippedFen } });
  return pos;
}

// -------------------------------------------------------------
// CONFIGURE YOUR RARE LINE HERE
// Put the exact sequence of moves to reach the rare position.
// -------------------------------------------------------------
const FORCED_LINE = [
  "e4", "c6", 
  "d4", "d5", 
  "e5", "Bf5", 
  "h4", "h5", 
  "c4", "e6", 
  "Nc3", "Ne7", 
  "Nge2", "dxc4", 
  "Ng3", "Bg6", 
  "Bxc4", "Nd5", 
  "Bg5"
];

async function getEngineEval(fen: string) {
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  try {
    const cloudUrl = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(strippedFen)}&multiPv=1`;
    const cloudRes = await fetch(cloudUrl, { headers: { 'Authorization': `Bearer ${LICHESS_API_TOKEN}`, 'Accept': 'application/json' }});
    const cloudData = await cloudRes.json();
    if (!cloudData.error && cloudData.pvs && cloudData.pvs.length > 0) {
      return cloudData.pvs[0].cp;
    }
  } catch (e) {}
  return null;
}

async function evaluateBlackMove(fen: string, chess: Chess) {
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  
  let mergedMoves: Record<string, any> = {};
  
  // Masters Data
  try {
    const mastersUrl = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(strippedFen)}`;
    const mastersRes = await fetch(mastersUrl, { headers: { 'Authorization': `Bearer ${LICHESS_API_TOKEN}`, 'Accept': 'application/json' }});
    const mastersData = await mastersRes.json();
    if (mastersData.moves) {
      for (const m of mastersData.moves) {
        mergedMoves[m.san] = {
          san: m.san, mastersCount: m.white + m.draws + m.black,
          mastersBlackWin: m.black, mastersDraws: m.draws,
          onlineCount: 0, onlineBlackWin: 0, onlineDraws: 0
        };
      }
    }
  } catch (e) {}

  // 2500+ Online Data (Classical AND Rapid to get volume)
  try {
    const onlineUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(strippedFen)}&speeds=classical,rapid&ratings=2500`;
    const onlineRes = await fetch(onlineUrl, { headers: { 'Authorization': `Bearer ${LICHESS_API_TOKEN}`, 'Accept': 'application/json' }});
    const onlineData = await onlineRes.json();
    if (onlineData.moves) {
      for (const m of onlineData.moves) {
        const totalOnline = m.white + m.draws + m.black;
        if (mergedMoves[m.san]) {
          mergedMoves[m.san].onlineCount = totalOnline;
          mergedMoves[m.san].onlineBlackWin = m.black;
          mergedMoves[m.san].onlineDraws = m.draws;
        } else {
          mergedMoves[m.san] = {
            san: m.san, mastersCount: 0, mastersBlackWin: 0, mastersDraws: 0,
            onlineCount: totalOnline, onlineBlackWin: m.black, onlineDraws: m.draws
          };
        }
      }
    }
  } catch (e) {}

  // We require at least 3 Masters games (15) OR 15 online games to even consider human theory.
  const MIN_GAMES_THRESHOLD = 15; 
  
  // The "Skeptical Prior". We add 50 weighted games of pure White Wins to pull flukes down to 0%
  const SKEPTICAL_PRIOR_WEIGHT = 50; 

  const candidateMoves = Object.values(mergedMoves).map(m => {
    const weightedCount = (m.mastersCount * 5) + m.onlineCount;
    const weightedBlackWins = (m.mastersBlackWin * 5) + m.onlineBlackWin;
    const weightedDraws = (m.mastersDraws * 5) + m.onlineDraws;
    
    const smoothedCount = weightedCount + SKEPTICAL_PRIOR_WEIGHT;
    
    // We NO LONGER add fake draws to the numerator. We only calculate actual wins/draws.
    const score = (weightedBlackWins + (0.5 * weightedDraws)) / smoothedCount;
    return { ...m, weightedCount, score };
  }).filter(m => m.weightedCount >= MIN_GAMES_THRESHOLD);

  candidateMoves.sort((a, b) => b.score - a.score);

  // Engine Check
  let bestCp = 0;
  let enginePvs: any[] = [];
  try {
    const cloudUrl = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(strippedFen)}&multiPv=5`;
    const cloudRes = await fetch(cloudUrl, { headers: { 'Authorization': `Bearer ${LICHESS_API_TOKEN}`, 'Accept': 'application/json' }});
    const cloudData = await cloudRes.json();
    if (!cloudData.error && cloudData.pvs && cloudData.pvs.length > 0) {
      enginePvs = cloudData.pvs;
      // Handle potential mate scores so it doesn't crash
      bestCp = enginePvs[0].cp !== undefined ? enginePvs[0].cp : (enginePvs[0].mate > 0 ? 9999 : -9999);
    }
  } catch (e) {}

  let selectedMoveSan: string | null = null;
  let selectedStats: any = null;
  let selectedEngineCp: number | null = null;

  if (enginePvs.length > 0 && candidateMoves.length > 0) {
    for (const candidate of candidateMoves) {
      try {
        const moveResult = chess.move(candidate.san);
        chess.undo();
        const lan = moveResult.lan; 
        const enginePv = enginePvs.find(pv => pv.moves.split(" ")[0] === lan);
        
        if (enginePv) {
            const moveCp = enginePv.cp !== undefined ? enginePv.cp : (enginePv.mate > 0 ? 9999 : -9999);
            // Move must be within 0.8 pawns of the absolute best engine move
            if (Math.abs(moveCp - bestCp) <= 80) {
              selectedMoveSan = candidate.san;
              selectedStats = candidate;
              selectedEngineCp = moveCp;
              break;
            }
        }
      } catch(e) {}
    }
  }

  // Fallback to top engine move if no human moves passed the threshold or engine check
  if (!selectedMoveSan && enginePvs.length > 0) {
    try {
      const lan = enginePvs[0].moves.split(" ")[0];
      const fromSq = lan.substring(0, 2);
      const toSq = lan.substring(2, 4);
      const promotion = lan.length === 5 ? lan[4] : undefined;
      const moveResult = chess.move({ from: fromSq, to: toSq, promotion } as any);
      chess.undo();
      selectedMoveSan = moveResult.san;
      selectedEngineCp = bestCp;
      selectedStats = candidateMoves.find(m => m.san === selectedMoveSan) || { weightedCount: 0, score: 0 };
    } catch(e) {}
  }

  return { selectedMoveSan, selectedStats, selectedEngineCp };
}

async function main() {
  console.log("=== Sniper Repertoire Simulator (Evaluating every move) ===\n");

  const chess = new Chess();
  
  for (let i = 0; i < FORCED_LINE.length; i++) {
    const isBlackTurn = chess.turn() === 'b';
    const moveSan = FORCED_LINE[i];
    const cp = await getEngineEval(chess.fen());
    const evalStr = cp !== null ? (cp/100).toFixed(2) : "N/A";
    
    if (isBlackTurn) {
      console.log(`\nEvaluating Black's options before playing forced move: ${moveSan}`);
      const algoResult = await evaluateBlackMove(chess.fen(), chess);
      
      let explanation = "";
      if (algoResult.selectedStats.weightedCount === 0) {
         explanation = `Engine Fallback | Eval: ${algoResult.selectedEngineCp !== null ? (algoResult.selectedEngineCp/100).toFixed(2) : "N/A"}`;
      } else {
         explanation = `Score: ${(algoResult.selectedStats.score * 100).toFixed(1)}% | Weighted Vol: ${algoResult.selectedStats.weightedCount} | Eval: ${algoResult.selectedEngineCp !== null ? (algoResult.selectedEngineCp/100).toFixed(2) : "N/A"}`;
      }
      console.log(`  -> Algorithm would have chosen: ${algoResult.selectedMoveSan} (${explanation})`);
      if (algoResult.selectedMoveSan !== moveSan) {
        console.log(`  -> Warning: Algorithm choice (${algoResult.selectedMoveSan}) differs from forced line (${moveSan})!`);
      }
    }
    
    chess.move(moveSan);
    const moveNumber = Math.floor(i / 2) + 1;
    const notation = isBlackTurn ? `${moveNumber}...${moveSan}` : `${moveNumber}.${moveSan}`;
    console.log(`${notation} [Eval: ${evalStr}]`);
  }

  if (chess.turn() === 'b') {
    console.log(`\nEvaluating Black's final response after forced line...`);
    const algoResult = await evaluateBlackMove(chess.fen(), chess);
    
    if (algoResult.selectedMoveSan) {
      let explanation = "";
      if (algoResult.selectedStats.weightedCount === 0) {
         explanation = `Engine Fallback | Eval: ${algoResult.selectedEngineCp !== null ? (algoResult.selectedEngineCp/100).toFixed(2) : "N/A"}`;
      } else {
         explanation = `Score: ${(algoResult.selectedStats.score * 100).toFixed(1)}% | Weighted Vol: ${algoResult.selectedStats.weightedCount} | Eval: ${algoResult.selectedEngineCp !== null ? (algoResult.selectedEngineCp/100).toFixed(2) : "N/A"}`;
      }
      console.log(`\n==============================================`);
      console.log(`Final Algorithm Selection: ${algoResult.selectedMoveSan}`);
      console.log(`Statistics:  ${explanation}`);
      console.log(`==============================================\n`);
    } else {
      console.log("No valid move found for final position.");
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
