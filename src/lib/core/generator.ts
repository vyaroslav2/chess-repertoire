import { Chess } from "chess.js";
import { prisma, getOrCreatePositionCache, getRepertoireNode, createRepertoireNode, createRepertoireMove, createResponseMove, getOrCreateHumanDataSnapshot } from "../db/operations";
import { parseFullFen, positionKeyFromFen } from "./fen";
import { fetchAllDatabases } from "../api/lichess";
import { defaultConfig, computeExplorerRequestProfile } from "../core/config";
import { selectWhiteCandidates, evaluateBlackMove } from "./evaluator";
import { delay } from "../api/retry";
import { createEmptyCard } from "ts-fsrs";

export async function generateRepertoire(startFen: string, maxDepth: number) {
  console.log("Initializing BFS Tree Generator...");
  
  const startTime = Date.now();
  let totalPositionsProcessed = 0;
  let totalWhiteMovesFound = 0;
  let totalMissingWhiteMoves = 0;
  let totalBlackMovesEvaluated = 0;
  let totalSkippedMoves = 0;
  let totalBranchesAborted = 0;
  let totalMissingBlackMoves = 0;
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

  const reqProfile = computeExplorerRequestProfile(defaultConfig);
  const snapshot = await getOrCreateHumanDataSnapshot(repertoire.id, reqProfile);
  const snapshotId = snapshot.id;

  const queue = [{ 
    nodeId: rootNode.id,
    fen: startFen, 
    currentMoveNumber: 1, 
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
    
    console.log(`\n--- Queue Size: ${queue.length} | Move: ${node.currentMoveNumber} ---`);
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
      console.log(`[ABORTED] Hit dynamic depth limit (${dynamicMaxDepth} moves) for prob ${(node.cumulativeProb*100).toFixed(2)}%. Stopping branch (0 White moves processed for this node).`);
      totalBranchesAborted++;
      continue;
    }
    const [masters, elite, amateur] = await fetchAllDatabases(node.fen, snapshotId);
    await getOrCreatePositionCache(node.fen, masters.opening, node.history);
    
    const whiteCandidates = selectWhiteCandidates(
      node.currentMoveNumber,
      masters.moves || [],
      elite.moves || [],
      amateur.moves || [],
      amateur.totalGames || 0
    );

    if (whiteCandidates.length === 0) {
        const tempChess = new Chess(node.fen);
        if (!tempChess.isGameOver()) {
            console.log(`[ALERT - ERROR] No White candidates found after ${pgnString}. Stopping branch.`);
            totalMissingWhiteMoves++;
        }
    } else {
        console.log(`Found ${whiteCandidates.length} White moves to process.`);
    }
    totalWhiteMovesFound += whiteCandidates.length;

    for (const whiteMove of whiteCandidates) {
      console.log(`\nEvaluating White Move: ${whiteMove.san} (Reason: ${whiteMove.reason}, Prob: ${whiteMove.probability ? (whiteMove.probability*100).toFixed(1) : 0}%)`);
      const tempChess = new Chess(node.fen);
      tempChess.move(whiteMove.san);
      const fenAfterWhite = tempChess.fen();
      
      const newHistory = [...node.history, whiteMove.san];
      const newPgn = newHistory.join(" ");
      
      await getOrCreatePositionCache(fenAfterWhite, undefined, newHistory);
      
      const incomingPathProb = node.cumulativeProb * (whiteMove.probability || 1.0);
      let posAfterWhiteNode = await prisma.repertoireNode.findFirst({
          where: { repertoireId: repertoire.id, positionKey: positionKeyFromFen(parseFullFen(fenAfterWhite)) }
      });
      
      if (posAfterWhiteNode) {
          const statsCount = await prisma.repertoirePositionStat.count({
              where: { repertoireId: repertoire.id, nodeId: posAfterWhiteNode.id }
          });
          if (statsCount > 0) {
              console.log(`[TRANSPOSITION] FEN already fully expanded: ${fenAfterWhite}. Merging tree...`);
              
              await createRepertoireMove({
                  repertoireId: repertoire.id,
                  fromNodeId: node.nodeId,
                  toNodeId: posAfterWhiteNode.id,
              san: whiteMove.san,
              playerTurn: "OPPONENT",
              prob: whiteMove.probability,
              trueProbability: incomingPathProb
          });
          
          await prisma.repertoireNode.update({
              where: { id: posAfterWhiteNode.id },
              data: { cumulativeProb: Math.max(posAfterWhiteNode.cumulativeProb, incomingPathProb) }
          });
          
          totalSkippedMoves++;
          continue; 
      }
      }
      
      if (!posAfterWhiteNode) {
          posAfterWhiteNode = await createRepertoireNode(repertoire.id, fenAfterWhite, newPgn, incomingPathProb);
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
          if (!dbBlackMove.uci || !dbBlackMove.source || !dbBlackMove.selectionMethod || !dbBlackMove.moveOrigin ||
              !((typeof dbBlackMove.cp === "number" && dbBlackMove.mate === null) || (dbBlackMove.cp === null && typeof dbBlackMove.mate === "number" && dbBlackMove.mate !== 0)) ||
              (dbBlackMove.deepVerified && !dbBlackMove.localEvaluationProfile)) {
            throw new Error(`Stored RESPONSE ${dbBlackMove.id} is legacy/incomplete and cannot be reused`);
          }
          console.log(`[SKIPPED API] Already generated in DB! Black responds with: ${dbBlackMove.san}`);
          
          tempChess.move(dbBlackMove.san);
          const fenAfterBlack = tempChess.fen();
          
          queue.push({
            nodeId: dbBlackMove.toNodeId,
            fen: fenAfterBlack,
            currentMoveNumber: node.currentMoveNumber + 1,
            cumulativeProb: incomingPathProb,
            history: [...newHistory, dbBlackMove.san]
          });
          
          totalSkippedMoves++;
          continue; 
        }
      }

      const algoResult = await evaluateBlackMove(fenAfterWhite, tempChess, node.currentMoveNumber, newHistory, snapshotId);


      totalBlackMovesEvaluated++;
      if (algoResult.cp === null) {
          totalNaEvals++;
      }

      let scoreStr = "N/A";
      let volStr = "0";
      if (algoResult.selectedStats) {
          scoreStr = (algoResult.selectedStats.blackScore * 100).toFixed(1) + "%";
          volStr = algoResult.selectedStats.weightedGames.toString();
      }

      console.log(`Black responds with: ${algoResult.selectedMoveSan} -> Score: ${scoreStr} | Weighted Vol: ${volStr} | ${algoResult.source} Eval: ${algoResult.cp !== null ? (algoResult.cp / 100).toFixed(2) : 'M' + Math.abs(algoResult.mate!)}`);
      const explanation = `Score: ${scoreStr} | Weighted Vol: ${volStr} | Eval: ${algoResult.cp !== null ? (algoResult.cp/100).toFixed(2) : 'M' + Math.abs(algoResult.mate!)}`;

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

      const dbBlackMove = await createResponseMove({
          fromNodeId: posAfterWhiteNode.id,
          toNodeId: posAfterBlackNode.id,
          uci: algoResult.selectedUci,
          san: algoResult.selectedMoveSan,
          cp: algoResult.cp,
          mate: algoResult.mate,
          weightedCount: algoResult.selectedStats?.weightedGames ?? null,
          source: algoResult.source,
          selectionMethod: algoResult.selectionMethod,
          moveOrigin: algoResult.moveOrigin,
          deepVerified: algoResult.deepVerified,
          localEvaluationProfile: algoResult.localEvaluationProfile
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
        cumulativeProb: incomingPathProb,
        history: blackHistory
      });

      await delay(100); // Shorter delay since we hit cache!
    }

    // --- TEMPORARY DETAILED SUMMARY PER NODE ---
    const runningElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n--- [TEMPORARY CHECKPOINT] Node Finished ---`);
    console.log(`Time: ${runningElapsed}s | Nodes Processed: ${totalPositionsProcessed} (Aborted: ${totalBranchesAborted})`);
    console.log(`White Moves Found: ${totalWhiteMovesFound} (Skipped: ${totalSkippedMoves})`);
    console.log(`Missing White Moves: ${totalMissingWhiteMoves} | Missing Black Moves: ${totalMissingBlackMoves}`);
    console.log(`--------------------------------------------\n`);
  }
  
  const endTime = Date.now();
  const timeElapsed = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log("\n========================================================");
  console.log("=== TREE GENERATION SUMMARY ===");
  console.log(`Time Elapsed:             ${timeElapsed} seconds`);
  console.log(`Total Nodes Processed:    ${totalPositionsProcessed}`);
  console.log(`  - Branches Aborted:     ${totalBranchesAborted}`);
  console.log(`White Moves Found:        ${totalWhiteMovesFound}`);
  console.log(`Total Black Responses:    ${totalBlackMovesEvaluated}`);
  console.log(`Total Skipped (In DB):    ${totalSkippedMoves}`);
  console.log(`Missing White Moves:      ${totalMissingWhiteMoves}`);
  console.log(`Missing Black Moves:      ${totalMissingBlackMoves}`);
  console.log(`Total N/A Evals (Null):   ${totalNaEvals}`);
  console.log("========================================================\n");
  console.log("Generation Complete!");
}
