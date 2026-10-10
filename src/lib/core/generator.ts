import { Chess } from "chess.js";
import {
  prisma,
  getRepertoireNode,
  createRepertoireNode,
  createResponseMove,
  ensureRepertoireNodeWikibooks,
  validateOpeningMetadataState,
  type OpeningMetadataState,
  type ResponseEnding
} from "../db/operations";
import { parseFullFen, positionKeyFromFen } from "./fen";
import { fetchExplorer, fetchOpeningMetadata as fetchAmateurOpeningMetadata, type ExplorerOpening } from "../api/lichess";
import { defaultConfig, createRuntimeConfig, getProbabilityBand, type Config } from "../core/config";
import { selectWhiteCandidates, evaluateBlackMove } from "./evaluator";
import { runCascade, probabilityBalance, type CascadeRunState } from "./cascade";
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

// S2.02, S2.03: deliberately hardcoded.
const userName = "Yaroslav";
const repertoireTitle = "Black Universal Repertoire";
const repertoireColour = "black";

export type GenerateRepertoireDependencies = {
  repertoireId?: string;
  fetchDatabases?: typeof fetchExplorer;
  fetchOpeningMetadata?: typeof fetchAmateurOpeningMetadata;
  responseEvaluator?: ResponseEvaluator;
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
export type RebuildOpeningMetadataCache = Map<string, OpeningMetadataState>;

/** DB.33: opening metadata is kept per route, so a rebuilt tree gets its names back. */
export async function captureRebuildOpeningMetadataCache(repertoireId: string): Promise<RebuildOpeningMetadataCache> {
  const nodes = await prisma.repertoireNode.findMany({
    where: { repertoireId, openingMetadataStatus: { in: ["PRESENT", "VALID_ABSENCE"] } },
    select: { history: true, openingMetadataStatus: true, eco: true, openingName: true }
  });
  for (const node of nodes) {
    const state = { status: node.openingMetadataStatus, eco: node.eco, openingName: node.openingName };
    validateOpeningMetadataState(state, `Stored opening metadata for ${node.history || "(root)"}`);
    await prisma.openingMetadataHistoryCache.upsert({
      where: { repertoireId_history: { repertoireId, history: node.history } },
      update: state,
      create: { repertoireId, history: node.history, ...state }
    });
  }
  const durable = await prisma.openingMetadataHistoryCache.findMany({ where: { repertoireId } });
  durable.sort((a, b) => historyFromCanonicalPgn(a.history).length - historyFromCanonicalPgn(b.history).length);
  const cache: RebuildOpeningMetadataCache = new Map();
  for (const entry of durable) {
    validateOpeningMetadataState(entry, `Cached opening metadata for ${entry.history || "(root)"}`);
    const parentHistory = historyFromCanonicalPgn(entry.history).slice(0, -1).join(" ");
    const parent = entry.history === "" ? undefined : cache.get(parentHistory);
    // DB.06 rule 2: a position Explorer does not name copies its parent.
    const restored: OpeningMetadataState = entry.status === "VALID_ABSENCE" && parent?.status === "PRESENT"
      ? { ...parent }
      : { status: entry.status, eco: entry.eco, openingName: entry.openingName };
    cache.set(entry.history, restored);
    if (restored.status !== entry.status || restored.eco !== entry.eco || restored.openingName !== entry.openingName) {
      await prisma.openingMetadataHistoryCache.update({ where: { id: entry.id }, data: restored });
    }
  }
  return cache;
}

export async function restoreRebuildOpeningMetadataState(nodeId: string, cache: RebuildOpeningMetadataCache) {
  const node = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: nodeId }, select: { history: true, openingMetadataStatus: true } });
  if (node.openingMetadataStatus || !cache.has(node.history)) return false;
  const restored = cache.get(node.history)!;
  await prisma.repertoireNode.update({ where: { id: nodeId }, data: {
    eco: restored.eco, openingName: restored.openingName, openingMetadataStatus: restored.status
  }});
  return true;
}

/**
 * DB.06: the name after this ply, on this route.
 * 1. Explorer names the position --> PRESENT.
 * 2. It does not --> copy eco, openingName and status from the parent node.
 * 3. The root, with no name --> VALID_ABSENCE.
 */
