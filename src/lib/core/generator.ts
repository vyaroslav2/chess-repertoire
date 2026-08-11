import { Chess } from "chess.js";
import { prisma, getOrCreatePositionCache, getRepertoireNode, createRepertoireNode, createRepertoireMove } from "../db/operations";
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
  let totalSkippedMoves = 0;
  let totalNaEvals = 0;

  let user = await prisma.user.findUnique({ where: { username: "Yaroslav" } });
  if (!user) { user = await prisma.user.create({ data: { username: "Yaroslav" } }); }

  let repertoire = await prisma.repertoire.findFirst({ where: { title: "Black Universal Repertoire", userId: user.id } });
  if (!repertoire) {
    repertoire = await prisma.repertoire.create({
      data: { title: "Black Universal Repertoire", color: "black", userId: user.id }
    });
  }

  // Ensure root node exists
  await getOrCreatePositionCache(startFen);
  let rootNode = await getRepertoireNode(repertoire.id, "");
  if (!rootNode) {
    rootNode = await createRepertoireNode(repertoire.id, startFen, "", 1.0);
  }

  const queue = [{ 
    nodeId: rootNode.id,
    fen: startFen, 
    currentMoveNumber: 1, 
    trapDepth: 0, 
    cumulativeProb: 1.0, 
    history: [] as string[] 
  }];
  
  const visitedPgns = new Set<string>();
  
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    
    const pgnString = node.history.join(" ");
    if (visitedPgns.has(pgnString)) {
      continue;
    }
    visitedPgns.add(pgnString);
    
    totalPositionsProcessed++;

    const currentElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\n--- Queue Size: ${queue.length} | Move: ${node.currentMoveNumber} | Trap Depth: ${node.trapDepth} ---`);
    console.log(`History: ${pgnString}`);
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
    await getOrCreatePositionCache(node.fen, masters.opening, node.history);
    
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
      else if (whiteMove.reason.startsWith("Amateur Trap")) totalWhiteTraps++;
      else if (whiteMove.reason.startsWith("Master Threat")) totalWhiteThreats++;

      console.log(`\nEvaluating White Move: ${whiteMove.san} (Reason: ${whiteMove.reason}, Prob: ${whiteMove.probability ? (whiteMove.probability*100).toFixed(1) : 0}%)`);
      const tempChess = new Chess(node.fen);
      tempChess.move(whiteMove.san);
      const fenAfterWhite = tempChess.fen();
      
      const newHistory = [...node.history, whiteMove.san];
      const newPgn = newHistory.join(" ");
      
      await getOrCreatePositionCache(fenAfterWhite, undefined, newHistory);
      
      const incomingPathProb = node.cumulativeProb * (whiteMove.probability || 1.0);
      let posAfterWhiteNode = await getRepertoireNode(repertoire.id, newPgn);
      if (!posAfterWhiteNode) {
          posAfterWhiteNode = await createRepertoireNode(repertoire.id, fenAfterWhite, newPgn, incomingPathProb);
      } else {
          await prisma.repertoireNode.update({
              where: { id: posAfterWhiteNode.id },
              data: { cumulativeProb: Math.max(posAfterWhiteNode.cumulativeProb, incomingPathProb) }
          });
      }

      await createRepertoireMove({
          repertoireId: repertoire.id,
          fromNodeId: node.nodeId,
          toNodeId: posAfterWhiteNode.id,
          san: whiteMove.san,
          playerTurn: "OPPONENT",
          prob: whiteMove.probability,
          trueProbability: incomingPathProb
      });

      const existingStat = await prisma.repertoirePositionStat.findUnique({
        where: { repertoireId_nodeId: { repertoireId: repertoire.id, nodeId: posAfterWhiteNode.id } }
      });

      if (existingStat) {
        const dbBlackMove = await prisma.repertoireMove.findUnique({ where: { id: existingStat.targetMoveId } });
        if (dbBlackMove) {
          console.log(`[SKIPPED API] Already generated in DB! Black responds with: ${dbBlackMove.san}`);
          
          tempChess.move(dbBlackMove.san);
          const fenAfterBlack = tempChess.fen();
          
          queue.push({
            nodeId: dbBlackMove.toNodeId,
            fen: fenAfterBlack,
            currentMoveNumber: node.currentMoveNumber + 1,
            trapDepth: whiteMove.isTrap ? node.trapDepth + 1 : 0,
            cumulativeProb: incomingPathProb,
            history: [...newHistory, dbBlackMove.san]
          });
          
          totalSkippedMoves++;
          continue; 
        }
      }

      const algoResult = await evaluateBlackMove(fenAfterWhite, tempChess, node.currentMoveNumber, newHistory);
      
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
              await prisma.repertoireNode.update({
                  where: { id: posAfterWhiteNode.id },
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
      const blackHistory = [...newHistory, algoResult.selectedMoveSan];
      const blackPgn = blackHistory.join(" ");
      
      await getOrCreatePositionCache(fenAfterBlack, undefined, blackHistory);
      
      let posAfterBlackNode = await getRepertoireNode(repertoire.id, blackPgn);
      if (!posAfterBlackNode) {
          posAfterBlackNode = await createRepertoireNode(repertoire.id, fenAfterBlack, blackPgn, incomingPathProb);
      } else {
          await prisma.repertoireNode.update({
              where: { id: posAfterBlackNode.id },
              data: { cumulativeProb: Math.max(posAfterBlackNode.cumulativeProb, incomingPathProb) }
          });
      }

      const dbBlackMove = await createRepertoireMove({
          repertoireId: repertoire.id,
          fromNodeId: posAfterWhiteNode.id,
          toNodeId: posAfterBlackNode.id,
          san: algoResult.selectedMoveSan,
          playerTurn: "RESPONSE",
          lichessCp: typeof algoResult.lichessCp === 'number' ? algoResult.lichessCp / 100 : undefined,
          chessdbCp: typeof algoResult.chessdbCp === 'number' ? algoResult.chessdbCp / 100 : undefined,
          weightedCount: algoResult.selectedStats?.weightedCount || 0,
          engineSource: algoResult.evalSource
      });

      const emptyCard = createEmptyCard();
      await prisma.repertoirePositionStat.upsert({
        where: { repertoireId_nodeId: { repertoireId: repertoire.id, nodeId: posAfterWhiteNode.id } },
        update: { targetMoveId: dbBlackMove.id, explanation: explanation },
        create: { 
          repertoireId: repertoire.id, 
          nodeId: posAfterWhiteNode.id, 
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
        nodeId: posAfterBlackNode.id,
        fen: fenAfterBlack,
        currentMoveNumber: node.currentMoveNumber + 1,
        trapDepth: whiteMove.isTrap ? node.trapDepth + 1 : 0,
        cumulativeProb: incomingPathProb,
        history: blackHistory
      });

      await delay(100); // Shorter delay since we hit cache!
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
  console.log(`Total Skipped (In DB):    ${totalSkippedMoves}`);
  console.log(`Total N/A Evals (Null):   ${totalNaEvals}`);
  console.log("========================================================\n");
  console.log("Generation Complete!");
}
