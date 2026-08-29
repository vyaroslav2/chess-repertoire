import { Chess } from "chess.js";
import { prisma, getOrCreatePositionCache, getRepertoireNode, createRepertoireNode, createResponseMove, getOrCreateHumanDataSnapshot, ensureRepertoireNodeWikibooks, propagateRepertoireProbabilities } from "../db/operations";
import { parseFullFen, positionKeyFromFen } from "./fen";
import { fetchAllDatabases, fetchMastersOpeningMetadata } from "../api/lichess";
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
  fetchOpeningMetadata?: typeof fetchMastersOpeningMetadata;
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
type RebuildOpeningMetadataState = {
  status: "PRESENT" | "VALID_ABSENCE";
  source: "LICHESS_MASTERS";
  eco: string | null;
  openingName: string | null;
};
export type RebuildOpeningMetadataCache = Map<string, RebuildOpeningMetadataState>;

export async function captureRebuildOpeningMetadataCache(repertoireId: string): Promise<RebuildOpeningMetadataCache> {
  const nodes = await prisma.repertoireNode.findMany({
    where: { repertoireId, openingMetadataStatus: { in: ["PRESENT", "VALID_ABSENCE"] } },
    select: { history: true, openingMetadataStatus: true, openingMetadataSource: true, eco: true, openingName: true }
  });
  const cache: RebuildOpeningMetadataCache = new Map();
  for (const node of nodes) {
    if (node.openingMetadataSource !== "LICHESS_MASTERS") throw new Error("Stored opening metadata has an invalid or missing source");
    if (node.openingMetadataStatus === "PRESENT" && (!node.eco || !node.openingName)) throw new Error("Stored PRESENT opening metadata is incomplete");
    if (node.openingMetadataStatus === "VALID_ABSENCE" && (node.eco !== null || node.openingName !== null)) throw new Error("Stored VALID_ABSENCE opening metadata contains values");
    await prisma.openingMetadataHistoryCache.upsert({
      where: { repertoireId_history: { repertoireId, history: node.history } },
      update: { status: node.openingMetadataStatus!, source: "LICHESS_MASTERS", eco: node.eco, openingName: node.openingName },
      create: { repertoireId, history: node.history, status: node.openingMetadataStatus!, source: "LICHESS_MASTERS", eco: node.eco, openingName: node.openingName }
    });
  }
  const durable = await prisma.openingMetadataHistoryCache.findMany({ where: { repertoireId } });
  durable.sort((a, b) => historyFromCanonicalPgn(a.history).length - historyFromCanonicalPgn(b.history).length);
  for (const entry of durable) {
    if (entry.source !== "LICHESS_MASTERS") throw new Error("Cached opening metadata has an invalid source");
    if (entry.status === "PRESENT" && (!entry.eco || !entry.openingName)) throw new Error("Cached PRESENT opening metadata is incomplete");
    if (entry.status === "VALID_ABSENCE" && (entry.eco !== null || entry.openingName !== null)) throw new Error("Cached VALID_ABSENCE opening metadata contains values");
    if (entry.status !== "PRESENT" && entry.status !== "VALID_ABSENCE") throw new Error("Cached opening metadata has an invalid status");
    const parentHistory = historyFromCanonicalPgn(entry.history).slice(0, -1).join(" ");
    const parent = cache.get(parentHistory);
    const restored: RebuildOpeningMetadataState = entry.status === "VALID_ABSENCE" && parent?.status === "PRESENT"
      ? { ...parent }
      : { status: entry.status, source: "LICHESS_MASTERS" as const, eco: entry.eco, openingName: entry.openingName };
    cache.set(entry.history, restored);
    if (restored.status !== entry.status || restored.eco !== entry.eco || restored.openingName !== entry.openingName) {
      await prisma.openingMetadataHistoryCache.update({
        where: { id: entry.id },
        data: { status: restored.status, source: restored.source, eco: restored.eco, openingName: restored.openingName }
      });
    }
  }
  return cache;
}