async function resolveOpeningMetadata(
  repertoireId: string,
  history: string,
  opening: ExplorerOpening | null
): Promise<OpeningMetadataState> {
  if (opening) {
    const state = { status: "PRESENT" as const, eco: opening.eco, openingName: opening.name };
    validateOpeningMetadataState(state, "Explorer opening metadata");
    return state;
  }
  const moves = historyFromCanonicalPgn(history);
  if (moves.length === 0) return { status: "VALID_ABSENCE", eco: null, openingName: null };
  const parentHistory = moves.slice(0, -1).join(" ");
  const parentNode = await prisma.repertoireNode.findFirst({
    where: { repertoireId, history: parentHistory },
    select: { openingMetadataStatus: true, eco: true, openingName: true }
  });
  const parent = parentNode?.openingMetadataStatus
    ? { status: parentNode.openingMetadataStatus, eco: parentNode.eco, openingName: parentNode.openingName }
    : await prisma.openingMetadataHistoryCache.findUnique({ where: { repertoireId_history: { repertoireId, history: parentHistory } } });
  if (!parent) throw new Error(`Opening metadata for ${history} needs its parent's, but the parent has none`);
  validateOpeningMetadataState(parent, `Parent opening metadata for ${history}`);
  return { status: parent.status, eco: parent.eco, openingName: parent.openingName };
}

async function persistOpeningMetadata(nodeId: string, opening: ExplorerOpening | null) {
  const node = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: nodeId }, select: { repertoireId: true, history: true } });
  const state = await resolveOpeningMetadata(node.repertoireId, node.history, opening);
  await prisma.$transaction([
    prisma.openingMetadataHistoryCache.upsert({
      where: { repertoireId_history: { repertoireId: node.repertoireId, history: node.history } },
      update: state,
      create: { repertoireId: node.repertoireId, history: node.history, ...state }
    }),
    prisma.repertoireNode.update({ where: { id: nodeId }, data: {
      eco: state.eco, openingName: state.openingName, openingMetadataStatus: state.status
    }})
  ]);
}

/**
 * Give a node its opening metadata once: from the route cache (DB.33), else by DB.06.
 * "NOT_FETCHED" is DB.06 rule 4: the position was never sent to Explorer, so fetch it
 * for the name only (Amateur).
 */
async function ensureNodeOpeningMetadata(
  nodeId: string,
  cache: RebuildOpeningMetadataCache,
  opening: ExplorerOpening | null | "NOT_FETCHED",
  fetchOpeningMetadata: typeof fetchAmateurOpeningMetadata
) {
  if (await restoreRebuildOpeningMetadataState(nodeId, cache)) return;
  const node = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: nodeId }, select: { fullFen: true, openingMetadataStatus: true } });
  if (node.openingMetadataStatus) return;
  await persistOpeningMetadata(nodeId, opening === "NOT_FETCHED" ? await fetchOpeningMetadata(node.fullFen) : opening);
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
  responseNode: { id: string; fullFen: string; displayPgn: string };
  routePgn: string;
  evaluator?: ResponseEvaluator;
}) {
  const canonicalHistory = historyFromCanonicalPgn(input.responseNode.displayPgn);
  const canonicalChess = new Chess(input.responseNode.fullFen);
  const evaluator = input.evaluator ?? evaluateBlackMove;
  const result = await evaluator(
    input.responseNode.fullFen,
    canonicalChess,
    canonicalHistory
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
    routeIsCanonicalOwner: input.routePgn === input.responseNode.displayPgn,
    canonicalHistory,
    selectedSan: selectedMove.san,
    selectedDestinationFullFen: parseFullFen(canonicalChess.fen())
  };
}

/**
 * RE.02, RE.08: does the route end at the position Black's move reached?
 * The position has White to move, so its fullmove number is one past the full moves played.
 * No repetition or transposition check here (RE.N.02).
 */
export function responseEnding(input: {
  fullFen: string;
  cumProb: number;
  config: Config;
}): ResponseEnding | null {
  if (new Chess(input.fullFen).isGameOver()) return "Game over on Black's move";
  const depthBudget = input.config.depthBudget[getProbabilityBand(input.cumProb, input.config)];
  if (fullmoveNumberFromFullFen(input.fullFen) > Math.min(depthBudget, input.config.depthCap)) {
    return "Depth budget reached on Black's move";
  }
  return null;
}

