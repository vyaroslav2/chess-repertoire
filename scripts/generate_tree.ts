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

async function fetchWikiSnippet(title: string) {
  try {
    // Attempt to fetch from Wikipedia. 
    // Lichess titles might be like "Caro-Kann Defense: Advance Variation".
    // We can try the full title, and if it fails, try just the part before the colon.
    const fetchWiki = async (t: string) => {
      const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(t)}&format=json`;
      const res = await fetch(url);
      const data = await res.json();
      const pages = data.query.pages;
      const pageId = Object.keys(pages)[0];
      if (pageId !== "-1") return pages[pageId].extract;
      return null;
    };

    let extract = await fetchWiki(title);
    if (!extract && title.includes(":")) {
       extract = await fetchWiki(title.split(":")[0].trim());
    }
    return extract;
  } catch(e) {}
  return null;
}

async function getOrCreatePosition(fen: string, openingMetadata?: { eco: string, name: string }) {
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  let pos = await prisma.position.findUnique({ where: { fen: strippedFen } });
  
  if (!pos) { 
    let wikiText = null;
    if (openingMetadata && openingMetadata.name) {
      wikiText = await fetchWikiSnippet(openingMetadata.name);
    }
    pos = await prisma.position.create({ 
      data: { 
        fen: strippedFen,
        eco: openingMetadata?.eco || null,
        openingName: openingMetadata?.name || null,
        wikiText: wikiText
      } 
    }); 
  } else if (openingMetadata && openingMetadata.name && !pos.openingName) {
    // If we discovered the opening name later, update it
    let wikiText = pos.wikiText;
    if (!wikiText) wikiText = await fetchWikiSnippet(openingMetadata.name);
    
    pos = await prisma.position.update({
      where: { id: pos.id },
      data: {
        eco: openingMetadata.eco,
        openingName: openingMetadata.name,
        wikiText: wikiText
      }
    });
  }
  return pos;
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

function shouldIncludeWhiteMove(moveSan: string, currentMoveNumber: number, mastersList: any[], eliteList: any[], amateurList: any[], totalAmateurGames: number) {
    const amateurData = amateurList.find(m => m.san === moveSan) || { white: 0, draws: 0, black: 0 };
    const aTotal = amateurData.white + amateurData.draws + amateurData.black;
    const mastersData = mastersList.find(m => m.san === moveSan);
    const eliteData = eliteList.find(m => m.san === moveSan);

    let include = false;
    let reason = "";
    let isTrap = false;
    let probability = totalAmateurGames > 0 ? aTotal / totalAmateurGames : 0;

    if (totalAmateurGames > 0) {
      const amateurWhiteWinRate = aTotal > 0 ? amateurData.white / aTotal : 0;
      const masterThreatScore = calculateMasterThreatScore(mastersData, eliteData);

      let requiredProbability = 0.15; 
      if (currentMoveNumber <= 4) requiredProbability = 0.05;
      else if (currentMoveNumber <= 8) requiredProbability = 0.10;
      
      if (probability >= requiredProbability) {
          include = true;
          reason = "Mainline";
      } else if (probability >= 0.01 && amateurWhiteWinRate >= 0.55) {
          include = true;
          reason = "Amateur Trap";
          isTrap = true;
      } else if (masterThreatScore >= 0.45) {
          include = true;
          reason = "Master Threat";
          isTrap = true;
      }
    }

    // Compile the comprehensive stats to save in DB
    const mTotal = mastersData ? (mastersData.white + mastersData.draws + mastersData.black) : 0;
    const mWin = mTotal > 0 ? mastersData.white / mTotal : 0;
    const mDraw = mTotal > 0 ? mastersData.draws / mTotal : 0;
    const mLoss = mTotal > 0 ? mastersData.black / mTotal : 0;

    const aWin = aTotal > 0 ? amateurData.white / aTotal : 0;
    const aDraw = aTotal > 0 ? amateurData.draws / aTotal : 0;
    const aLoss = aTotal > 0 ? amateurData.black / aTotal : 0;

    return { 
      include, reason, isTrap, probability,
      mastersGames: mTotal, mastersWin: mWin, mastersDraw: mDraw, mastersLoss: mLoss,
      lichessGames: aTotal, lichessWin: aWin, lichessDraw: aDraw, lichessLoss: aLoss
    };
}

async function evaluateBlackMove(fen: string, posId: string, chess: Chess, moveNumber: number, previousMovesSan: string[]) {
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  
  let mergedMoves: Record<string, any> = {};
  
  try {
    const mastersUrl = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(strippedFen)}`;
    const mastersData = await fetchWithRetry(mastersUrl);
    if (mastersData && mastersData.moves) {
      let rank = 1;
      for (const m of mastersData.moves) {
        const total = m.white + m.draws + m.black;
        mergedMoves[m.san] = {
          san: m.san, mastersCount: total,
          mastersBlackWin: m.black, mastersDraws: m.draws, mastersWhiteWin: m.white,
          onlineCount: 0, onlineBlackWin: 0, onlineDraws: 0, onlineWhiteWin: 0
        };
        // Save to ExplorerMove
        await prisma.explorerMove.create({
          data: {
            positionId: posId, dbType: "masters", san: m.san, games: total, rank: rank++,
            win: total > 0 ? m.white/total : 0, draw: total > 0 ? m.draws/total : 0, loss: total > 0 ? m.black/total : 0
          }
        });
      }
    }
  } catch (e) {}

  await delay(1000);

  try {
    const onlineUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(strippedFen)}&speeds=classical&ratings=2500`;
    const onlineData = await fetchWithRetry(onlineUrl);
    if (onlineData && onlineData.moves) {
      let rank = 1;
      for (const m of onlineData.moves) {
        const total = m.white + m.draws + m.black;
        if (mergedMoves[m.san]) {
          mergedMoves[m.san].onlineCount = total;
          mergedMoves[m.san].onlineBlackWin = m.black;
          mergedMoves[m.san].onlineDraws = m.draws;
          mergedMoves[m.san].onlineWhiteWin = m.white;
        } else {
          mergedMoves[m.san] = {
            san: m.san, mastersCount: 0, mastersBlackWin: 0, mastersDraws: 0, mastersWhiteWin: 0,
            onlineCount: total, onlineBlackWin: m.black, onlineDraws: m.draws, onlineWhiteWin: m.white
          };
        }
        // Save to ExplorerMove
        await prisma.explorerMove.create({
          data: {
            positionId: posId, dbType: "lichess", san: m.san, games: total, rank: rank++,
            win: total > 0 ? m.white/total : 0, draw: total > 0 ? m.draws/total : 0, loss: total > 0 ? m.black/total : 0
          }
        });
      }
    }
  } catch (e) {}

  const MIN_GAMES_THRESHOLD = 5;
  const candidateMoves = Object.values(mergedMoves).map(m => {
    const weightedCount = (m.mastersCount * 5) + m.onlineCount;
    const weightedBlackWins = (m.mastersBlackWin * 5) + m.onlineBlackWin;
    const weightedDraws = (m.mastersDraws * 5) + m.onlineDraws;
    
    const smoothedCount = weightedCount + 50;
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
      
      // Save Engine Eval Top Moves
      let rank = 1;
      for (const pv of enginePvs) {
        const lan = pv.moves.split(" ")[0];
        try {
          const tempChess = new Chess(fen);
          const fromSq = lan.substring(0, 2);
          const toSq = lan.substring(2, 4);
          const promotion = lan.length === 5 ? lan[4] : undefined;
          const moveResult = tempChess.move({ from: fromSq, to: toSq, promotion } as any);
          
          await prisma.engineEval.create({
            data: {
              positionId: posId, san: moveResult.san, cp: pv.cp, mate: pv.mate || null, rank: rank++
            }
          });
        } catch(e) {}
      }
    }
  } catch (e) {}

  let selectedMoveSan: string | null = null;
  let selectedStats: any = null;
  let selectedEngineCp: number | null = null;

  if (moveNumber === 1 && previousMovesSan.length === 1) {
    const whiteFirstMove = previousMovesSan[0];
    if (whiteFirstMove === "e4") { selectedMoveSan = "c6"; selectedStats = candidateMoves.find(m => m.san === "c6"); selectedEngineCp = bestCp; }
    else if (whiteFirstMove === "d4") { selectedMoveSan = "d5"; selectedStats = candidateMoves.find(m => m.san === "d5"); selectedEngineCp = bestCp; }
    else {
      try {
        const prompt = `White just played ${whiteFirstMove} on move 1. I am a Black player who plays the Caro-Kann against 1.e4 and QGD/Slav structures against 1.d4 (starting with 1...d5). 
Reply ONLY with the exact standard algebraic notation of the single best move (e.g. c6). Do not include any other text.`;
        const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
        const suggestedMove = response.text?.trim().replace(/[^a-zA-Z0-9]/g, '');
        if (suggestedMove && chess.moves().includes(suggestedMove)) {
           selectedMoveSan = suggestedMove;
           selectedStats = candidateMoves.find(m => m.san === suggestedMove);
           selectedEngineCp = bestCp;
        }
      } catch (e) {}
    }
  }

  if (!selectedMoveSan && enginePvs.length > 0 && candidateMoves.length > 0) {
    for (const candidate of candidateMoves) {
      try {
        const moveResult = chess.move(candidate.san);
        chess.undo();
        const lan = moveResult.lan; 
        const enginePv = enginePvs.find(pv => pv.moves.split(" ")[0] === lan);
        // Engine perspective is for White. If it's Black's turn, engine CP is still from White's POV.
        // Wait, Lichess cloud eval CP is always from White's POV.
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
      selectedStats = candidateMoves.find(m => m.san === selectedMoveSan) || null;
    } catch(e) {}
  }

  if (!selectedMoveSan && candidateMoves.length > 0) {
    selectedMoveSan = candidateMoves[0].san;
    selectedStats = candidateMoves[0];
  }

  return { selectedMoveSan, selectedStats, selectedEngineCp };
}

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

    let dynamicMaxDepth = 5; 
    if (node.cumulativeProb > 0.02) { 
        dynamicMaxDepth = 15;
    } else if (node.cumulativeProb > 0.005) {
        dynamicMaxDepth = 8;
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

    const [masters, elite, amateur] = await fetchAllDatabases(node.fen);
    
    // Create/update position and potentially fetch Wiki snippet using the opening data from masters DB
    const posId = (await getOrCreatePosition(node.fen, masters.opening)).id;
    
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
      
      const newHistory = [...node.history, whiteMove.san];
      
      const isTrapFlag = whiteMove.isTrap || false;
      const posAfterWhite = await prisma.position.findUnique({ where: { fen: fenAfterWhite.split(" ").slice(0, 4).join(" ") } }) || 
                            await prisma.position.create({ data: { fen: fenAfterWhite.split(" ").slice(0, 4).join(" "), isTrap: isTrapFlag } });

      // Update position trap flag if it is newly identified as a trap in another line
      if (isTrapFlag && !posAfterWhite.isTrap) {
          await prisma.position.update({ where: { id: posAfterWhite.id }, data: { isTrap: true }});
      }

      const existingStat = await prisma.repertoirePositionStat.findUnique({
        where: { repertoireId_positionId: { repertoireId: repertoire.id, positionId: posAfterWhite.id } }
      });

      if (existingStat) {
        const dbBlackMove = await prisma.move.findUnique({ where: { id: existingStat.targetMoveId } });
        if (dbBlackMove) {
          console.log(`[SKIPPED API] Already generated in DB! Black responds with: ${dbBlackMove.san}`);
          
          tempChess.move(dbBlackMove.san);
          const fenAfterBlack = tempChess.fen();
          
          queue.push({
            fen: fenAfterBlack,
            currentMoveNumber: node.currentMoveNumber + 1,
            trapDepth: whiteMove.isTrap ? node.trapDepth + 1 : 0,
            cumulativeProb: node.cumulativeProb * (whiteMove.probability || 1.0),
            history: [...node.history, whiteMove.san, dbBlackMove.san]
          });
          
          continue; 
        }
      }
      
      let dbWhiteMove = await prisma.move.findFirst({ where: { fromPositionId: posId, toPositionId: posAfterWhite.id, san: whiteMove.san } });
      if (!dbWhiteMove) {
        dbWhiteMove = await prisma.move.create({ 
          data: { 
            san: whiteMove.san, 
            fromPositionId: posId, 
            toPositionId: posAfterWhite.id,
            prob: whiteMove.probability,
            cumulativeProb: node.cumulativeProb * (whiteMove.probability || 1.0),
            mastersGames: whiteMove.mastersGames,
            mastersWin: whiteMove.mastersWin,
            mastersDraw: whiteMove.mastersDraw,
            mastersLoss: whiteMove.mastersLoss,
            lichessGames: whiteMove.lichessGames,
            lichessWin: whiteMove.lichessWin,
            lichessDraw: whiteMove.lichessDraw,
            lichessLoss: whiteMove.lichessLoss
          } 
        });
      } else {
        await prisma.move.update({
          where: { id: dbWhiteMove.id },
          data: { cumulativeProb: node.cumulativeProb * (whiteMove.probability || 1.0) }
        });
      }

      const algoResult = await evaluateBlackMove(fenAfterWhite, posAfterWhite.id, tempChess, node.currentMoveNumber, newHistory);

      if (!algoResult.selectedMoveSan) {
        console.log("No valid Black move found. Stopping branch.");
        continue;
      }

      let explanation = `Score: ${(algoResult.selectedStats?.score * 100 || 0).toFixed(1)}% | Weighted Vol: ${algoResult.selectedStats?.weightedCount || 0} | Eval: ${algoResult.selectedEngineCp !== null ? (algoResult.selectedEngineCp/100).toFixed(2) : "N/A"}`;
      console.log(`Black responds with: ${algoResult.selectedMoveSan} -> ${explanation}`);

      tempChess.move(algoResult.selectedMoveSan);
      const fenAfterBlack = tempChess.fen();
      const posAfterBlack = await prisma.position.findUnique({ where: { fen: fenAfterBlack.split(" ").slice(0, 4).join(" ") } }) || 
                            await prisma.position.create({ data: { fen: fenAfterBlack.split(" ").slice(0, 4).join(" ") } });

      let dbBlackMove = await prisma.move.findFirst({ where: { fromPositionId: posAfterWhite.id, toPositionId: posAfterBlack.id, san: algoResult.selectedMoveSan } });
      if (!dbBlackMove) {
        // Calculate probability of Black's move based on masters
        let bProb = 0;
        let mGames = 0, mWin = 0, mDraw = 0, mLoss = 0;
        let lGames = 0, lWin = 0, lDraw = 0, lLoss = 0;
        if (algoResult.selectedStats) {
           const s = algoResult.selectedStats;
           if (s.mastersCount > 0) {
               mGames = s.mastersCount;
               mWin = s.mastersWhiteWin / mGames;
               mDraw = s.mastersDraws / mGames;
               mLoss = s.mastersBlackWin / mGames;
           }
           if (s.onlineCount > 0) {
               lGames = s.onlineCount;
               lWin = s.onlineWhiteWin / lGames;
               lDraw = s.onlineDraws / lGames;
               lLoss = s.onlineBlackWin / lGames;
           }
        }

        dbBlackMove = await prisma.move.create({ 
          data: { 
            san: algoResult.selectedMoveSan, 
            fromPositionId: posAfterWhite.id, 
            toPositionId: posAfterBlack.id,
            eval: algoResult.selectedEngineCp ? algoResult.selectedEngineCp / 100 : null,
            weightedCount: algoResult.selectedStats?.weightedCount || 0,
            mastersGames: mGames, mastersWin: mWin, mastersDraw: mDraw, mastersLoss: mLoss,
            lichessGames: lGames, lichessWin: lWin, lichessDraw: lDraw, lichessLoss: lLoss
          } 
        });
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

      await delay(2000); 
    }
  }
  
  console.log("BFS Generation Complete!");
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
generateRepertoire(START_FEN, 4).catch(console.error).finally(() => prisma.$disconnect());