export async function restoreRebuildOpeningMetadataState(nodeId: string, cache: RebuildOpeningMetadataCache) {
  const node = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: nodeId }, select: { history: true, openingMetadataStatus: true } });
  if (node.openingMetadataStatus || !cache.has(node.history)) return false;
  const restored = cache.get(node.history)!;
  await prisma.repertoireNode.update({ where: { id: nodeId }, data: {
    eco: restored.eco, openingName: restored.openingName,
    openingMetadataStatus: restored.status, openingMetadataSource: restored.source
  }});
  return true;
}

function normalizeOpeningMetadata(opening: { eco?: string | null; name?: string | null } | null) {
  const present = typeof opening?.eco === "string" && opening.eco.trim() !== "" &&
    typeof opening?.name === "string" && opening.name.trim() !== "";
  if (opening && !present) throw new Error("Lichess Masters opening metadata must contain both ECO and opening name");
  return present ? {
    eco: opening!.eco!, openingName: opening!.name!, status: "PRESENT" as const
  } : {
    eco: null, openingName: null, status: "VALID_ABSENCE" as const
  };
}

async function resolveOpeningMetadata(
  repertoireId: string,
  history: string,
  opening: { eco?: string | null; name?: string | null } | null
) {
  if (opening) return normalizeOpeningMetadata(opening);
  const moves = historyFromCanonicalPgn(history);
  if (moves.length > 0) {
    const parentHistory = moves.slice(0, -1).join(" ");
    const parent = await prisma.openingMetadataHistoryCache.findUnique({
      where: { repertoireId_history: { repertoireId, history: parentHistory } }
    });
    if (parent?.status === "PRESENT" && parent.source === "LICHESS_MASTERS" && parent.eco && parent.openingName) {
      return { eco: parent.eco, openingName: parent.openingName, status: "PRESENT" as const };
    }
  }
  return normalizeOpeningMetadata(null);
}

async function persistOpeningMetadataForHistory(
  repertoireId: string,
  history: string,
  opening: { eco?: string | null; name?: string | null } | null
) {
  const state = await resolveOpeningMetadata(repertoireId, history, opening);
  await prisma.openingMetadataHistoryCache.upsert({
    where: { repertoireId_history: { repertoireId, history } },
    update: { ...state, source: "LICHESS_MASTERS" },
    create: { repertoireId, history, ...state, source: "LICHESS_MASTERS" }
  });
  return state;
}

async function persistOpeningMetadata(nodeId: string, opening: { eco?: string | null; name?: string | null } | null) {
  const node = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: nodeId }, select: { repertoireId: true, history: true } });
  const state = await resolveOpeningMetadata(node.repertoireId, node.history, opening);
  await prisma.$transaction([
    prisma.openingMetadataHistoryCache.upsert({
      where: { repertoireId_history: { repertoireId: node.repertoireId, history: node.history } },
      update: { ...state, source: "LICHESS_MASTERS" },
      create: { repertoireId: node.repertoireId, history: node.history, ...state, source: "LICHESS_MASTERS" }
    }),
    prisma.repertoireNode.update({ where: { id: nodeId }, data: {
      eco: state.eco, openingName: state.openingName,
      openingMetadataStatus: state.status, openingMetadataSource: "LICHESS_MASTERS"
    }})
  ]);
}