export function buildCanonicalContinuationQueueItem(input: {
  destinationNode: { id: string; fullFen: string; displayPgn: string; history?: string };
  cumProb: number;
}) {
  return {
    nodeId: input.destinationNode.id,
    fen: input.destinationNode.fullFen,
    currentMoveNumber: fullmoveNumberFromFullFen(input.destinationNode.fullFen),
    cumProb: input.cumProb,
    history: historyFromCanonicalPgn(input.destinationNode.displayPgn),
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
  effectiveCumProb: number;
}) {
  const pending = input.pendingByResponseSource.get(input.responseSourceNodeId);
  if (!pending) return false;
  pending.cumProb = Math.max(pending.cumProb, input.effectiveCumProb);
  return true;
}

export function dequeueGeneratorQueueItem(
  queue: GeneratorQueueItem[],
  pendingByResponseSource: PendingCanonicalContinuations
) {
  // Tree generation is deliberately depth-first.  Apart from keeping the
  // working set small, this is important for transpositions: the first node
  // which reaches a position becomes its canonical owner, just as it does in
  // the reference tree walker.  `push` below and `pop` here therefore form a
  // LIFO worklist; do not replace this with `shift`.
  const item = queue.pop();
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
  node: { id: string; cumProb: number };
  incomingPathProb: number;
}) {
  if (!Number.isFinite(input.node.cumProb) || input.node.cumProb < 0 ||
      !Number.isFinite(input.incomingPathProb) || input.incomingPathProb < 0) {
    throw new Error("Canonical cumulative probability must be finite and non-negative");
  }
  if (input.incomingPathProb > input.node.cumProb) {
    await prisma.repertoireNode.updateMany({
      where: { id: input.node.id, cumProb: { lt: input.incomingPathProb } },
      data: { cumProb: input.incomingPathProb }
    });
  }
  const currentNode = await prisma.repertoireNode.findUnique({ where: { id: input.node.id } });
  if (!currentNode) throw new Error("Canonical repertoire node disappeared during probability reconciliation");
  return currentNode;
}

/** EX.06: the route ends at a position Explorer has no Amateur games for. */
export const NO_OPPONENT_MOVES_ENDING = "No opponent moves found";

/** S3.10: rareDroppedMovesTotal, every node with stopReason = Too rare. */
export async function countRareDroppedMoves(repertoireId: string) {
  return prisma.repertoireMove.count({ where: { repertoireId, stopReason: "Too rare" } });
}

/** S3.11, S3.13, S3.14: the end-of-run checks. One message per check that fails; S3.15 throws on any. */
export async function endOfRunFailures(input: {
  repertoireId: string;
  tinyDroppedTotal: number;
  config: Pick<Config, "probabilityTolerance">;
}) {
  const { repertoireId } = input;
  const failures: string[] = [];

  // S3.11
  const balance = await probabilityBalance(repertoireId, input.tinyDroppedTotal);
  if (Math.abs(balance - 1) > input.config.probabilityTolerance) {
    failures.push(`S3.11: ending total + rareDroppedTotal + unaccountedDroppedTotal + tinyDroppedTotal is ${(balance * 100).toFixed(6)}%, not 100%.`);
  }

  // S3.13, DB.06: a missing status or a half-filled pair.
  const openingStates = await prisma.repertoireNode.findMany({
    where: { repertoireId },
    select: { history: true, openingMetadataStatus: true, eco: true, openingName: true }
  });
  for (const state of openingStates) {
    try {
      validateOpeningMetadataState(
        { status: state.openingMetadataStatus, eco: state.eco, openingName: state.openingName },
        `Generated history ${state.history || "(root)"} has incomplete opening metadata state`
      );
    } catch (error) {
      failures.push(`S3.13: ${(error as Error).message}`);
      break;
    }
  }

  // S3.14, DB.20: an ending reached by a move carries a stopReason on that move. The root has no move.
  const unexplained = await prisma.repertoireNode.findMany({
    where: {
      repertoireId,
      history: { not: "" },
      outgoingMoves: { none: {} },
      incomingMoves: { none: { stopReason: { not: null } } }
    },
    select: { displayPgn: true }
  });
  if (unexplained.length > 0) {
    failures.push(`S3.14: ${unexplained.length} routes end without a stopReason (first: ${unexplained[0].displayPgn}).`);
  }

  return failures;
}

