import { Chess } from "chess.js";
import { createPrismaClient } from "../src/lib/db/client";
import { computeLocalEngineEvaluationProfile, defaultConfig } from "../src/lib/core/config";

const prisma = createPrismaClient();

// UI.41: the evals the generator wrote, under today's settings (DB.32).
const engineProfile = computeLocalEngineEvaluationProfile(defaultConfig);

// A move's SAN from its UCI, or null if it isn't legal there.
function sanOf(fullFen: string, uci: string) {
  try {
    return new Chess(fullFen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return null;
  }
}

// UI.41: Stockfish's top move in each position, as SAN, from the engine cache. None where the
// position has no search: the start position, so White's first move has none.
async function bestMoves(fullFens: string[]) {
  const caches = await prisma.engineCache.findMany({
    where: { engine: "LOCAL", engineProfile, fullFen: { in: fullFens } },
    select: { fullFen: true, evaluations: { where: { rank: 1 }, select: { uci: true, san: true } } }
  });
  const best = new Map<string, string>();
  for (const cache of caches) {
    const top = cache.evaluations[0];
    const san = top && (top.san ?? sanOf(cache.fullFen, top.uci));
    if (san) best.set(cache.fullFen, san);
  }
  return best;
}

type StoredEval = { cp: number | null; mate: number | null; depth: number | null; selectionMethod: string | null };

// A move's eval for the move list (DB.11): with its depth (UI.38), "!?" on a human-evidence
// switch, and Stockfish's top move in the position before it (UI.41).
function moveEval(move: StoredEval, best: string | null) {
  return {
    cp: move.cp,
    mate: move.mate,
    depth: move.depth,
    glyph: move.selectionMethod === "Human evidence" ? ("!?" as const) : null,
    best,
  };
}

// The card's answer, as moveEval: `fullFen` is the position it is played from.
export async function answerEval(fullFen: string, move: StoredEval) {
  return moveEval(move, (await bestMoves([fullFen])).get(fullFen) ?? null);
}

type TargetMove = { toNodeId: string | null; stopReason: string | null; uci: string | null };

// The eval of each move in a line, as moveEval, by ply: the move out of the node at each
// history prefix. Null where a move carries none.
export async function lineEvals(repertoireId: string, historyUcis: string[]) {
  const histories = historyUcis.map((_, index) => historyUcis.slice(0, index).join(" "));
  const moves = await prisma.repertoireMove.findMany({
    where: { repertoireId, uci: { in: historyUcis }, fromNode: { history: { in: histories } } },
    select: { uci: true, cp: true, mate: true, depth: true, selectionMethod: true, fromNode: { select: { history: true, fullFen: true } } }
  });
  const best = await bestMoves(moves.map(move => move.fromNode.fullFen));
  const byRoute = new Map(moves.map(move => [`${move.fromNode.history}|${move.uci}`, moveEval(move, best.get(move.fromNode.fullFen) ?? null)]));
  return historyUcis.map((uci, index) => byRoute.get(`${histories[index]}|${uci}`) ?? null);
}

// The opening at each ply of a line, for live move-list browsing (UI.04): the
// start position, each move of the history, then the answer. With its cumProb (UI.40).
export async function lineOpenings(repertoireId: string, history: string, targetMove: TargetMove) {
  const historyUcis = history === "" ? [] : history.split(/\s+/);
  const histories = ["", ...historyUcis.map((_, index) => historyUcis.slice(0, index + 1).join(" "))];
  const historyNodes = await prisma.repertoireNode.findMany({
    where: { repertoireId, history: { in: histories } },
    select: { history: true, eco: true, openingName: true, openingMetadataStatus: true, cumProb: true }
  });
  const metadataByHistory = new Map(historyNodes.map(node => [node.history, node]));
  // A repetition's last position is not a node, so it has no cumProb.
  const openingByPly: ({ history: string; eco: string | null; openingName: string | null; openingMetadataStatus: string | null; cumProb: number | null } | null)[] =
    histories.map(history => metadataByHistory.get(history) ?? null);
  if (targetMove.toNodeId) {
    const destination = await prisma.repertoireNode.findUnique({
      where: { id: targetMove.toNodeId },
      select: { history: true, eco: true, openingName: true, openingMetadataStatus: true, cumProb: true }
    });
    openingByPly.push(destination);
  } else if (targetMove.stopReason === "Repetition" && targetMove.uci) {
    const routeHistory = [history, targetMove.uci].filter(Boolean).join(" ");
    const terminal = await prisma.openingMetadataHistoryCache.findUnique({
      where: { repertoireId_history: { repertoireId, history: routeHistory } },
      select: { eco: true, openingName: true, status: true }
    });
    openingByPly.push(terminal ? {
      history: routeHistory,
      eco: terminal.eco,
      openingName: terminal.openingName,
      openingMetadataStatus: terminal.status,
      cumProb: null
    } : null);
  }
  return openingByPly;
}
