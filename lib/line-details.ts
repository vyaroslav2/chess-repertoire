import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type TargetMove = { toNodeId: string | null; stopReason: string | null; uci: string | null };

// The eval of each move in a line (DB.11), by ply: the move out of the node at
// each history prefix. Null where a move carries none.
export async function lineEvals(repertoireId: string, historyUcis: string[]) {
  const histories = historyUcis.map((_, index) => historyUcis.slice(0, index).join(" "));
  const moves = await prisma.repertoireMove.findMany({
    where: { repertoireId, uci: { in: historyUcis }, fromNode: { history: { in: histories } } },
    select: { uci: true, cp: true, mate: true, fromNode: { select: { history: true } } }
  });
  const byRoute = new Map(moves.map(move => [`${move.fromNode.history}|${move.uci}`, { cp: move.cp, mate: move.mate }]));
  return historyUcis.map((uci, index) => byRoute.get(`${histories[index]}|${uci}`) ?? null);
}

// The opening at each ply of a line, for live move-list browsing (UI.04): the
// start position, each move of the history, then the answer.
export async function lineOpenings(repertoireId: string, history: string, targetMove: TargetMove) {
  const historyUcis = history === "" ? [] : history.split(/\s+/);
  const histories = ["", ...historyUcis.map((_, index) => historyUcis.slice(0, index + 1).join(" "))];
  const historyNodes = await prisma.repertoireNode.findMany({
    where: { repertoireId, history: { in: histories } },
    select: { history: true, eco: true, openingName: true, openingMetadataStatus: true }
  });
  const metadataByHistory = new Map(historyNodes.map(node => [node.history, node]));
  const openingByPly = histories.map(history => metadataByHistory.get(history) ?? null);
  if (targetMove.toNodeId) {
    const destination = await prisma.repertoireNode.findUnique({
      where: { id: targetMove.toNodeId },
      select: { history: true, eco: true, openingName: true, openingMetadataStatus: true }
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
      openingMetadataStatus: terminal.status
    } : null);
  }
  return openingByPly;
}
