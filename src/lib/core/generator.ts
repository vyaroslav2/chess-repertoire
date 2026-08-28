import { Chess } from "chess.js";
import { prisma, getOrCreatePositionCache, getRepertoireNode, createRepertoireNode, createResponseMove, getOrCreateHumanDataSnapshot, ensureRepertoireNodeWikibooks, propagateRepertoireProbabilities } from "../db/operations";
import { parseFullFen, positionKeyFromFen } from "./fen";
import { fetchAllDatabases } from "../api/lichess";
import { defaultConfig, computeExplorerRequestProfile, createRuntimeConfig } from "../core/config";
import { selectWhiteCandidates, evaluateBlackMove } from "./evaluator";
import { reconcileExistingResponse } from "./rm-reconciliation";
import { delay } from "../api/retry";
import { UserRequestedStopError } from "../api/retry";
import { createEmptyCard } from "ts-fsrs";
import {
  canonicalizeOpponentCandidates,
  readExpectedOpponentEdges,
  reconcileOpponentBranches,
  type ExpectedOpponentSource
} from "./rm-opponent-reconciliation";

type ResponseEvaluator = typeof evaluateBlackMove;

export type GenerateRepertoireDependencies = {
  repertoireId?: string;
  fetchDatabases?: typeof fetchAllDatabases;
  responseEvaluator?: ResponseEvaluator;
  ensurePositionCache?: typeof getOrCreatePositionCache;
  ensureNodeWikibooks?: typeof ensureRepertoireNodeWikibooks;
  wait?: typeof delay;
  shouldStop?: () => boolean;
};

export async function attemptCanonicalNodeWikibooks(
  nodeId: string,
  attemptedNodeIds: Set<string>,
  ensureNodeWikibooks: typeof ensureRepertoireNodeWikibooks = ensureRepertoireNodeWikibooks
) {
  if (attemptedNodeIds.has(nodeId)) return { status: "SKIPPED_THIS_RUN" as const };
  attemptedNodeIds.add(nodeId);
  return ensureNodeWikibooks(nodeId);
}

export type RebuildWikibooksCache = Map<string, string | null>;

export async function captureRebuildWikibooksCache(repertoireId: string): Promise<RebuildWikibooksCache> {
  const checkedNodes = await prisma.repertoireNode.findMany({
    where: { repertoireId, wikibooksChecked: true },
    select: { history: true, wikiText: true }
  });
  return new Map(checkedNodes.map(node => [node.history, node.wikiText]));
}

export async function restoreRebuildWikibooksState(
  nodeId: string,
  cache: RebuildWikibooksCache
): Promise<void> {
  const node = await prisma.repertoireNode.findUniqueOrThrow({
    where: { id: nodeId },
    select: { history: true, wikibooksChecked: true }
  });
  if (node.wikibooksChecked || !cache.has(node.history)) return;

  await prisma.repertoireNode.update({
    where: { id: nodeId },
    data: { wikibooksChecked: true, wikiText: cache.get(node.history) ?? null }
  });
}

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
  destinationNode: { id: string; fullFen: string; pgn: string; history?: string };
  cumulativeProb: number;
}) {
  return {
    nodeId: input.destinationNode.id,
    fen: input.destinationNode.fullFen,
    currentMoveNumber: fullmoveNumberFromFullFen(input.destinationNode.fullFen),
    cumulativeProb: input.cumulativeProb,
    history: historyFromCanonicalPgn(input.destinationNode.pgn),
    uciHistory: historyFromCanonicalPgn(input.destinationNode.history ?? "")
  };
}