export async function generateRepertoire(
  startFen: string,
  dependencies: GenerateRepertoireDependencies = {}
) {
  console.log("Initializing BFS Tree Generator...");
  
  const startTime = Date.now();
  // S2.01: zeroed once per run. rareDroppedTotal and unaccountedDroppedTotal are summed from nodes.
  const cascadeRun: CascadeRunState = { cascadeCount: 0, tinyDroppedTotal: 0 };
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

  const fetchDatabases = dependencies.fetchDatabases ?? fetchExplorer;
  const fetchOpeningMetadata = dependencies.fetchOpeningMetadata ?? fetchAmateurOpeningMetadata;
  const ensureNodeWikibooks = dependencies.ensureNodeWikibooks ?? ensureRepertoireNodeWikibooks;
  const wait = dependencies.wait ?? delay;
  let repertoire;
  if (dependencies.repertoireId) {
    repertoire = await prisma.repertoire.findUnique({ where: { id: dependencies.repertoireId } });
    if (!repertoire) throw new Error(`Requested repertoire ${dependencies.repertoireId} does not exist`);
  } else {
    let user = await prisma.user.findUnique({ where: { username: userName } });
    if (!user) { user = await prisma.user.create({ data: { username: userName } }); }
    repertoire = await prisma.repertoire.findFirst({ where: { title: repertoireTitle, userId: user.id } });
    if (!repertoire) {
      repertoire = await prisma.repertoire.create({
        data: { title: repertoireTitle, color: repertoireColour, userId: user.id }
      });
    }
  }

  const runtime = createRuntimeConfig(defaultConfig);
  const rebuildWikibooksCache = await captureRebuildWikibooksCache(repertoire.id);
  const rebuildOpeningMetadataCache = await captureRebuildOpeningMetadataCache(repertoire.id);

  try {
  await prisma.$transaction(async tx => {
    await tx.repertoire.update({ where: { id: repertoire.id }, data: { generationStatus: "GENERATING" } });
    // S2.04: wipe the tree (nodes, moves) and the Position table built from it. Caches survive (DB.30).
    await tx.position.deleteMany({ where: { repertoireId: repertoire.id } });
    await tx.repertoireMove.deleteMany({ where: { repertoireId: repertoire.id } });
    await tx.repertoireNode.deleteMany({ where: { repertoireId: repertoire.id } });
  });

  const rootNode = await createRepertoireNode(repertoire.id, startFen, "", 1.0, {
    displayPgn: "",
    siblingIndex: 0
  });
  await restoreRebuildWikibooksState(rootNode.id, rebuildWikibooksCache);
  await restoreRebuildOpeningMetadataState(rootNode.id, rebuildOpeningMetadataCache);

  const queue: GeneratorQueueItem[] = [{
    nodeId: rootNode.id,
    fen: startFen, 
    currentMoveNumber: 1, 
    cumProb: 1.0, 
    history: [] as string[] 
    ,uciHistory: [] as string[]
  }];
  
  // S3.03: in-run only, marked at dequeue.
  const visitedNodes = new Set<string>();
  const wikibooksAttemptedNodeIds = new Set<string>();
  const pendingCanonicalContinuations: PendingCanonicalContinuations = new Map();

  const logQueueContents = () => {
    if (queue.length === 0) {
      console.log("[QUEUE ITEM] (empty)");
      return;
    }
    queue.forEach((item, index) => {
      console.log(`[QUEUE ITEM] ${index + 1}. ${item.history.join(" ") || "(root)"}`);
    });
  };

  await attemptCanonicalNodeWikibooks(rootNode.id, wikibooksAttemptedNodeIds, ensureNodeWikibooks);
  
  while (true) {
    // S0.04/S3.01: the stop flag is read here only, before the empty-queue check.
    if (dependencies.shouldStop?.()) {
      throw new UserRequestedStopError("Generation was stopped at the user's request between positions");
    }
    if (queue.length === 0) break;
    const nextNode = queue[0];
    console.log(`\n--- Queue Before Dequeue: ${queue.length} | Move: ${nextNode.currentMoveNumber} ---`);
    console.log(`[QUEUE] Before dequeue: ${queue.length}`);
    console.log("[QUEUE CONTENTS]");
    logQueueContents();
    const node = dequeueGeneratorQueueItem(queue, pendingCanonicalContinuations);
    if (!node) continue;
    
    const pgnString = node.history.join(" ");
    // S3.03
    if (visitedNodes.has(node.nodeId)) {
      totalDuplicateHistories++;
      console.warn(`[WARNING] Duplicate queued history skipped: ${pgnString || "(root)"}`);
      continue;
    }
    visitedNodes.add(node.nodeId);
    
    totalPositionsProcessed++;

    const currentElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    maximumQueueSize = Math.max(maximumQueueSize, queue.length + 1);
    console.log(`[QUEUE] Dequeued: ${pgnString || "(root)"}`);
    console.log(`[QUEUE] Waiting after dequeue: ${queue.length}`);
    console.log("[QUEUE CONTENTS]");
    logQueueContents();
    console.log(`[QUEUE] Maximum work items observed at once, including the dequeued item: ${maximumQueueSize}`);
    console.log(`History: ${pgnString}`);
    console.log(`[Run totals] Elapsed: ${currentElapsed}s | Work Items Examined: ${totalPositionsProcessed}`);

    // Only the seeded root can be game over here: RE.02 keeps game-over positions off the queue.
    if (new Chess(node.fen).isGameOver()) {
      await ensureNodeOpeningMetadata(node.nodeId, rebuildOpeningMetadataCache, "NOT_FETCHED", fetchOpeningMetadata);
      console.log(`[TERMINAL] Game-over position reached. No continuation is generated.`);
      console.log(`[QUEUE] Nothing enqueued: game-over position; waiting=${queue.length}`);
      continue;
    }

    totalPositionsExpanded++;
    const canonicalSourceNode = await prisma.repertoireNode.findUnique({ where: { id: node.nodeId } });
    if (!canonicalSourceNode || canonicalSourceNode.repertoireId !== repertoire.id) {
      throw new Error("Queued canonical source node disappeared or changed repertoire");
    }
    if (canonicalSourceNode.fullFen !== node.fen || canonicalSourceNode.displayPgn !== pgnString) {
      throw new Error("Queued canonical source state no longer matches its node/history");
    }
    await attemptCanonicalNodeWikibooks(canonicalSourceNode.id, wikibooksAttemptedNodeIds, ensureNodeWikibooks);

    const amateur = await fetchDatabases(canonicalSourceNode.fullFen);
    await ensureNodeOpeningMetadata(canonicalSourceNode.id, rebuildOpeningMetadataCache, amateur.opening, fetchOpeningMetadata);
    
    // EX.05: moveProb is a share of the position's total, so the games with no move are not handed to the children.
    // HM.04 / HM.05: every returned move, most popular first; a dropped move has include = false.
    const whiteCandidates = selectWhiteCandidates(
      node.currentMoveNumber,
      amateur.moves || [],
      amateur.positionTotalGames || 0
    );
    const rawAmateurMoveCount = new Set((amateur.moves || []).map(move => move.uci || move.san)).size;

    const canonicalOpponentCandidates = canonicalizeOpponentCandidates({
      sourceFullFen: canonicalSourceNode.fullFen,
      sourcePgn: canonicalSourceNode.displayPgn,
      sourceHistory: canonicalSourceNode.history,
      sourceRouteProb: canonicalSourceNode.routeProb,
      sourceCumProb: canonicalSourceNode.cumProb,
      candidates: whiteCandidates.map(candidate => ({
        san: candidate.san,
        probability: candidate.probability,
        dropped: !candidate.include
      }))
    });
    const expectedOpponentSource: ExpectedOpponentSource = {
      id: canonicalSourceNode.id,
      repertoireId: canonicalSourceNode.repertoireId,
      fullFen: canonicalSourceNode.fullFen,
      positionKey: canonicalSourceNode.positionKey,
      displayPgn: canonicalSourceNode.displayPgn,
      routeProb: canonicalSourceNode.routeProb,
      cumProb: canonicalSourceNode.cumProb
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
        visitedNodes.delete(invalidNode.id);
        queue.push({
          nodeId: invalidNode.id,
          fen: invalidNode.fullFen,
          currentMoveNumber: fullmoveNumberFromFullFen(invalidNode.fullFen),
          cumProb: invalidNode.cumProb,
          history: historyFromCanonicalPgn(invalidNode.displayPgn)
          ,uciHistory: historyFromCanonicalPgn(invalidNode.history)
        });
      }
    }
    const reconciledOpponentByUci = new Map(
      opponentReconciliation.branches.map(branch => [branch.uci, branch] as const)
    );
    // EX.05: the Amateur shortfall stays on this node, since the missing games have no child to hold them.
    if (rawAmateurMoveCount > 0) {
      await prisma.repertoireNode.update({
        where: { id: canonicalSourceNode.id },
        data: { unaccountedDropped: canonicalSourceNode.cumProb * amateur.unaccountedShare }
      });
    }

    const passedWhiteMoveCount = whiteCandidates.filter(candidate => candidate.include).length;
    if (passedWhiteMoveCount === 0) {
        const tempChess = new Chess(node.fen);
        if (!tempChess.isGameOver() && rawAmateurMoveCount === 0) {
            console.log("No opponent moves found."); // EX.06
            // S3.14: the Black move that reached this position ends the route. The root has none.
            await prisma.repertoireMove.updateMany({
              where: { toNodeId: node.nodeId, playerTurn: "RESPONSE" },
              data: { stopReason: NO_OPPONENT_MOVES_ENDING }
            });
            totalMissingWhiteMoves++;
        } else if (!tempChess.isGameOver()) {
            console.warn("[WARNING] All opponent moves were filtered away."); // HM.08
        }
    } else {
        console.log(`Found ${passedWhiteMoveCount} White moves to process.`);
    }
    totalWhiteMovesFound += passedWhiteMoveCount;
    if (passedWhiteMoveCount === 0) {
      console.log(`[QUEUE] Nothing enqueued: no retained White moves; waiting=${queue.length}`);
    }

    // HM.06: the least popular move is handled first, so it is pushed first and taken last (S3.09).
    for (let candidateIndex = whiteCandidates.length - 1; candidateIndex >= 0; candidateIndex--) {
      const whiteMove = whiteCandidates[candidateIndex];
      const canonicalWhiteMove = canonicalOpponentCandidates[candidateIndex];
      const reconciledOpponent = reconciledOpponentByUci.get(canonicalWhiteMove.uci);
      if (!reconciledOpponent) throw new Error(`Reconciled OPPONENT branch ${canonicalWhiteMove.uci} is missing`);
      if (reconciledOpponent.ending) {
        // HM.24, HM.29, HM.33: the move keeps its node but gets no Black reply. DB.06 rule 4 names it.
        const endingNodeId = reconciledOpponent.destinationNodeId!;
        await ensureNodeOpeningMetadata(endingNodeId, rebuildOpeningMetadataCache, "NOT_FETCHED", fetchOpeningMetadata);
        const endingRoute = canonicalWhiteMove.destinationPgn;
        if (reconciledOpponent.ending === "Too rare") {
          const { rareDropped } = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: endingNodeId } });
          console.log(`[TOO RARE] route=${endingRoute}; rareDropped=${(rareDropped * 100).toFixed(3)}%`);
        } else if (reconciledOpponent.ending === "Game over") {
          console.log(`[GAME OVER] route=${endingRoute}; cumProb=${(reconciledOpponent.effectiveCumProb * 100).toFixed(3)}%`);
        } else {
          console.log(`[REPETITION] route=${endingRoute}; repeated=${reconciledOpponent.repeatedPgn || "(root)"}; cumProb=${(reconciledOpponent.effectiveCumProb * 100).toFixed(3)}%`);
          totalRepetitionStops++;
        }
        continue;
      }
      if (reconciledOpponent.isTransposition) {
        // TR.08: no Black reply and no card. TR.09 - TR.19: the cascade. TR.50: next White move.
        const pointer = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: reconciledOpponent.destinationNodeId! } });
        const owner = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: reconciledOpponent.ownerNodeId! } });
        await ensureNodeOpeningMetadata(pointer.id, rebuildOpeningMetadataCache, "NOT_FETCHED", fetchOpeningMetadata);
        totalTranspositions++;
        console.log(`[TRANSPOSITION] route=${canonicalWhiteMove.destinationPgn}; owner=${owner.displayPgn}; cumProb=${(pointer.cumProb * 100).toFixed(3)}%`);
        await runCascade({ repertoireId: repertoire.id, pointerId: pointer.id, ownerId: owner.id, run: cascadeRun, config: runtime.config });
        continue;
      }
      console.log(`\nEvaluating White Move: ${whiteMove.san} (Reason: ${whiteMove.reason}, Prob: ${whiteMove.probability ? (whiteMove.probability*100).toFixed(1) : 0}%)`);
      const resultingProbability = canonicalWhiteMove.routeProb;
      const resultingBand = getProbabilityBand(resultingProbability, runtime.config);
      const resultingBudget = runtime.config.depthBudget[resultingBand];
      console.log(`[BRANCH PROBABILITY] route probability before White move=${(canonicalSourceNode.cumProb * 100).toFixed(3)}%; White move share at this position=${(whiteMove.probability * 100).toFixed(3)}%; resulting route probability=${(resultingProbability * 100).toFixed(3)}%; band=${resultingBand}; dynamic budget=${resultingBudget} full moves; depthCap=${runtime.config.depthCap}; effective depth limit=${Math.min(resultingBudget, runtime.config.depthCap)}.`);
      const newPgn = canonicalWhiteMove.destinationPgn;
      if (reconciledOpponent.destinationNodeId === null) {
        throw new Error("OPPONENT branch is missing its destination");
      }
      const posAfterWhiteNode = await prisma.repertoireNode.findUnique({
        where: { id: reconciledOpponent.destinationNodeId }
      });
      if (!posAfterWhiteNode || posAfterWhiteNode.repertoireId !== repertoire.id) {
        throw new Error("Reconciled OPPONENT destination disappeared or changed repertoire");
      }
      await restoreRebuildWikibooksState(posAfterWhiteNode.id, rebuildWikibooksCache);
      // HM.N.01: Black's reply starts with this node's cumProb, including any cascade that reached it since.
      const effectiveCanonicalProb = posAfterWhiteNode.cumProb;

      const canonicalSelection = await evaluateCanonicalResponse({
          responseNode: posAfterWhiteNode,
          routePgn: newPgn,
          evaluator: dependencies.responseEvaluator
      });
      const algoResult = canonicalSelection.result;
      // DB.06 rule 4: EW does not ask Explorer, so a position with Black to move is fetched for the name only.
      await ensureNodeOpeningMetadata(posAfterWhiteNode.id, rebuildOpeningMetadataCache, "NOT_FETCHED", fetchOpeningMetadata);
      await attemptCanonicalNodeWikibooks(posAfterWhiteNode.id, wikibooksAttemptedNodeIds, ensureNodeWikibooks);

      totalBlackMovesEvaluated++;
      if (algoResult.cp === null) {
          totalNaEvals++;
      }

      const evalText = algoResult.cp !== null ? (algoResult.cp / 100).toFixed(2) : 'M' + Math.abs(algoResult.mate!);
      console.log(`Black responds with: ${algoResult.selectedMoveSan} -> ${algoResult.selectionMethod} | ${algoResult.source} Eval: ${evalText}`);
      const explanation = `${algoResult.selectionMethod} | Eval: ${evalText}`;

      const selectedDestinationFen = canonicalSelection.selectedDestinationFullFen;
      const selectedHistory = [...canonicalSelection.canonicalHistory, canonicalSelection.selectedSan];
      const blackPgn = selectedHistory.join(" ");
      const blackHistory = [...(node.uciHistory ?? historyFromCanonicalPgn(canonicalSourceNode.history)), canonicalWhiteMove.uci, algoResult.selectedUci].join(" ");

      let responseId: string;
      let resultingDestinationId: string | null;
      let resultingDestinationFen: string | null = selectedDestinationFen;
      let resultingDestinationPgn: string | null = blackPgn;
      let resultingDestinationHistory: string | null = blackHistory;

      // Black's reply never stops on a repetition or transposition: it always lands on
      // this route's own node and goes on to the queue. If the position repeats, the
      // White moves from it are caught by HM.30 and HM.34, so no card is duplicated.
      let posAfterBlackNode = await getRepertoireNode(repertoire.id, blackHistory);
      if (!posAfterBlackNode) {
          // HM.06: routeProb follows the route only (x 100% for Black's reply); cumProb carries any cascade.
          posAfterBlackNode = await createRepertoireNode(repertoire.id, selectedDestinationFen, blackHistory, posAfterWhiteNode.routeProb, {
            displayPgn: blackPgn,
            siblingIndex: 0,
            cumProb: effectiveCanonicalProb
          });
      } else {
          await prisma.repertoireNode.update({
              where: { id: posAfterBlackNode.id },
              data: { cumProb: Math.max(posAfterBlackNode.cumProb, effectiveCanonicalProb) }
          });
      }

      resultingDestinationId = posAfterBlackNode.id;
      resultingDestinationFen = posAfterBlackNode.fullFen;
      resultingDestinationPgn = posAfterBlackNode.displayPgn;
      resultingDestinationHistory = posAfterBlackNode.history;

      const createdResponse = await createResponseMove({
          fromNodeId: posAfterWhiteNode.id,
          toNodeId: posAfterBlackNode.id,
          uci: algoResult.selectedUci,
          san: algoResult.selectedMoveSan,
          cp: algoResult.cp,
          mate: algoResult.mate,
          source: algoResult.source,
          selectionMethod: algoResult.selectionMethod,
          moveOrigin: algoResult.moveOrigin,
          engineRank: algoResult.engineRank
      });
      responseId = createdResponse.id;

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

      if (!resultingDestinationId || !resultingDestinationFen || resultingDestinationPgn === null || resultingDestinationHistory === null) {
        throw new Error("RESPONSE is missing its destination");
      }
      await restoreRebuildWikibooksState(resultingDestinationId, rebuildWikibooksCache);
      await attemptCanonicalNodeWikibooks(resultingDestinationId, wikibooksAttemptedNodeIds, ensureNodeWikibooks);

      // RE.02 - RE.10: the position after Black's move. RE.05: its cumProb stays as it is.
      const ending = responseEnding({
          fullFen: resultingDestinationFen,
          cumProb: effectiveCanonicalProb,
          config: runtime.config
      });
      if (ending) {
          await prisma.repertoireMove.update({ where: { id: responseId }, data: { stopReason: ending } });
          // DB.06 rule 4: the node is never dequeued, so it is named here.
          await ensureNodeOpeningMetadata(resultingDestinationId, rebuildOpeningMetadataCache, "NOT_FETCHED", fetchOpeningMetadata);
          const tag = ending === "Game over on Black's move" ? "[GAME OVER]" : "[DEPTH BUDGET REACHED]";
          console.log(`${tag} route=${resultingDestinationPgn}; cumProb=${(effectiveCanonicalProb * 100).toFixed(3)}%`);
          if (ending === "Depth budget reached on Black's move") totalBranchesAborted++;
          continue;
      }

      // RE.09. Its opening metadata is set when it is dequeued, after the Explorer fetch (DB.06 rule 1).
      const continuationItem = buildCanonicalContinuationQueueItem({
          destinationNode: {
              id: resultingDestinationId,
              fullFen: resultingDestinationFen,
              displayPgn: resultingDestinationPgn
              ,history: resultingDestinationHistory
          },
          cumProb: effectiveCanonicalProb
      });
      enqueueCanonicalContinuation({
          queue,
          pendingByResponseSource: pendingCanonicalContinuations,
          responseSourceNodeId: posAfterWhiteNode.id,
          item: continuationItem
      });
      console.log(`[QUEUE] Enqueued: ${continuationItem.history.join(" ") || "(root)"}; waiting=${queue.length}`);
      console.log("[QUEUE CONTENTS]");
      logQueueContents();

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
  const rareDroppedMovesTotal = await countRareDroppedMoves(repertoire.id);

  // S3.10
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
  console.log(`Rare Dropped Moves Total: ${rareDroppedMovesTotal}`);
  console.log("========================================================\n");

  // S3.11 - S3.15
  const failures = await endOfRunFailures({
    repertoireId: repertoire.id,
    tinyDroppedTotal: cascadeRun.tinyDroppedTotal,
    config: runtime.config
  });
  if (failures.length > 0) throw new Error(`End-of-run checks failed:\n${failures.join("\n")}`);

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
    tinyDroppedTotal: cascadeRun.tinyDroppedTotal,
    rareDroppedMovesTotal,
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
