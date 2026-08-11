import { Chess } from "chess.js";
import { prisma, getOrCreatePosition } from "../db/operations";
import { fetchAllDatabases } from "../api/lichess";
import { shouldIncludeWhiteMove, evaluateBlackMove } from "./evaluator";
import { getSmoothedWinRate } from "./math";
import { delay } from "../api/retry";
import { createEmptyCard } from "ts-fsrs";

export async function generateRepertoire(startFen: string, maxDepth: number) {
  console.log("Initializing BFS Tree Generator...");
  
  const startTime = Date.now();
  let totalPositionsProcessed = 0;
  let totalWhiteMovesFound = 0;
  let totalWhiteMainlines = 0;
  let totalWhiteTraps = 0;
  let totalWhiteThreats = 0;
  let totalBlackMovesEvaluated = 0;
  let totalNaEvals = 0;

  let user = await prisma.user.findUnique({ where: { username: "Yaroslav" } });
  if (!user) { user = await prisma.user.create({ data: { username: "Yaroslav" } }); }

  let repertoire = await prisma.repertoire.findFirst({ where: { title: "Black Universal Repertoire", userId: user.id } });
  if (!repertoire) {
    repertoire = await prisma.repertoire.create({
      data: { title: "Black Universal Repertoire", color: "black", userId: user.id }
    });
  }

  const queue = [{ fen: startFen, currentMoveNumber: 1, trapDepth: 0, cumulativeProb: 1.0, history: [] as string[] }];
  const visitedFens = new Set<string>();
  
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    
    if (visitedFens.has(node.fen)) {
      console.log(`[BFS] Skipping transposition: ${node.fen}`);
      continue;
    }
    visitedFens.add(node.fen);
    
    totalPositionsProcessed++;

    const currentElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\n--- Queue Size: ${queue.length} | Move: ${node.currentMoveNumber} | Trap Depth: ${node.trapDepth} ---`);
    console.log(`History: ${node.history.join(" ")}`);
    console.log(`[Stats] Elapsed: ${currentElapsed}s | Positions Processed: ${totalPositionsProcessed} | N/A Evals: ${totalNaEvals}`);

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
    
    const posId = (await getOrCreatePosition(node.fen, masters.opening, node.history)).id;
    
    const allWhiteSan = new Set<string>();
    if (masters.moves) masters.moves.forEach((m: any) => allWhiteSan.add(m.san));
    if (elite.moves) elite.moves.forEach((m: any) => allWhiteSan.add(m.san));
    if (amateur.moves) amateur.moves.forEach((m: any) => allWhiteSan.add(m.san));

    const whiteCandidates = Array.from(allWhiteSan).map(san => {
       const filterResult = shouldIncludeWhiteMove(san, node.currentMoveNumber, masters.moves || [], elite.moves || [], amateur.moves || [], amateur.totalGames || 0);
       return { san, ...filterResult };
    }).filter(m => m.include);

    console.log(`Found ${whiteCandidates.length} White threats/mainlines to process.`);
    totalWhiteMovesFound += whiteCandidates.length;

    for (const whiteMove of whiteCandidates) {
      if (whiteMove.reason === "Mainline") totalWhiteMainlines++;
      else if (whiteMove.reason === "Amateur Trap") totalWhiteTraps++;
      else if (whiteMove.reason === "Master Threat") totalWhiteThreats++;

      console.log(`\nEvaluating White Move: ${whiteMove.san} (Reason: ${whiteMove.reason}, Prob: ${whiteMove.probability ? (whiteMove.probability*100).toFixed(1) : 0}%)`);
      const tempChess = new Chess(node.fen);
      tempChess.move(whiteMove.san);
      const fenAfterWhite = tempChess.fen();
      
      const newHistory = [...node.history, whiteMove.san];
      
      const posAfterWhite = await getOrCreatePosition(fenAfterWhite, undefined, newHistory);

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
      const incomingPathProb = node.cumulativeProb * (whiteMove.probability || 1.0);
      
      if (!dbWhiteMove) {
        dbWhiteMove = await prisma.move.create({ 
          data: { 
            san: whiteMove.san, 
            fromPositionId: posId, 
            toPositionId: posAfterWhite.id,
            prob: whiteMove.probability,
            cumulativeProb: incomingPathProb,
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
        
        await prisma.position.update({
            where: { id: posAfterWhite.id },
            data: { trueProbability: { increment: incomingPathProb } }
        });
      } else {
        await prisma.move.update({
          where: { id: dbWhiteMove.id },
          data: { cumulativeProb: Math.max(dbWhiteMove.cumulativeProb || 0, incomingPathProb) }
        });
        
        await prisma.position.update({
            where: { id: posAfterWhite.id },
            data: { trueProbability: { increment: incomingPathProb } }
        });
      }

      const algoResult = await evaluateBlackMove(fenAfterWhite, posAfterWhite.id, tempChess, node.currentMoveNumber, newHistory);
      
      const evalIsSafe = algoResult.selectedEngineCp !== null && algoResult.selectedEngineCp >= -200 && algoResult.selectedEngineCp <= 60;

      if (evalIsSafe) {
          const masterSmoothed = getSmoothedWinRate(
              whiteMove.mastersWin * whiteMove.mastersGames,
              whiteMove.mastersDraw * whiteMove.mastersGames,
              whiteMove.mastersGames,
              50, 0.52 
          );
          
          const amateurSmoothed = getSmoothedWinRate(
              whiteMove.lichessWin * whiteMove.lichessGames,
              whiteMove.lichessDraw * whiteMove.lichessGames,
              whiteMove.lichessGames,
              50, 0.52
          );

          let isMasterThreat = false;
          let isAmateurTrap = false;

          if (whiteMove.mastersGames >= 15 && masterSmoothed >= 0.58) {
              isMasterThreat = true;
          }
          
          if (whiteMove.lichessGames >= 15 && amateurSmoothed >= 0.58 && !isMasterThreat) {
              isAmateurTrap = true;
          }

          if (isMasterThreat || isAmateurTrap) {
              await prisma.position.update({
                  where: { id: posAfterWhite.id },
                  data: { isMasterThreat, isAmateurTrap }
              });
              console.log(`[ALERT] Flagged ${whiteMove.san} as ${isMasterThreat ? 'Master Threat' : 'Amateur Trap'}! (Eval: ${algoResult.selectedEngineCp})`);
          }
      }

      if (!algoResult.selectedMoveSan) {
        console.log("No valid Black move found. Stopping branch.");
        continue;
      }
      
      totalBlackMovesEvaluated++;
      if (algoResult.selectedEngineCp === null) {
          totalNaEvals++;
      }

      let scoreStr = "N/A";
      let volStr = "0";
      if (algoResult.selectedStats) {
          scoreStr = (algoResult.selectedStats.score * 100).toFixed(1) + "%";
          volStr = algoResult.selectedStats.weightedCount.toString();
      }

      console.log(`Black responds with: ${algoResult.selectedMoveSan} -> Score: ${scoreStr} | Weighted Vol: ${volStr} | ${algoResult.evalSource} Eval: ${algoResult.selectedEngineCp !== null ? (algoResult.selectedEngineCp / 100).toFixed(2) : "N/A"}`);
      let explanation = `Score: ${scoreStr} | Weighted Vol: ${volStr} | Eval: ${algoResult.selectedEngineCp !== null ? (algoResult.selectedEngineCp/100).toFixed(2) : "N/A"}`;

      tempChess.move(algoResult.selectedMoveSan);
      const fenAfterBlack = tempChess.fen();
      const posAfterBlack = await getOrCreatePosition(fenAfterBlack, undefined, [...newHistory, algoResult.selectedMoveSan]);

      let dbBlackMove = await prisma.move.findFirst({ where: { fromPositionId: posAfterWhite.id, toPositionId: posAfterBlack.id, san: algoResult.selectedMoveSan } });
      if (!dbBlackMove) {
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
            lichessEval: algoResult.lichessCp ? algoResult.lichessCp / 100 : null,
            chessdbEval: algoResult.chessdbCp ? algoResult.chessdbCp / 100 : null,
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
  
  const endTime = Date.now();
  const timeElapsed = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log("\n========================================================");
  console.log("=== TREE GENERATION SUMMARY ===");
  console.log(`Time Elapsed:             ${timeElapsed} seconds`);
  console.log(`Total Nodes Processed:    ${totalPositionsProcessed}`);
  console.log(`White Moves Found:        ${totalWhiteMovesFound}`);
  console.log(`  - Mainlines:            ${totalWhiteMainlines}`);
  console.log(`  - Master Threats:       ${totalWhiteThreats}`);
  console.log(`  - Amateur Traps:        ${totalWhiteTraps}`);
  console.log(`Total Black Responses:    ${totalBlackMovesEvaluated}`);
  console.log(`Total N/A Evals (Null):   ${totalNaEvals}`);
  console.log("========================================================\n");
  console.log("Generation Complete!");
}
