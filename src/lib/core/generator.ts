import { Chess } from "chess.js";
import { prisma, getOrCreatePositionCache, getRepertoireNode, createRepertoireNode, createRepertoireMove, createResponseMove, getOrCreateHumanDataSnapshot } from "../db/operations";
import { parseFullFen, positionKeyFromFen } from "./fen";
import { fetchAllDatabases } from "../api/lichess";
import { defaultConfig, computeExplorerRequestProfile } from "../core/config";
import { selectWhiteCandidates, evaluateBlackMove } from "./evaluator";
import { reconcileExistingResponse } from "./rm-reconciliation";
import { delay } from "../api/retry";
import { createEmptyCard } from "ts-fsrs";

type ResponseEvaluator = typeof evaluateBlackMove;

export function historyFromCanonicalPgn(pgn: string): string[] {
  if (typeof pgn !== "string" || pgn.trim() !== pgn) {
    throw new Error("Canonical repertoire PGN must be a trimmed string");
  }
  return pgn === "" ? [] : pgn.split(/\s+/);
}

function fullmoveNumberFromFullFen(fullFen: string): number {
  const canonicalFullFen = parseFullFen(fullFen);
  if (canonicalFullFen !== fullFen) throw new Error("Canonical repertoire FullFen is malformed");
  const fullmoveNumber = Number(canonicalFullFen.split(" ")[5]);
  if (!Number.isInteger(fullmoveNumber) || fullmoveNumber < 1) {
    throw new Error("Canonical repertoire FullFen has an invalid fullmove number");
  }
  return fullmoveNumber;
}

export async function evaluateCanonicalResponse(input: {
  responseNode: { id: string; fullFen: string; pgn: string };
  routePgn: string;
  snapshotId: string;
  evaluator?: ResponseEvaluator;
}) {
  const canonicalHistory = historyFromCanonicalPgn(input.responseNode.pgn);
  const canonicalChess = new Chess(input.responseNode.fullFen);
  const evaluator = input.evaluator ?? evaluateBlackMove;
  const result = await evaluator(
    input.responseNode.fullFen,
    canonicalChess,
    fullmoveNumberFromFullFen(input.responseNode.fullFen),
    canonicalHistory,
    input.snapshotId
  );
  const selectedMove = canonicalChess.move({
    from: result.selectedUci.slice(0, 2),
    to: result.selectedUci.slice(2, 4),
    promotion: result.selectedUci[4]
  });
  if (!selectedMove || selectedMove.lan !== result.selectedUci || selectedMove.san !== result.selectedMoveSan) {
    throw new Error(`Evaluator returned inconsistent RESPONSE UCI/SAN at ${input.responseNode.fullFen}`);
  }
  return {
    result,
    routeIsCanonicalOwner: input.routePgn === input.responseNode.pgn,
    canonicalHistory,
    selectedSan: selectedMove.san,
    selectedDestinationFullFen: parseFullFen(canonicalChess.fen())
  };
}

export function buildCanonicalContinuationQueueItem(input: {
  destinationNode: { id: string; fullFen: string; pgn: string };
  cumulativeProb: number;
}) {
  return {
    nodeId: input.destinationNode.id,
    fen: input.destinationNode.fullFen,
    currentMoveNumber: fullmoveNumberFromFullFen(input.destinationNode.fullFen),
    cumulativeProb: input.cumulativeProb,
    history: historyFromCanonicalPgn(input.destinationNode.pgn)
  };
}

export type GeneratorQueueItem = ReturnType<typeof buildCanonicalContinuationQueueItem> & {
  responseSourceNodeId?: string;
};

export type PendingCanonicalContinuations = Map<string, GeneratorQueueItem>;

export function enqueueCanonicalContinuation(input: {
  queue: GeneratorQueueItem[];
  pendingByResponseSource: PendingCanonicalContinuations;
  responseSourceNodeId: string;
  item: GeneratorQueueItem;
}) {
  if (input.pendingByResponseSource.has(input.responseSourceNodeId)) {
    throw new Error("Canonical continuation is already queued for this RESPONSE source");
  }
  input.item.responseSourceNodeId = input.responseSourceNodeId;
  input.queue.push(input.item);
  input.pendingByResponseSource.set(input.responseSourceNodeId, input.item);
}

export function raisePendingCanonicalContinuationProbability(input: {
  pendingByResponseSource: PendingCanonicalContinuations;
  responseSourceNodeId: string;
  effectiveCumulativeProb: number;
}) {
  const pending = input.pendingByResponseSource.get(input.responseSourceNodeId);
  if (!pending) return false;
  pending.cumulativeProb = Math.max(pending.cumulativeProb, input.effectiveCumulativeProb);
  return true;
}