export async function captureRebuildWikibooksCache(repertoireId: string): Promise<RebuildWikibooksCache> {
  const checkedNodes = await prisma.repertoireNode.findMany({
    where: { repertoireId, wikibooksChecked: true },
    select: { history: true, wikiText: true }
  });
  await prisma.$transaction(checkedNodes.map(node => prisma.wikibooksHistoryCache.upsert({
    where: { repertoireId_history: { repertoireId, history: node.history } },
    update: { wikiText: node.wikiText },
    create: { repertoireId, history: node.history, wikiText: node.wikiText }
  })));
  const durable = await prisma.wikibooksHistoryCache.findMany({
    where: { repertoireId },
    select: { history: true, wikiText: true }
  });
  return new Map(durable.map(entry => [entry.history, entry.wikiText]));
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
  let totalPositionsExpanded = 0;
  let totalWhiteMovesFound = 0;
  let totalMissingWhiteMoves = 0;
  let totalBlackMovesEvaluated = 0;
  let totalTranspositions = 0;
  let totalRepetitionStops = 0;
  let totalBranchesAborted = 0;
  let totalNaEvals = 0;
  let totalDuplicateHistories = 0;
  let maximumQueueSize = 1;

  const fetchDatabases = dependencies.fetchDatabases ?? fetchAllDatabases;
  const fetchOpeningMetadata = dependencies.fetchOpeningMetadata ?? fetchMastersOpeningMetadata;
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
  const rebuildOpeningMetadataCache = await captureRebuildOpeningMetadataCache(repertoire.id);

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
  await restoreRebuildOpeningMetadataState(rootNode.id, rebuildOpeningMetadataCache);

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
    console.log(`[Run totals] Elapsed: ${currentElapsed}s | Work Items Examined: ${totalPositionsProcessed}`);

    if (new Chess(node.fen).isGameOver()) {
      console.log(`[TERMINAL] Game-over position reached. No continuation is generated.`);
      continue;
    }

    let dynamicMaxDepth = runtime.config.generation.rareDepthBudget;
    let dynamicProbabilityBand = "rare";
    if (node.cumulativeProb >= runtime.config.generation.commonProbability) {
        dynamicMaxDepth = runtime.config.generation.commonDepthBudget;
        dynamicProbabilityBand = "common";
    } else if (node.cumulativeProb >= runtime.config.generation.uncommonProbability) {
        dynamicMaxDepth = runtime.config.generation.uncommonDepthBudget;
        dynamicProbabilityBand = "uncommon";
    }
    const uncappedDynamicMaxDepth = dynamicMaxDepth;
    dynamicMaxDepth = Math.min(uncappedDynamicMaxDepth, maxDepth);
    console.log(`[DYNAMIC DEPTH] cumulative probability=${(node.cumulativeProb * 100).toFixed(3)}%; band=${dynamicProbabilityBand}; dynamic budget=${uncappedDynamicMaxDepth} full moves; generation cap=${maxDepth} full moves; effective depth limit=${dynamicMaxDepth} full moves.`);

    if (node.currentMoveNumber > dynamicMaxDepth) {
      console.log(`[DEPTH-LIMIT STOP] Hit dynamic depth limit (${dynamicMaxDepth} moves) for prob ${(node.cumulativeProb*100).toFixed(2)}%. No White moves were processed for this work item.`);
      totalBranchesAborted++;
      continue;
    }
    totalPositionsExpanded++;
    const canonicalSourceNode = await prisma.repertoireNode.findUnique({ where: { id: node.nodeId } });
    if (!canonicalSourceNode || canonicalSourceNode.repertoireId !== repertoire.id) {
      throw new Error("Queued canonical source node disappeared or changed repertoire");
    }
    if (canonicalSourceNode.fullFen !== node.fen || canonicalSourceNode.pgn !== pgnString) {
      throw new Error("Queued canonical source state no longer matches its node/history");
    }
    await restoreRebuildOpeningMetadataState(canonicalSourceNode.id, rebuildOpeningMetadataCache);
    await attemptCanonicalNodeWikibooks(canonicalSourceNode.id, wikibooksAttemptedNodeIds, ensureNodeWikibooks);

    const [masters, , amateur] = await fetchDatabases(canonicalSourceNode.fullFen, snapshotId);
    await ensurePositionCache(canonicalSourceNode.fullFen);
    const existingMetadata = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: canonicalSourceNode.id }, select: { openingMetadataStatus: true } });
    if (!existingMetadata.openingMetadataStatus) {
      const opening = masters.retrieval === "CACHE"
        ? await fetchOpeningMetadata(canonicalSourceNode.fullFen)
        : masters.opening;
      await persistOpeningMetadata(canonicalSourceNode.id, opening);
    }
    
    const whiteCandidates = selectWhiteCandidates(
      node.currentMoveNumber,
      amateur.moves || [],
      amateur.totalGames || 0
    );
    const rawAmateurMoveCount = new Set((amateur.moves || []).map(move => move.uci || move.san)).size;

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
      if (branch.destinationNodeId !== null) {
        await propagateRepertoireProbabilities(repertoire.id, branch.destinationNodeId);
      }
    }

    if (whiteCandidates.length === 0) {
        const tempChess = new Chess(node.fen);
        if (!tempChess.isGameOver() && rawAmateurMoveCount === 0) {
            console.log(`[MISSING WHITE MOVES] Amateur Explorer successfully returned zero moves for ${pgnString || "(root)"}. Stopping branch because White selection is Amateur-only.`);
            totalMissingWhiteMoves++;
        } else if (!tempChess.isGameOver()) {
            console.log(`[PRUNED — BELOW AMATEUR THRESHOLD] Amateur Explorer returned ${rawAmateurMoveCount} move(s), but none met the configured popularity threshold.`);
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
      const resultingProbability = canonicalWhiteMove.trueProbability;
      const resultingBand = resultingProbability >= runtime.config.generation.commonProbability
        ? "common"
        : resultingProbability >= runtime.config.generation.uncommonProbability ? "uncommon" : "rare";
      const resultingBudget = resultingBand === "common"
        ? runtime.config.generation.commonDepthBudget
        : resultingBand === "uncommon" ? runtime.config.generation.uncommonDepthBudget : runtime.config.generation.rareDepthBudget;
      console.log(`[BRANCH PROBABILITY] route probability before White move=${(canonicalSourceNode.cumulativeProb * 100).toFixed(3)}%; White move share at this position=${(whiteMove.probability * 100).toFixed(3)}%; resulting route probability=${(resultingProbability * 100).toFixed(3)}%; band=${resultingBand}; dynamic budget=${resultingBudget} full moves; generation cap=${maxDepth}; effective depth limit=${Math.min(resultingBudget, maxDepth)}.`);
      const newPgn = canonicalWhiteMove.destinationPgn;
      const reconciledEdge = await prisma.repertoireMove.findUnique({ where: { id: reconciledOpponent.edgeId } });
      if (reconciledEdge?.stopReason === "Repetition") {
        await persistOpeningMetadataForHistory(
          repertoire.id,
          canonicalWhiteMove.destinationHistory,
          await fetchOpeningMetadata(canonicalWhiteMove.destinationFullFen)
        );
        console.log(`[REPETITION STOP] route=${canonicalWhiteMove.destinationHistory}; repeated=${reconciledOpponent.destinationCanonicalPgn || "(root)"}; repeatingMove=${canonicalWhiteMove.san}; terminalProbability=${reconciledOpponent.effectiveCumulativeProb}; result=move retained and route terminated without a destination edge.`);
        totalRepetitionStops++;
        continue;
      }
      if (reconciledOpponent.destinationNodeId === null) {
        throw new Error("Non-repetition OPPONENT branch is missing its destination");
      }
      const posAfterWhiteNode = await prisma.repertoireNode.findUnique({
        where: { id: reconciledOpponent.destinationNodeId }
      });
      if (!posAfterWhiteNode || posAfterWhiteNode.repertoireId !== repertoire.id) {
        throw new Error("Reconciled OPPONENT destination disappeared or changed repertoire");
      }
      await ensurePositionCache(posAfterWhiteNode.fullFen);
      await restoreRebuildOpeningMetadataState(posAfterWhiteNode.id, rebuildOpeningMetadataCache);
      await restoreRebuildWikibooksState(posAfterWhiteNode.id, rebuildWikibooksCache);
      const effectiveCanonicalProb = reconciledOpponent.effectiveCumulativeProb;

      // A canonical transposition RESPONSE is reconciled once per generator pass.
      // A pre-existing stat alone is never treated as proof that it was reconciled.
      if (reconciledResponseNodeIds.has(posAfterWhiteNode.id)) {
          raisePendingCanonicalContinuationProbability({
              pendingByResponseSource: pendingCanonicalContinuations,
              responseSourceNodeId: posAfterWhiteNode.id,
              effectiveCumulativeProb: effectiveCanonicalProb
          });
          totalTranspositions++;
          console.log(`[TRANSPOSITION] route=${newPgn}; canonicalRoute=${posAfterWhiteNode.pgn}; canonical cumulative probability=${(effectiveCanonicalProb * 100).toFixed(3)}% from all incoming routes; result=reused the canonical Black response without duplicate evaluation.`);
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
      const responseNodeMetadata = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: posAfterWhiteNode.id }, select: { openingMetadataStatus: true } });
      if (!responseNodeMetadata.openingMetadataStatus) {
        const opening = algoResult.openingMetadataRetrieval === "CACHE"
          ? await fetchOpeningMetadata(posAfterWhiteNode.fullFen)
          : algoResult.openingMetadata ?? null;
        await persistOpeningMetadata(posAfterWhiteNode.id, opening);
      }
      await attemptCanonicalNodeWikibooks(posAfterWhiteNode.id, wikibooksAttemptedNodeIds, ensureNodeWikibooks);
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

      let resultingDestinationId: string | null;
      let resultingDestinationFen: string | null = selectedDestinationFen;
      let resultingDestinationPgn: string | null = blackPgn;
      let resultingDestinationHistory: string | null = blackHistory;

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
          if (resultingDestinationId !== null) {
            const destination = await prisma.repertoireNode.findUnique({ where: { id: resultingDestinationId } });
            if (!destination) throw new Error("Reconciled RESPONSE destination disappeared");
            resultingDestinationHistory = destination.history;
          }

          // Reconcile explanation but DO NOT wipe SRS progress
          const explanationUpdate = await prisma.repertoirePositionStat.updateMany({
             where: { repertoireId: repertoire.id, nodeId: posAfterWhiteNode.id, targetMoveId: result.responseId },
             data: { explanation: explanation }
          });
          if (explanationUpdate.count !== 1) throw new Error("Reconciled RESPONSE stat changed before explanation update");
      } else {
          let posAfterBlackNode = await getRepertoireNode(repertoire.id, blackHistory) ??
            await prisma.repertoireNode.findFirst({
              where: { repertoireId: repertoire.id, positionKey: positionKeyFromFen(selectedDestinationFen) }
            });
          const responseIsRepetition = posAfterBlackNode !== null &&
            (posAfterBlackNode.history === "" || posAfterWhiteNode.history.startsWith(`${posAfterBlackNode.history} `));
          if (!posAfterBlackNode) {
              posAfterBlackNode = await createRepertoireNode(repertoire.id, selectedDestinationFen, blackHistory, effectiveCanonicalProb, {
                displayPgn: blackPgn,
                humanDataSnapshotId: snapshotId
              });
          } else if (!responseIsRepetition) {
              await prisma.repertoireNode.update({
                  where: { id: posAfterBlackNode.id },
                  data: { cumulativeProb: Math.max(posAfterBlackNode.cumulativeProb, effectiveCanonicalProb) }
              });
          }

          resultingDestinationId = responseIsRepetition ? null : posAfterBlackNode.id;
          resultingDestinationFen = posAfterBlackNode.fullFen;
          resultingDestinationPgn = posAfterBlackNode.pgn;
          resultingDestinationHistory = posAfterBlackNode.history;

          const createdResponse = await createResponseMove({
              fromNodeId: posAfterWhiteNode.id,
              toNodeId: responseIsRepetition ? null : posAfterBlackNode.id,
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
              ,routeHistory: responseIsRepetition || posAfterBlackNode.history !== blackHistory ? blackHistory : null
              ,stopReason: responseIsRepetition
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

      const resultingResponse = await prisma.repertoireMove.findFirst({
        where: { fromNodeId: posAfterWhiteNode.id, playerTurn: "RESPONSE" }
      });
      if (resultingResponse?.stopReason === "Repetition") {
        await persistOpeningMetadataForHistory(
          repertoire.id,
          blackHistory,
          await fetchOpeningMetadata(selectedDestinationFen)
        );
        console.log(`[REPETITION STOP] route=${blackHistory}; repeated=${resultingDestinationHistory || "(root)"}; repeatingMove=${algoResult.selectedMoveSan}; terminalProbability=${effectiveCanonicalProb}; result=target move retained and route terminated without a destination edge.`);
        reconciledResponseNodeIds.add(posAfterWhiteNode.id);
        totalRepetitionStops++;
        continue;
      }

      if (!resultingDestinationId || !resultingDestinationFen || resultingDestinationPgn === null || resultingDestinationHistory === null) {
        throw new Error("Non-repetition RESPONSE is missing its destination");
      }
      await ensurePositionCache(resultingDestinationFen);
      await propagateRepertoireProbabilities(repertoire.id, resultingDestinationId);
      await restoreRebuildOpeningMetadataState(resultingDestinationId, rebuildOpeningMetadataCache);
      const destinationMetadata = await prisma.repertoireNode.findUniqueOrThrow({
        where: { id: resultingDestinationId },
        select: { openingMetadataStatus: true }
      });
      if (!destinationMetadata.openingMetadataStatus) {
        await persistOpeningMetadata(resultingDestinationId, await fetchOpeningMetadata(resultingDestinationFen));
      }
      await restoreRebuildWikibooksState(resultingDestinationId, rebuildWikibooksCache);
      await attemptCanonicalNodeWikibooks(resultingDestinationId, wikibooksAttemptedNodeIds, ensureNodeWikibooks);

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
    console.log(`Time: ${runningElapsed}s | Work Items Examined: ${totalPositionsProcessed} | Positions Expanded: ${totalPositionsExpanded} | Depth-Limited Stops: ${totalBranchesAborted}`);
    console.log(`White Moves Found: ${totalWhiteMovesFound}`);
    console.log(`Transpositions: ${totalTranspositions} | Repetition Stops: ${totalRepetitionStops}`);
    console.log(`Missing White Moves: ${totalMissingWhiteMoves}`);
    console.log(`--------------------------------------------\n`);
  }
  
  const endTime = Date.now();
  const timeElapsed = ((endTime - startTime) / 1000).toFixed(2);
  const openingStates = await prisma.repertoireNode.findMany({
    where: { repertoireId: repertoire.id },
    select: { history: true, openingMetadataStatus: true, openingMetadataSource: true, eco: true, openingName: true }
  });
  for (const state of openingStates) {
    if (state.openingMetadataSource !== "LICHESS_MASTERS" ||
        (state.openingMetadataStatus !== "PRESENT" && state.openingMetadataStatus !== "VALID_ABSENCE") ||
        (state.openingMetadataStatus === "PRESENT" && (!state.eco || !state.openingName)) ||
        (state.openingMetadataStatus === "VALID_ABSENCE" && (state.eco !== null || state.openingName !== null))) {
      throw new Error(`Generated history ${state.history || "(root)"} has incomplete opening metadata state`);
    }
  }
  
  console.log("\n========================================================");
  console.log("=== TREE GENERATION SUMMARY ===");
  console.log(`Time Elapsed:             ${timeElapsed} seconds`);
  console.log(`Work Items Examined:      ${totalPositionsProcessed}`);
  console.log(`Positions Expanded:       ${totalPositionsExpanded}`);
  console.log(`Depth-Limited Stops:      ${totalBranchesAborted}`);
  console.log(`White Moves Found:        ${totalWhiteMovesFound}`);
  console.log(`Total Black Responses:    ${totalBlackMovesEvaluated}`);
  console.log(`Transpositions:           ${totalTranspositions}`);
  console.log(`Repetition Stops:         ${totalRepetitionStops}`);
  console.log(`Missing White Moves:      ${totalMissingWhiteMoves}`);
  console.log(`Black Responses Without CP: ${totalNaEvals}`);
  console.log(`Duplicate Histories:      ${totalDuplicateHistories}`);
  console.log("========================================================\n");
  await prisma.$transaction([
    prisma.repertoirePositionStat.deleteMany({ where: { repertoireId: repertoire.id, nodeId: null } }),
    prisma.repertoire.update({ where: { id: repertoire.id }, data: { generationStatus: "IDLE", completedConfigHash: runtime.configHash } })
  ]);
  console.log("Generation Complete!");
  return {
    totalPositionsProcessed,
    totalPositionsExpanded,
    totalWhiteMovesFound,
    totalBlackMovesEvaluated,
    totalSkippedMoves: totalTranspositions + totalRepetitionStops,
    totalTranspositions,
    totalRepetitionStops,
    totalMissingWhiteMoves,
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