export type GeneratorQueueItem = Omit<ReturnType<typeof buildCanonicalContinuationQueueItem>, "uciHistory"> & {
  uciHistory?: string[];
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

export function removeDeletedCanonicalQueueWork(input: {
  queue: GeneratorQueueItem[];
  pendingByResponseSource: PendingCanonicalContinuations;
  deletedNodeIds: Iterable<string>;
}) {
  const deleted = new Set(input.deletedNodeIds);
  let removedCount = 0;
  for (let index = input.queue.length - 1; index >= 0; index--) {
    const item = input.queue[index];
    if (!deleted.has(item.nodeId) && (!item.responseSourceNodeId || !deleted.has(item.responseSourceNodeId))) continue;
    input.queue.splice(index, 1);
    removedCount++;
    if (item.responseSourceNodeId && input.pendingByResponseSource.get(item.responseSourceNodeId) === item) {
      input.pendingByResponseSource.delete(item.responseSourceNodeId);
    }
  }
  return removedCount;
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

export async function generateRepertoire(
  startFen: string,
  maxDepth: number,
  dependencies: GenerateRepertoireDependencies = {}
) {
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
  let totalDuplicateHistories = 0;
  let maximumQueueSize = 1;

  const fetchDatabases = dependencies.fetchDatabases ?? fetchAllDatabases;
  const ensurePositionCache = dependencies.ensurePositionCache ?? getOrCreatePositionCache;
  const ensureNodeWikibooks = dependencies.ensureNodeWikibooks ?? ensureRepertoireNodeWikibooks;
  const wait = dependencies.wait ?? delay;
  let repertoire;
  if (dependencies.repertoireId) {
    repertoire = await prisma.repertoire.findUnique({ where: { id: dependencies.repertoireId } });
    if (!repertoire) throw new Error(`Requested repertoire ${dependencies.repertoireId} does not exist`);
  } else {
    let user = await prisma.user.findUnique({ where: { username: "Yaroslav" } });
    if (!user) { user = await prisma.user.create({ data: { username: "Yaroslav" } }); }
    repertoire = await prisma.repertoire.findFirst({ where: { title: "Black Universal Repertoire", userId: user.id } });
    if (!repertoire) {
      repertoire = await prisma.repertoire.create({
        data: { title: "Black Universal Repertoire", color: "black", userId: user.id }
      });
    }
  }

  const runtime = createRuntimeConfig(defaultConfig);
  const reqProfile = computeExplorerRequestProfile(runtime.config);
  const snapshot = await getOrCreateHumanDataSnapshot(repertoire.id, reqProfile);
  const snapshotId = snapshot.id;
  const rebuildWikibooksCache = await captureRebuildWikibooksCache(repertoire.id);

  try {
  await prisma.$transaction(async tx => {
    await tx.repertoire.update({ where: { id: repertoire.id }, data: { generationStatus: "GENERATING" } });
    await tx.repertoireNode.deleteMany({ where: { repertoireId: repertoire.id } });
  });

  await ensurePositionCache(startFen);
  const rootNode = await createRepertoireNode(repertoire.id, startFen, "", 1.0, {
    displayPgn: "",
    humanDataSnapshotId: snapshotId
  });
  await restoreRebuildWikibooksState(rootNode.id, rebuildWikibooksCache);

  const queue: GeneratorQueueItem[] = [{
    nodeId: rootNode.id,
    fen: startFen, 
    currentMoveNumber: 1, 
    cumulativeProb: 1.0, 
    history: [] as string[] 
    ,uciHistory: [] as string[]
  }];
  
  const visitedPgns = new Set<string>();
  const reconciledResponseNodeIds = new Set<string>();
  const wikibooksAttemptedNodeIds = new Set<string>();
  const pendingCanonicalContinuations: PendingCanonicalContinuations = new Map();

  await attemptCanonicalNodeWikibooks(rootNode.id, wikibooksAttemptedNodeIds, ensureNodeWikibooks);
  
  while (queue.length > 0) {
    if (dependencies.shouldStop?.()) {
      throw new UserRequestedStopError("Generation was stopped at the user's request between positions");
    }
    const node = dequeueGeneratorQueueItem(queue, pendingCanonicalContinuations);
    if (!node) continue;
    
    const pgnString = node.history.join(" ");
    if (visitedPgns.has(pgnString)) {
      totalDuplicateHistories++;
      console.warn(`[WARNING] Duplicate queued history skipped: ${pgnString || "(root)"}`);
      continue;
    }
    visitedPgns.add(pgnString);
    
    totalPositionsProcessed++;

    const currentElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    maximumQueueSize = Math.max(maximumQueueSize, queue.length + 1);
    console.log(`\n--- Queue Size: ${queue.length} | Maximum: ${maximumQueueSize} | Move: ${node.currentMoveNumber} ---`);
    console.log(`History: ${pgnString}`);
    console.log(`[Run totals] Elapsed: ${currentElapsed}s | Positions Looked At: ${totalPositionsProcessed}`);

    let dynamicMaxDepth = runtime.config.generation.rareDepthBudget;
    if (node.cumulativeProb > runtime.config.generation.commonProbability) {
        dynamicMaxDepth = runtime.config.generation.commonDepthBudget;
    } else if (node.cumulativeProb > runtime.config.generation.uncommonProbability) {
        dynamicMaxDepth = runtime.config.generation.uncommonDepthBudget;
    }
    dynamicMaxDepth = Math.min(dynamicMaxDepth, maxDepth);

    if (node.currentMoveNumber > dynamicMaxDepth) {
      console.log(`[ABORTED] Hit dynamic depth limit (${dynamicMaxDepth} moves) for prob ${(node.cumulativeProb*100).toFixed(2)}%. Stopping branch (0 White moves processed for this node).`);
      totalBranchesAborted++;
      continue;
    }
    const canonicalSourceNode = await prisma.repertoireNode.findUnique({ where: { id: node.nodeId } });
    if (!canonicalSourceNode || canonicalSourceNode.repertoireId !== repertoire.id) {
      throw new Error("Queued canonical source node disappeared or changed repertoire");
    }
    if (canonicalSourceNode.fullFen !== node.fen || canonicalSourceNode.pgn !== pgnString) {
      throw new Error("Queued canonical source state no longer matches its node/history");
    }
    await attemptCanonicalNodeWikibooks(canonicalSourceNode.id, wikibooksAttemptedNodeIds, ensureNodeWikibooks);

    const [masters, elite, amateur] = await fetchDatabases(canonicalSourceNode.fullFen, snapshotId);
    await ensurePositionCache(canonicalSourceNode.fullFen);
    if (masters.opening?.name) {
      await prisma.repertoireNode.update({
        where: { id: canonicalSourceNode.id },
        data: { eco: masters.opening.eco || null, openingName: masters.opening.name }
      });
    }
    
    const whiteCandidates = selectWhiteCandidates(
      node.currentMoveNumber,
      masters.moves || [],
      elite.moves || [],
      amateur.moves || [],
      amateur.totalGames || 0
    );
    const rawWhiteMoveCount = new Set(
      [...(masters.moves || []), ...(elite.moves || []), ...(amateur.moves || [])]
        .map(move => move.uci || move.san)
    ).size;

    const canonicalOpponentCandidates = canonicalizeOpponentCandidates({
      sourceFullFen: canonicalSourceNode.fullFen,
      sourcePgn: canonicalSourceNode.pgn,
      sourceHistory: canonicalSourceNode.history,
      sourceCumulativeProb: canonicalSourceNode.cumulativeProb,
      candidates: whiteCandidates.map(candidate => ({
        san: candidate.san,
        probability: candidate.probability
      }))
    });
    const expectedOpponentSource: ExpectedOpponentSource = {
      id: canonicalSourceNode.id,
      repertoireId: canonicalSourceNode.repertoireId,
      fullFen: canonicalSourceNode.fullFen,
      positionKey: canonicalSourceNode.positionKey,
      pgn: canonicalSourceNode.pgn,
      cumulativeProb: canonicalSourceNode.cumulativeProb
    };
    const expectedStoredOpponentEdges = await readExpectedOpponentEdges(canonicalSourceNode.id);
    const opponentReconciliation = await reconcileOpponentBranches({
      repertoireId: repertoire.id,
      expectedSource: expectedOpponentSource,
      expectedStoredEdges: expectedStoredOpponentEdges,
      recomputedCandidates: canonicalOpponentCandidates
    });
    removeDeletedCanonicalQueueWork({
      queue,
      pendingByResponseSource: pendingCanonicalContinuations,
      deletedNodeIds: opponentReconciliation.removedNodeIds
    });
    for (const invalidatedId of opponentReconciliation.invalidatedExternalSourceNodeIds) {
      if (invalidatedId === node.nodeId) continue;
      const invalidNode = await prisma.repertoireNode.findUnique({ where: { id: invalidatedId } });
      if (invalidNode) {
        visitedPgns.delete(invalidNode.pgn);
        queue.push({
          nodeId: invalidNode.id,
          fen: invalidNode.fullFen,
          currentMoveNumber: fullmoveNumberFromFullFen(invalidNode.fullFen),
          cumulativeProb: invalidNode.cumulativeProb,
          history: historyFromCanonicalPgn(invalidNode.pgn)
          ,uciHistory: historyFromCanonicalPgn(invalidNode.history)
        });
      }
    }
    const reconciledOpponentByUci = new Map(
      opponentReconciliation.branches.map(branch => [branch.uci, branch] as const)
    );
    for (const branch of opponentReconciliation.branches) {
      await propagateRepertoireProbabilities(repertoire.id, branch.destinationNodeId);
    }

    if (whiteCandidates.length === 0) {
        const tempChess = new Chess(node.fen);
        if (!tempChess.isGameOver() && rawWhiteMoveCount === 0) {
            console.log(`[ALERT - ERROR] No White candidates found after ${pgnString}. Stopping branch.`);
            totalMissingWhiteMoves++;
        } else if (!tempChess.isGameOver()) {
            console.log(`[PRUNED] ${rawWhiteMoveCount} available White move(s) were below the Amateur popularity threshold.`);
        }
    } else {
        console.log(`Found ${whiteCandidates.length} White moves to process.`);
    }
    totalWhiteMovesFound += whiteCandidates.length;

    for (let candidateIndex = 0; candidateIndex < whiteCandidates.length; candidateIndex++) {
      const whiteMove = whiteCandidates[candidateIndex];
      const canonicalWhiteMove = canonicalOpponentCandidates[candidateIndex];
      const reconciledOpponent = reconciledOpponentByUci.get(canonicalWhiteMove.uci);
      if (!reconciledOpponent) throw new Error(`Reconciled OPPONENT branch ${canonicalWhiteMove.uci} is missing`);
      console.log(`\nEvaluating White Move: ${whiteMove.san} (Reason: ${whiteMove.reason}, Prob: ${whiteMove.probability ? (whiteMove.probability*100).toFixed(1) : 0}%)`);
      const newPgn = canonicalWhiteMove.destinationPgn;
      const posAfterWhiteNode = await prisma.repertoireNode.findUnique({
        where: { id: reconciledOpponent.destinationNodeId }
      });
      if (!posAfterWhiteNode || posAfterWhiteNode.repertoireId !== repertoire.id) {
        throw new Error("Reconciled OPPONENT destination disappeared or changed repertoire");
      }
      const reconciledEdge = await prisma.repertoireMove.findUnique({ where: { id: reconciledOpponent.edgeId } });
      if (reconciledEdge?.stopReason === "Repetition") {
        console.log(`[STOPPED] ${canonicalWhiteMove.san} repeats an earlier position on this route.`);
        totalSkippedMoves++;
        continue;
      }
      await ensurePositionCache(posAfterWhiteNode.fullFen);
      await restoreRebuildWikibooksState(posAfterWhiteNode.id, rebuildWikibooksCache);
      await attemptCanonicalNodeWikibooks(posAfterWhiteNode.id, wikibooksAttemptedNodeIds, ensureNodeWikibooks);
      const effectiveCanonicalProb = reconciledOpponent.effectiveCumulativeProb;

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

      const existingStat = await prisma.repertoirePositionStat.findFirst({
        where: { repertoireId: repertoire.id, nodeId: posAfterWhiteNode.id }
      });

      if (existingStat && !existingStat.targetMoveId) throw new Error("Stored RESPONSE stat is temporarily detached from its move");
      const dbBlackMove = existingStat
        ? await prisma.repertoireMove.findUnique({ where: { id: existingStat.targetMoveId! } })
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
          snapshotId,
          evaluator: dependencies.responseEvaluator
      });
      const algoResult = canonicalSelection.result;
      const selectedWeightedCount = algoResult.moveOrigin === "Human Move"
        ? algoResult.selectedStats?.weightedGames ?? null
        : null;
      const totalCandidateWeight = (algoResult.candidateMoves ?? []).reduce((sum: number, candidate: { weightedGames?: number }) => sum + (candidate.weightedGames ?? 0), 0);
      const selectedEngineIndex = (algoResult.enginePvs ?? []).findIndex((pv: { uci?: string; moves?: string }) => (pv.uci ?? pv.moves?.split(" ")[0]) === algoResult.selectedUci);
      const responseProvenance = {
        mastersGames: algoResult.selectedStats?.mastersGames ?? null,
        eliteGames: algoResult.selectedStats?.eliteGames ?? null,
        totalRelevantGames: algoResult.selectedStats
          ? (algoResult.selectedStats.mastersGames ?? 0) + (algoResult.selectedStats.eliteGames ?? 0)
          : null,
        moveShare: algoResult.selectedStats && totalCandidateWeight > 0
          ? algoResult.selectedStats.weightedGames / totalCandidateWeight
          : null,
        engineRank: selectedEngineIndex >= 0 ? selectedEngineIndex + 1 : null
      };


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
      const blackHistory = [...(node.uciHistory ?? historyFromCanonicalPgn(canonicalSourceNode.history)), canonicalWhiteMove.uci, algoResult.selectedUci].join(" ");

      let resultingDestinationId: string;
      let resultingDestinationFen: string = selectedDestinationFen;
      let resultingDestinationPgn = blackPgn;
      let resultingDestinationHistory = blackHistory;

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
                  ,...responseProvenance
              }
          });

          resultingDestinationId = result.destinationNodeId;
          resultingDestinationFen = result.destinationFullFen;
          resultingDestinationPgn = result.destinationPgn;
          const destination = await prisma.repertoireNode.findUnique({ where: { id: resultingDestinationId } });
          if (!destination) throw new Error("Reconciled RESPONSE destination disappeared");
          resultingDestinationHistory = destination.history;

          // Reconcile explanation but DO NOT wipe SRS progress
          const explanationUpdate = await prisma.repertoirePositionStat.updateMany({
             where: { repertoireId: repertoire.id, nodeId: posAfterWhiteNode.id, targetMoveId: result.responseId },
             data: { explanation: explanation }
          });
          if (explanationUpdate.count !== 1) throw new Error("Reconciled RESPONSE stat changed before explanation update");
      } else {
          let posAfterBlackNode = await getRepertoireNode(repertoire.id, blackHistory);
          if (!posAfterBlackNode) {
              posAfterBlackNode = await prisma.repertoireNode.findFirst({
                where: { repertoireId: repertoire.id, positionKey: positionKeyFromFen(selectedDestinationFen) }
              }) ?? await createRepertoireNode(repertoire.id, selectedDestinationFen, blackHistory, effectiveCanonicalProb, {
                displayPgn: blackPgn,
                humanDataSnapshotId: snapshotId
              });
          } else {
              await prisma.repertoireNode.update({
                  where: { id: posAfterBlackNode.id },
                  data: { cumulativeProb: Math.max(posAfterBlackNode.cumulativeProb, effectiveCanonicalProb) }
              });
          }

          resultingDestinationId = posAfterBlackNode.id;
          resultingDestinationFen = posAfterBlackNode.fullFen;
          resultingDestinationPgn = posAfterBlackNode.pgn;
          resultingDestinationHistory = posAfterBlackNode.history;

          const createdResponse = await createResponseMove({
              fromNodeId: posAfterWhiteNode.id,
              toNodeId: posAfterBlackNode.id,
              uci: algoResult.selectedUci,
              san: algoResult.selectedMoveSan,
              cp: algoResult.cp,
              mate: algoResult.mate,
              weightedCount: selectedWeightedCount,
              ...responseProvenance,
              source: algoResult.source,
              selectionMethod: algoResult.selectionMethod,
              moveOrigin: algoResult.moveOrigin,
              deepVerified: algoResult.deepVerified,
              localEvaluationProfile: algoResult.localEvaluationProfile
              ,routeHistory: posAfterBlackNode.history !== blackHistory ? blackHistory : null
              ,stopReason: posAfterBlackNode.history === "" || posAfterWhiteNode.history.startsWith(`${posAfterBlackNode.history} `)
                ? "Repetition"
                : posAfterBlackNode.history !== blackHistory ? "Transposition" : null
          });

          const emptyCard = createEmptyCard();
          await prisma.repertoirePositionStat.upsert({
            where: { repertoireId_positionKey_targetUci: { repertoireId: repertoire.id, positionKey: posAfterWhiteNode.positionKey, targetUci: algoResult.selectedUci } },
            update: { nodeId: posAfterWhiteNode.id, targetMoveId: createdResponse.id, explanation: explanation },
            create: {
              repertoireId: repertoire.id,
              positionKey: posAfterWhiteNode.positionKey,
              targetUci: algoResult.selectedUci,
              nodeId: posAfterWhiteNode.id,
              targetMoveId: createdResponse.id,
              explanation: explanation,
              // New cards are all immediately due; a small deterministic offset
              // introduces the most probable positions first without changing FSRS state.
              due: new Date(emptyCard.due.getTime() - (effectiveCanonicalProb * 1000)),
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

      await ensurePositionCache(resultingDestinationFen);
      await propagateRepertoireProbabilities(repertoire.id, resultingDestinationId);
      await restoreRebuildWikibooksState(resultingDestinationId, rebuildWikibooksCache);
      await attemptCanonicalNodeWikibooks(resultingDestinationId, wikibooksAttemptedNodeIds, ensureNodeWikibooks);

      const resultingResponse = await prisma.repertoireMove.findFirst({
        where: { fromNodeId: posAfterWhiteNode.id, playerTurn: "RESPONSE" }
      });
      if (resultingResponse?.stopReason === "Repetition") {
        console.log(`[STOPPED] ${algoResult.selectedMoveSan} repeats an earlier position on this route.`);
        reconciledResponseNodeIds.add(posAfterWhiteNode.id);
        totalSkippedMoves++;
        continue;
      }

      reconciledResponseNodeIds.add(posAfterWhiteNode.id);
      const continuationItem = buildCanonicalContinuationQueueItem({
          destinationNode: {
              id: resultingDestinationId,
              fullFen: resultingDestinationFen,
              pgn: resultingDestinationPgn
              ,history: resultingDestinationHistory
          },
          cumulativeProb: effectiveCanonicalProb
      });
      enqueueCanonicalContinuation({
          queue,
          pendingByResponseSource: pendingCanonicalContinuations,
          responseSourceNodeId: posAfterWhiteNode.id,
          item: continuationItem
      });

      await wait(100); // Shorter delay since we hit cache!
    }

    // --- TEMPORARY DETAILED SUMMARY PER NODE ---
    const runningElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n--- [CHECKPOINT] Node Finished ---`);
    console.log(`Time: ${runningElapsed}s | Positions Looked At: ${totalPositionsProcessed} (Aborted: ${totalBranchesAborted})`);
    console.log(`White Moves Found: ${totalWhiteMovesFound} (Skipped: ${totalSkippedMoves})`);
    console.log(`Missing White Moves: ${totalMissingWhiteMoves} | Missing Black Moves: ${totalMissingBlackMoves}`);
    console.log(`--------------------------------------------\n`);
  }
  
  const endTime = Date.now();
  const timeElapsed = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log("\n========================================================");
  console.log("=== TREE GENERATION SUMMARY ===");
  console.log(`Time Elapsed:             ${timeElapsed} seconds`);
  console.log(`Positions Looked At:      ${totalPositionsProcessed}`);
  console.log(`  - Branches Aborted:     ${totalBranchesAborted}`);
  console.log(`White Moves Found:        ${totalWhiteMovesFound}`);
  console.log(`Total Black Responses:    ${totalBlackMovesEvaluated}`);
  console.log(`Total Skipped (In DB):    ${totalSkippedMoves}`);
  console.log(`Missing White Moves:      ${totalMissingWhiteMoves}`);
  console.log(`Missing Black Moves:      ${totalMissingBlackMoves}`);
  console.log(`Total N/A Evals (Null):   ${totalNaEvals}`);
  console.log(`Duplicate Histories:      ${totalDuplicateHistories}`);
  console.log("========================================================\n");
  await prisma.$transaction([
    prisma.repertoirePositionStat.deleteMany({ where: { repertoireId: repertoire.id, nodeId: null } }),
    prisma.repertoire.update({ where: { id: repertoire.id }, data: { generationStatus: "IDLE", completedConfigHash: runtime.configHash } })
  ]);
  console.log("Generation Complete!");
  return {
    totalPositionsProcessed,
    totalWhiteMovesFound,
    totalBlackMovesEvaluated,
    totalSkippedMoves,
    totalMissingWhiteMoves,
    totalMissingBlackMoves
  };
  } catch (error) {
    try {
      await prisma.repertoire.update({ where: { id: repertoire.id }, data: { generationStatus: "FAILED" } });
    } catch (statusError) {
      console.error("Failed to record generator failure status:", statusError);
    }
    throw error;
  }
}
