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
