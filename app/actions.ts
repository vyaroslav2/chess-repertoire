"use server";

import { PrismaClient } from "@prisma/client";
import { Chess } from "chess.js";

const prisma = new PrismaClient();

export async function getDatabaseRepertoire() {
  const repertoires = await prisma.repertoire.findMany();
  
  if (repertoires.length === 0) {
    return [
      {
        id: "empty",
        opening: "No repertoire found in DB",
        pgn: "",
      }
    ];
  }

  // Start building the PGN from the initial empty board FEN
  const chess = new Chess();
  const initialFen = chess.fen().split(" ").slice(0, 4).join(" ");
  
  let currentPosition = await prisma.position.findUnique({
    where: { fen: initialFen }
  });

  if (!currentPosition) {
    return [
      {
        id: repertoires[0].id,
        opening: repertoires[0].title,
        pgn: "",
      }
    ];
  }

  // Walk down the tree of moves to reconstruct the PGN
  while (true) {
    const outgoingMoves = await prisma.move.findMany({
      where: { fromPositionId: currentPosition.id }
    });

    if (outgoingMoves.length === 0) {
      break; // End of the line
    }

    // For testing, we just pick the first variation if multiple exist
    const nextMove = outgoingMoves[0];
    
    try {
      chess.move(nextMove.san);
    } catch (e) {
      console.error("Invalid move in DB", nextMove.san);
      break;
    }

    currentPosition = await prisma.position.findUnique({
      where: { id: nextMove.toPositionId }
    });

    if (!currentPosition) break;
  }

  return [
    {
      id: repertoires[0].id,
      opening: repertoires[0].title + " (From DB)",
      pgn: chess.pgn(),
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
  return stats;
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