export function dequeueGeneratorQueueItem(
  queue: GeneratorQueueItem[],
  pendingByResponseSource: PendingCanonicalContinuations
) {
  const item = queue.shift();
  if (item?.responseSourceNodeId && pendingByResponseSource.get(item.responseSourceNodeId) === item) {
    pendingByResponseSource.delete(item.responseSourceNodeId);
  }
  return item;
}

export async function persistCanonicalMaxCumulativeProbability(input: {
  node: { id: string; cumulativeProb: number };
  incomingPathProb: number;
}) {
  if (!Number.isFinite(input.node.cumulativeProb) || input.node.cumulativeProb < 0 ||
      !Number.isFinite(input.incomingPathProb) || input.incomingPathProb < 0) {
    throw new Error("Canonical cumulative probability must be finite and non-negative");
  }
  if (input.incomingPathProb > input.node.cumulativeProb) {
    await prisma.repertoireNode.updateMany({
      where: { id: input.node.id, cumulativeProb: { lt: input.incomingPathProb } },
      data: { cumulativeProb: input.incomingPathProb }
    });
  }
  const currentNode = await prisma.repertoireNode.findUnique({ where: { id: input.node.id } });
  if (!currentNode) throw new Error("Canonical repertoire node disappeared during probability reconciliation");
  return currentNode;
}

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

  const queue: GeneratorQueueItem[] = [{
    nodeId: rootNode.id,
    fen: startFen, 
    currentMoveNumber: 1, 
    cumulativeProb: 1.0, 
    history: [] as string[] 
  }];
  
  const visitedPgns = new Set<string>();
  const reconciledResponseNodeIds = new Set<string>();
  const pendingCanonicalContinuations: PendingCanonicalContinuations = new Map();
  
  while (queue.length > 0) {
    const node = dequeueGeneratorQueueItem(queue, pendingCanonicalContinuations);
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

      if (!posAfterWhiteNode) {
          posAfterWhiteNode = await createRepertoireNode(repertoire.id, fenAfterWhite, newPgn, incomingPathProb);
      } else {
          posAfterWhiteNode = await persistCanonicalMaxCumulativeProbability({
              node: posAfterWhiteNode,
              incomingPathProb
          });
      }
      const effectiveCanonicalProb = posAfterWhiteNode.cumulativeProb;

      await createRepertoireMove({
          repertoireId: repertoire.id,
          fromNodeId: node.nodeId,
          toNodeId: posAfterWhiteNode.id,
          san: whiteMove.san,
          playerTurn: "OPPONENT",
          prob: whiteMove.probability,
          trueProbability: incomingPathProb
      });

      // A canonical transposition RESPONSE is reconciled once per generator pass.
      // A pre-existing stat alone is never treated as proof that it was reconciled.
      if (reconciledResponseNodeIds.has(posAfterWhiteNode.id)) {
          raisePendingCanonicalContinuationProbability({
              pendingByResponseSource: pendingCanonicalContinuations,
              responseSourceNodeId: posAfterWhiteNode.id,
              effectiveCumulativeProb: effectiveCanonicalProb
          });
          totalSkippedMoves++;
          continue;
      }

      const existingStat = await prisma.repertoirePositionStat.findUnique({
        where: { repertoireId_nodeId: { repertoireId: repertoire.id, nodeId: posAfterWhiteNode.id } }
      });

      const dbBlackMove = existingStat
        ? await prisma.repertoireMove.findUnique({ where: { id: existingStat.targetMoveId } })
        : await prisma.repertoireMove.findFirst({ where: { fromNodeId: posAfterWhiteNode.id, playerTurn: "RESPONSE" } });
      if (existingStat && !dbBlackMove) throw new Error(`Stored RESPONSE ${existingStat.targetMoveId} no longer exists`);
      if (!existingStat && dbBlackMove) throw new Error(`Stored RESPONSE ${dbBlackMove.id} has no position stat and cannot be reconciled`);
      if (dbBlackMove && (!dbBlackMove.uci || !dbBlackMove.source || !dbBlackMove.selectionMethod || !dbBlackMove.moveOrigin ||
          dbBlackMove.playerTurn !== "RESPONSE" || dbBlackMove.fromNodeId !== posAfterWhiteNode.id ||
          !((typeof dbBlackMove.cp === "number" && Number.isFinite(dbBlackMove.cp) && dbBlackMove.mate === null) ||
            (dbBlackMove.cp === null && typeof dbBlackMove.mate === "number" && Number.isInteger(dbBlackMove.mate) && dbBlackMove.mate !== 0)) ||
          (dbBlackMove.deepVerified && !dbBlackMove.localEvaluationProfile))) {
        throw new Error(`Stored RESPONSE ${dbBlackMove.id} is legacy/incomplete and cannot be reconciled`);
      }

      const canonicalSelection = await evaluateCanonicalResponse({
          responseNode: posAfterWhiteNode,
          routePgn: newPgn,
          snapshotId
      });
      const algoResult = canonicalSelection.result;
      const selectedWeightedCount = algoResult.moveOrigin === "Human Move"
        ? algoResult.selectedStats?.weightedGames ?? null
        : null;


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

      const selectedDestinationFen = canonicalSelection.selectedDestinationFullFen;
      const selectedHistory = [...canonicalSelection.canonicalHistory, canonicalSelection.selectedSan];
      const blackPgn = selectedHistory.join(" ");

      await getOrCreatePositionCache(selectedDestinationFen, undefined, selectedHistory);

      let resultingDestinationId: string;
      let resultingDestinationFen: string = selectedDestinationFen;
      let resultingDestinationPgn = blackPgn;

      if (dbBlackMove) {
          const result = await reconcileExistingResponse({
              repertoireId: repertoire.id,
              sourceNodeId: posAfterWhiteNode.id,
              expectedStoredResponse: {
                  id: dbBlackMove.id,
                  uci: dbBlackMove.uci as string,
                  fromNodeId: dbBlackMove.fromNodeId,
                  toNodeId: dbBlackMove.toNodeId,
                  fullFen: posAfterWhiteNode.fullFen
              },
              cumulativeProb: effectiveCanonicalProb,
              recomputed: {
                  selectedUci: algoResult.selectedUci,
                  selectedMoveSan: algoResult.selectedMoveSan,
                  cp: algoResult.cp,
                  mate: algoResult.mate,
                  source: algoResult.source,
                  selectionMethod: algoResult.selectionMethod,
                  moveOrigin: algoResult.moveOrigin,
                  deepVerified: algoResult.deepVerified,
                  localEvaluationProfile: algoResult.localEvaluationProfile,
                  weightedCount: selectedWeightedCount
              }
          });

          resultingDestinationId = result.destinationNodeId;
          resultingDestinationFen = result.destinationFullFen;
          resultingDestinationPgn = result.destinationPgn;

          // Reconcile explanation but DO NOT wipe SRS progress
          const explanationUpdate = await prisma.repertoirePositionStat.updateMany({
             where: { repertoireId: repertoire.id, nodeId: posAfterWhiteNode.id, targetMoveId: result.responseId },
             data: { explanation: explanation }
          });
          if (explanationUpdate.count !== 1) throw new Error("Reconciled RESPONSE stat changed before explanation update");
      } else {
          let posAfterBlackNode = await getRepertoireNode(repertoire.id, blackPgn);
          if (!posAfterBlackNode) {
              posAfterBlackNode = await createRepertoireNode(repertoire.id, selectedDestinationFen, blackPgn, effectiveCanonicalProb);
          } else {
              await prisma.repertoireNode.update({
                  where: { id: posAfterBlackNode.id },
                  data: { cumulativeProb: Math.max(posAfterBlackNode.cumulativeProb, effectiveCanonicalProb) }
              });
          }

          resultingDestinationId = posAfterBlackNode.id;
          resultingDestinationFen = posAfterBlackNode.fullFen;
          resultingDestinationPgn = posAfterBlackNode.pgn;

          const createdResponse = await createResponseMove({
              fromNodeId: posAfterWhiteNode.id,
              toNodeId: posAfterBlackNode.id,
              uci: algoResult.selectedUci,
              san: algoResult.selectedMoveSan,
              cp: algoResult.cp,
              mate: algoResult.mate,
              weightedCount: selectedWeightedCount,
              source: algoResult.source,
              selectionMethod: algoResult.selectionMethod,
              moveOrigin: algoResult.moveOrigin,
              deepVerified: algoResult.deepVerified,
              localEvaluationProfile: algoResult.localEvaluationProfile
          });

          const emptyCard = createEmptyCard();
          await prisma.repertoirePositionStat.upsert({
            where: { repertoireId_nodeId: { repertoireId: repertoire.id, nodeId: posAfterWhiteNode.id } },
            update: { targetMoveId: createdResponse.id, explanation: explanation },
            create: {
              repertoireId: repertoire.id,
              nodeId: posAfterWhiteNode.id,
              targetMoveId: createdResponse.id,
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
      }

      reconciledResponseNodeIds.add(posAfterWhiteNode.id);
      const continuationItem = buildCanonicalContinuationQueueItem({
          destinationNode: {
              id: resultingDestinationId,
              fullFen: resultingDestinationFen,
              pgn: resultingDestinationPgn
          },
          cumulativeProb: effectiveCanonicalProb
      });
      enqueueCanonicalContinuation({
          queue,
          pendingByResponseSource: pendingCanonicalContinuations,
          responseSourceNodeId: posAfterWhiteNode.id,
          item: continuationItem
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
