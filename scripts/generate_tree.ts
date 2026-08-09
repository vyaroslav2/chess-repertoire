import { PrismaClient } from "@prisma/client";
import { Chess } from "chess.js";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import { createEmptyCard } from "ts-fsrs";

if (fs.existsSync("C:\\Files\\.env")) {
  dotenv.config({ path: "C:\\Files\\.env" });
}
dotenv.config();

const prisma = new PrismaClient();
const LICHESS_API_TOKEN = process.env.LICHESS_API_TOKEN;

const ai = new GoogleGenAI({ 
  apiKey: "DUMMY_KEY",
  httpOptions: { baseUrl: "http://127.0.0.1:55555/gemini" }
});

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function getOrCreatePosition(fen: string) {
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  let pos = await prisma.position.findUnique({ where: { fen: strippedFen } });
  if (!pos) { pos = await prisma.position.create({ data: { fen: strippedFen } }); }
  return pos;
}

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

// Fetch wrapper with 429 backoff
async function fetchWithRetry(url: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${LICHESS_API_TOKEN}`, 'Accept': 'application/json' }});
    if (response.status === 429) {
      console.log(`Rate limited by Lichess (429). Retrying in ${3 * (i+1)} seconds...`);
      await delay(3000 * (i+1));
      continue;
    }
    if (!response.ok) {
      console.log(`Lichess error ${response.status} on ${url}`);
      return null;
    }
    return await response.json();
  }
  return null;
}

// Phase 1: Data Fetching for White
async function fetchAllDatabases(fen: string) {
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

  await delay(1000); // Be gentle to API

  try {
    const eliteUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(strippedFen)}&speeds=classical,rapid&ratings=2500`;
    const eData = await fetchWithRetry(eliteUrl);
    if (eData) {
      elite = eData;
      elite.totalGames = elite.white + elite.draws + elite.black;
    }
  } catch (e) {}

  await delay(1000); // Be gentle to API

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

// Phase 2: Reverse penalty for White
function calculateMasterThreatScore(mastersData: any, eliteData: any) {
    const MIN_GAMES_THRESHOLD = 15;
    const SKEPTICAL_PRIOR_BLACK_WINS = 50; 

    const mTotal = mastersData ? mastersData.white + mastersData.draws + mastersData.black : 0;
    const mWhite = mastersData ? mastersData.white : 0;

    const eTotal = eliteData ? eliteData.white + eliteData.draws + eliteData.black : 0;
    const eWhite = eliteData ? eliteData.white : 0;

    const weightedCount = (mTotal * 5) + eTotal;
    const weightedWhiteWins = (mWhite * 5) + eWhite;

    if (weightedCount < MIN_GAMES_THRESHOLD) return 0;

    const smoothedCount = weightedCount + SKEPTICAL_PRIOR_BLACK_WINS;
    const whiteWinRate = weightedWhiteWins / smoothedCount;
    
    return whiteWinRate; 
}

// Phase 3: Filter White's moves
function shouldIncludeWhiteMove(moveSan: string, currentMoveNumber: number, mastersList: any[], eliteList: any[], amateurList: any[], totalAmateurGames: number) {
    const amateurData = amateurList.find(m => m.san === moveSan) || { white: 0, draws: 0, black: 0 };
    const aTotal = amateurData.white + amateurData.draws + amateurData.black;
    const mastersData = mastersList.find(m => m.san === moveSan);
    const eliteData = eliteList.find(m => m.san === moveSan);

    if (totalAmateurGames === 0) return { include: false };

    const probability = aTotal / totalAmateurGames;
    const amateurWhiteWinRate = aTotal > 0 ? amateurData.white / aTotal : 0;
    const masterThreatScore = calculateMasterThreatScore(mastersData, eliteData);

    let requiredProbability = 0.15; 
    if (currentMoveNumber <= 4) requiredProbability = 0.05;
    else if (currentMoveNumber <= 8) requiredProbability = 0.10;
    
    if (probability >= requiredProbability) {
        return { include: true, reason: "Mainline", isTrap: false, probability };
    }

    if (probability >= 0.01 && amateurWhiteWinRate >= 0.55) {
        return { include: true, reason: "Amateur Trap", isTrap: true, probability };
    }

    if (masterThreatScore >= 0.45) {
        return { include: true, reason: "Master Threat", isTrap: true, probability };
    }

    return { include: false };
}

