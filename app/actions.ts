"use server";

import { PrismaClient } from "@prisma/client";
import { Chess } from "chess.js";
import { fsrs, createEmptyCard, Rating, Card, State } from "ts-fsrs";

const prisma = new PrismaClient();
const f = fsrs(); // Initialize FSRS algorithm

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
      due: { lte: new Date() }
    },
    include: {
      position: true,
      targetMove: true,
      repertoire: true
    },
    orderBy: { due: "asc" },
    take: 20
  });

  if (stats.length === 0) {
    return [];
  }

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
  // FSRS expects Rating enums: 1=Again, 2=Hard, 3=Good, 4=Easy
  const fsrsRatingMap = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
  const fsrsRating = fsrsRatingMap[quality];

  const stat = await prisma.repertoirePositionStat.findUnique({ where: { id: statId } });
  if (!stat) return;

  // Build the TS-FSRS Card from database state
  const currentCard: Card = {
    due: stat.due,
    stability: stat.stability,
    difficulty: stat.difficulty,
    elapsed_days: stat.elapsed_days,
    scheduled_days: stat.scheduled_days,
    reps: stat.reps,
    lapses: stat.lapses,
    state: stat.state as State,
    last_review: stat.last_review || undefined
  };

  // Run the algorithm
  const now = new Date();
  const schedulingInfo = f.repeat(currentCard, now);
  
  // Extract the specific result based on the rating the user provided
  const recordLog = schedulingInfo[fsrsRating];
  const newCard = recordLog.card;

  const updatedStat = await prisma.repertoirePositionStat.update({
    where: { id: statId },
    data: {
      due: newCard.due,
      stability: newCard.stability,
      difficulty: newCard.difficulty,
      elapsed_days: newCard.elapsed_days,
      scheduled_days: newCard.scheduled_days,
      reps: newCard.reps,
      lapses: newCard.lapses,
      state: newCard.state,
      last_review: newCard.last_review
    }
  });

  // Log FSRS state transition for debugging
  try {
    const fs = require("fs");
    const path = require("path");
    const logLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      statId,
      quality,
      fsrsRating,
      old_stability: currentCard.stability,
      new_stability: newCard.stability,
      old_difficulty: currentCard.difficulty,
      new_difficulty: newCard.difficulty,
      old_state: currentCard.state,
      new_state: newCard.state,
      old_due: currentCard.due,
      new_due: newCard.due
    }) + "\n";
    fs.appendFileSync(path.join(process.cwd(), "srs.log"), logLine, "utf-8");
  } catch (err) {
    console.error("Failed to write to srs.log", err);
  }

  return updatedStat;
}

