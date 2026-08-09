"use server";

import { PrismaClient } from "@prisma/client";
import { Chess } from "chess.js";

const prisma = new PrismaClient();

export async function getDatabaseRepertoire() {
  // const repertoires = await prisma.repertoire.findMany();
  
  const dummy = new Chess();
  // Generate ~160 valid moves by bouncing knights and pushing a pawn to avoid 50-move rule
  for (let i = 0; i < 20; i++) { dummy.move("Nf3"); dummy.move("Nf6"); dummy.move("Ng1"); dummy.move("Ng8"); }
  dummy.move("h3"); dummy.move("h6");
  for (let i = 0; i < 20; i++) { dummy.move("Nf3"); dummy.move("Nf6"); dummy.move("Ng1"); dummy.move("Ng8"); }
  dummy.move("a3"); dummy.move("a6");
  for (let i = 0; i < 20; i++) { dummy.move("Nf3"); dummy.move("Nf6"); dummy.move("Ng1"); dummy.move("Ng8"); }
  dummy.move("b3"); dummy.move("b6");
  for (let i = 0; i < 20; i++) { dummy.move("Nf3"); dummy.move("Nf6"); dummy.move("Ng1"); dummy.move("Ng8"); }

  return [
    {
      id: "empty",
      opening: "Dummy 160 moves for testing",
      pgn: dummy.pgn(),
    }
  ];
}

export async function fetchDuePositions(repertoireId: string) {
  const stats = await prisma.repertoirePositionStat.findMany({
    where: {
      repertoireId,
      dueDate: { lte: new Date() }
    },
    include: {
      position: true,
      targetMove: true,
      repertoire: true
    },
    orderBy: { dueDate: "asc" }
  });

  if (stats.length === 0) {
    // Generate mock stats for testing the UI
    return [
      {
        id: "mock1",
        repertoireId: "mockRep",
        positionId: "pos1",
        targetMoveId: "move1",
        repertoire: { title: "Ruy Lopez (Mock)", color: "white" },
        position: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
        targetMove: { san: "e4" },
        lineMoves: []
      },
      {
        id: "mock2",
        repertoireId: "mockRep",
        positionId: "pos2",
        targetMoveId: "move2",
        repertoire: { title: "Ruy Lopez (Mock)", color: "white" },
        position: { fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" },
        targetMove: { san: "Nf3" },
        lineMoves: ["e4", "e5"]
      },
      {
        id: "mock3",
        repertoireId: "mockRep",
        positionId: "pos3",
        targetMoveId: "move3",
        repertoire: { title: "Ruy Lopez (Mock)", color: "white" },
        position: { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3" },
        targetMove: { san: "Bb5" },
        lineMoves: ["e4", "e5", "Nf3", "Nc6"]
      }
    ];
  }

  // Attach full line history to each stat

  // Attach full line history to each stat
  const enrichedStats = await Promise.all(stats.map(async (stat) => {
    const lineMoves = [];
    let currPosId = stat.positionId;
    while (true) {
      const incoming = await prisma.move.findFirst({
        where: { toPositionId: currPosId }
      });
      if (incoming) {
        lineMoves.unshift(incoming.san);
        currPosId = incoming.fromPositionId;
      } else {
        break;
      }
    }
    return { ...stat, lineMoves };
  }));

  return enrichedStats;
}

export async function updateSrsStats(statId: string, quality: number) {
  // quality: 0 (Again), 1 (Hard), 2 (Good), 3 (Easy)
  const stat = await prisma.repertoirePositionStat.findUnique({ where: { id: statId } });
  if (!stat) return;

  // Convert our 0-3 scale to standard SM-2 0-5 scale
  const qMap = [0, 2, 4, 5];
  const q = qMap[quality];

  let newInterval = stat.interval;
  let newEase = stat.easeFactor;

  if (q < 3) {
    // Failed
    newInterval = 0;
  } else {
    if (stat.interval === 0) newInterval = 1;
    else if (stat.interval === 1) newInterval = 6;
    else newInterval = Math.round(stat.interval * stat.easeFactor);
  }

  // Update ease factor
  newEase = newEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (newEase < 1.3) newEase = 1.3;

  const newDueDate = new Date();
  if (newInterval > 0) {
    newDueDate.setDate(newDueDate.getDate() + newInterval);
  } else {
    // Review again in 5 minutes
    newDueDate.setMinutes(newDueDate.getMinutes() + 5);
  }

  return prisma.repertoirePositionStat.update({
    where: { id: statId },
    data: {
      interval: newInterval,
      easeFactor: newEase,
      dueDate: newDueDate
    }
  });
}