// Black move evaluator
async function evaluateBlackMove(fen: string, chess: Chess, moveNumber: number, previousMovesSan: string[]) {
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  
  // Seed first move preferences
  if (moveNumber === 1 && previousMovesSan.length === 1) {
    const whiteFirstMove = previousMovesSan[0];
    if (whiteFirstMove === "e4") return { selectedMoveSan: "c6", selectedStats: { score: 1, weightedCount: 999 }, selectedEngineCp: await getEngineEval(fen), explanation: "Caro-Kann" };
    if (whiteFirstMove === "d4") return { selectedMoveSan: "d5", selectedStats: { score: 1, weightedCount: 999 }, selectedEngineCp: await getEngineEval(fen), explanation: "QGD Structure" };
    
    // For c4, Nf3, etc. Ask Gemini!
    try {
      const prompt = `White just played ${whiteFirstMove} on move 1. I am a Black player who plays the Caro-Kann against 1.e4 and QGD/Slav structures against 1.d4 (starting with 1...d5). 
What is a solid, theoretical 1st move for Black against ${whiteFirstMove} that often transposes into similar solid structures (e.g., c6 or d5 setups)? 
Reply ONLY with the exact standard algebraic notation of the single best move (e.g. c6). Do not include any other text.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });
      const suggestedMove = response.text?.trim().replace(/[^a-zA-Z0-9]/g, '');
      if (suggestedMove && chess.moves().includes(suggestedMove)) {
         return { selectedMoveSan: suggestedMove, selectedStats: { score: 1, weightedCount: 999 }, selectedEngineCp: await getEngineEval(fen), explanation: `Gemini Transposition Suggestion (${suggestedMove})` };
      }
    } catch (e) {
      console.warn("Gemini suggestion failed for move 1, falling back to math.");
    }
  }

  let mergedMoves: Record<string, any> = {};
  
  try {
    const mastersUrl = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(strippedFen)}`;
    const mastersData = await fetchWithRetry(mastersUrl);
    if (mastersData && mastersData.moves) {
      for (const m of mastersData.moves) {
        mergedMoves[m.san] = {
          san: m.san, mastersCount: m.white + m.draws + m.black,
          mastersBlackWin: m.black, mastersDraws: m.draws,
          onlineCount: 0, onlineBlackWin: 0, onlineDraws: 0
        };
      }
    }
  } catch (e) {}

  await delay(1000); // Be gentle

  try {
    const onlineUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(strippedFen)}&speeds=classical&ratings=2500`;
    const onlineData = await fetchWithRetry(onlineUrl);
    if (onlineData && onlineData.moves) {
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

  const MIN_GAMES_THRESHOLD = 5;
    const candidateMoves = Object.values(mergedMoves).map(m => {
    const weightedCount = (m.mastersCount * 5) + m.onlineCount;
    const weightedBlackWins = (m.mastersBlackWin * 5) + m.onlineBlackWin;
    const weightedDraws = (m.mastersDraws * 5) + m.onlineDraws;
    
    // THE SKEPTICAL PRIOR: Add 50 dummy White wins to pull flukes down to 0%
    const smoothedCount = weightedCount + 50;
    
    // Calculate score based on actual wins/draws, not "tricks"
    const score = (weightedBlackWins + (0.5 * weightedDraws)) / smoothedCount;
    
    return { ...m, weightedCount, score };
  }).filter(m => m.weightedCount >= MIN_GAMES_THRESHOLD);

  candidateMoves.sort((a, b) => b.score - a.score);

  let bestCp = 0;
  let enginePvs: any[] = [];
  try {
    const cloudUrl = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(strippedFen)}&multiPv=5`;
    const cloudData = await fetchWithRetry(cloudUrl);
    if (cloudData && !cloudData.error && cloudData.pvs && cloudData.pvs.length > 0) {
      enginePvs = cloudData.pvs;
      bestCp = enginePvs[0].cp;
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
        if (enginePv && Math.abs(enginePv.cp - bestCp) <= 80) {
          selectedMoveSan = candidate.san;
          selectedStats = candidate;
          selectedEngineCp = enginePv.cp;
          break;
        }
      } catch(e) {}
    }
  }

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

  // FALLBACK: If Cloud Eval is missing/fails, just pick the top human move
  if (!selectedMoveSan && candidateMoves.length > 0) {
    selectedMoveSan = candidateMoves[0].san;
    selectedStats = candidateMoves[0];
  }

  return { selectedMoveSan, selectedStats, selectedEngineCp };
}

// Phase 4: BFS Generator
async function generateRepertoire(startFen: string, maxDepth: number) {
  console.log("Initializing BFS Tree Generator...");

  let user = await prisma.user.findUnique({ where: { username: "Yaroslav" } });
  if (!user) { user = await prisma.user.create({ data: { username: "Yaroslav" } }); }

  let repertoire = await prisma.repertoire.findFirst({ where: { title: "Black Universal Repertoire", userId: user.id } });
  if (!repertoire) {
    repertoire = await prisma.repertoire.create({
      data: { title: "Black Universal Repertoire", color: "black", userId: user.id }
    });
  }

  const queue = [{ fen: startFen, currentMoveNumber: 1, trapDepth: 0, cumulativeProb: 1.0, history: [] as string[] }];
  
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;

    console.log(`\n--- Queue Size: ${queue.length} | Move: ${node.currentMoveNumber} | Trap Depth: ${node.trapDepth} ---`);
    console.log(`History: ${node.history.join(" ")}`);

    // Calculate Dynamic Depth Limit based on Cumulative Probability
    let dynamicMaxDepth = 5; // Default shallow depth for rare stuff (< 0.5%)
    
    if (node.cumulativeProb > 0.02) { 
        dynamicMaxDepth = 15; // Tier 1: > 2% (The absolute mainlines)
    } else if (node.cumulativeProb > 0.005) {
        dynamicMaxDepth = 8;  // Tier 2: > 0.5% (Common variations)
    }

    dynamicMaxDepth = Math.min(dynamicMaxDepth, maxDepth);

    if (node.currentMoveNumber > dynamicMaxDepth) {
      console.log(`Hit dynamic depth limit (${dynamicMaxDepth} moves) for prob ${(node.cumulativeProb*100).toFixed(2)}%. Stopping branch.`);
      continue;
    }
    if (node.trapDepth >= 3) {
      console.log(`Trap refutation limit reached (3). Stopping branch.`);
      continue;
    }

    const posId = (await getOrCreatePosition(node.fen)).id;
    const [masters, elite, amateur] = await fetchAllDatabases(node.fen);
    
    // Aggregate White candidate moves from all sources
    const allWhiteSan = new Set<string>();
    if (masters.moves) masters.moves.forEach((m: any) => allWhiteSan.add(m.san));
    if (elite.moves) elite.moves.forEach((m: any) => allWhiteSan.add(m.san));
    if (amateur.moves) amateur.moves.forEach((m: any) => allWhiteSan.add(m.san));

    const whiteCandidates = Array.from(allWhiteSan).map(san => {
       const filterResult = shouldIncludeWhiteMove(san, node.currentMoveNumber, masters.moves || [], elite.moves || [], amateur.moves || [], amateur.totalGames || 0);
       return { san, ...filterResult };
    }).filter(m => m.include);

    console.log(`Found ${whiteCandidates.length} White threats/mainlines to process.`);

    for (const whiteMove of whiteCandidates) {
      console.log(`\nEvaluating White Move: ${whiteMove.san} (Reason: ${whiteMove.reason}, Prob: ${whiteMove.probability ? (whiteMove.probability*100).toFixed(1) : 0}%)`);
      const tempChess = new Chess(node.fen);
      tempChess.move(whiteMove.san);
      const fenAfterWhite = tempChess.fen();
      const posAfterWhite = await getOrCreatePosition(fenAfterWhite);

      // ==========================================
      // NEW: SKIP ALREADY GENERATED ENTRIES
      // ==========================================
      const existingStat = await prisma.repertoirePositionStat.findUnique({
        where: { repertoireId_positionId: { repertoireId: repertoire.id, positionId: posAfterWhite.id } }
      });

      if (existingStat) {
        const dbBlackMove = await prisma.move.findUnique({ where: { id: existingStat.targetMoveId } });
        if (dbBlackMove) {
          console.log(`[SKIPPED API] Already generated in DB! Black responds with: ${dbBlackMove.san} -> ${existingStat.explanation}`);
          
          tempChess.move(dbBlackMove.san);
          const fenAfterBlack = tempChess.fen();
          
          queue.push({
            fen: fenAfterBlack,
            currentMoveNumber: node.currentMoveNumber + 1,
            trapDepth: whiteMove.isTrap ? node.trapDepth + 1 : 0,
            cumulativeProb: node.cumulativeProb * (whiteMove.probability || 1.0),
            history: [...node.history, whiteMove.san, dbBlackMove.san]
          });
          
          continue; // Instantly move to the next White candidate!
        }
      }
      // ==========================================
      
      let dbWhiteMove = await prisma.move.findFirst({ where: { fromPositionId: posId, toPositionId: posAfterWhite.id, san: whiteMove.san } });
      if (!dbWhiteMove) {
        dbWhiteMove = await prisma.move.create({ data: { san: whiteMove.san, fromPositionId: posId, toPositionId: posAfterWhite.id } });
      }

      // Evaluate Black Response
      const newHistory = [...node.history, whiteMove.san];
      const algoResult = await evaluateBlackMove(fenAfterWhite, tempChess, node.currentMoveNumber, newHistory);

      if (!algoResult.selectedMoveSan) {
        console.log("No valid Black move found. Stopping branch.");
        continue;
      }

      let explanation = algoResult.explanation || "";
      if (!explanation) {
        if (algoResult.selectedStats?.weightedCount === 0) {
           explanation = `Engine Fallback | Eval: ${algoResult.selectedEngineCp !== null ? (algoResult.selectedEngineCp/100).toFixed(2) : "N/A"}`;
        } else {
           explanation = `Score: ${(algoResult.selectedStats?.score * 100).toFixed(1)}% | Weighted Vol: ${algoResult.selectedStats?.weightedCount} | Eval: ${algoResult.selectedEngineCp !== null ? (algoResult.selectedEngineCp/100).toFixed(2) : "N/A"}`;
        }
      }
      
      console.log(`Black responds with: ${algoResult.selectedMoveSan} -> ${explanation}`);

      tempChess.move(algoResult.selectedMoveSan);
      const fenAfterBlack = tempChess.fen();
      const posAfterBlack = await getOrCreatePosition(fenAfterBlack);

      let dbBlackMove = await prisma.move.findFirst({ where: { fromPositionId: posAfterWhite.id, toPositionId: posAfterBlack.id, san: algoResult.selectedMoveSan } });
      if (!dbBlackMove) {
        dbBlackMove = await prisma.move.create({ data: { san: algoResult.selectedMoveSan, fromPositionId: posAfterWhite.id, toPositionId: posAfterBlack.id } });
      }

      const emptyCard = createEmptyCard();
      await prisma.repertoirePositionStat.upsert({
        where: { repertoireId_positionId: { repertoireId: repertoire.id, positionId: posAfterWhite.id } },
        update: { targetMoveId: dbBlackMove.id, explanation: explanation },
        create: { 
          repertoireId: repertoire.id, 
          positionId: posAfterWhite.id, 
          targetMoveId: dbBlackMove.id, 
          explanation: explanation,
          due: emptyCard.due,
          stability: emptyCard.stability,
          difficulty: emptyCard.difficulty,
          elapsed_days: emptyCard.elapsed_days,
          scheduled_days: emptyCard.scheduled_days,
          reps: emptyCard.reps,
          lapses: emptyCard.lapses,
          state: emptyCard.state,
          last_review: emptyCard.last_review || null
        }
      });

      queue.push({
        fen: fenAfterBlack,
        currentMoveNumber: node.currentMoveNumber + 1,
        trapDepth: whiteMove.isTrap ? node.trapDepth + 1 : 0,
        cumulativeProb: node.cumulativeProb * (whiteMove.probability || 1.0),
        history: [...newHistory, algoResult.selectedMoveSan]
      });

      await delay(2000); // Respect API limits
    }
  }
  
  console.log("BFS Generation Complete!");
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
generateRepertoire(START_FEN, 3).catch(console.error).finally(() => prisma.$disconnect());
