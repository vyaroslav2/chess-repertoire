import { PrismaClient } from "@prisma/client";
import { Chess } from "chess.js";
import * as readline from "readline";
import { parseFullFen, positionKeyFromFen } from "../src/lib/core/fen";

const prisma = new PrismaClient();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};


async function main() {
  console.log("=== Interactive Repertoire Tester ===");
  console.log("Loading your Caro-Kann Defense repertoire...\n");

  const repertoire = await prisma.repertoire.findFirst({
    where: { title: "Caro-Kann Defense (Black)" }
  });

  if (!repertoire) {
    console.error("Repertoire not found! Have you run the generation script yet?");
    process.exit(1);
  }

  const chess = new Chess();
  
  while (true) {
    const fen = chess.fen();
    const posKey = positionKeyFromFen(parseFullFen(fen));
    
    // Find current position in DB
    const position = await prisma.position.findUnique({
      where: { positionKey: posKey }
    });

    if (!position) {
      console.log("\n[!] Reached an unexplored position. End of generated repertoire!");
      break;
    }

    const isBlackTurn = chess.turn() === 'b';

    if (isBlackTurn) {
      // BLACK'S TURN (User)
      const stat = await prisma.repertoirePositionStat.findUnique({
        where: {
          repertoireId_positionId: {
            repertoireId: repertoire.id,
            positionId: position.positionKey
          }
        },
        include: { targetMove: true }
      });

      if (!stat || !stat.targetMove) {
        console.log("\n[!] No AI move generated for this position yet. End of branch!");
        break;
      }

      while (true) {
        const userInput = await question("\nYour move (Black): ");
        const moveSan = userInput.trim();
        
        if (moveSan.toLowerCase() === "exit" || moveSan.toLowerCase() === "quit") {
          console.log("Exiting tester. Great job!");
          process.exit(0);
        }

        if (moveSan === stat.targetMove.san) {
          console.log(`\n✅ Correct! You played: ${stat.targetMove.san}`);
          console.log(`💡 AI Explanation: ${stat.explanation}`);
          chess.move(stat.targetMove.san);
          break; // Break the while loop to continue game
        } else {
          // Check if it's a legal move but not the repertoire move
          try {
            const tempChess = new Chess(chess.fen());
            tempChess.move(moveSan);
            console.log("❌ Incorrect! That is not your repertoire move. Try again.");
          } catch (e) {
            console.log("❌ Invalid chess notation. Use standard algebraic notation (e.g. d5, Nf6). Try again.");
          }
        }
      }

    } else {
      // WHITE'S TURN (Opponent)
      const possibleMoves = await prisma.move.findMany({
        where: { fromPositionId: position.positionKey }
      });

      if (possibleMoves.length === 0) {
        console.log("\n[!] No White moves explored from this position. End of branch!");
        break;
      }

      // Randomly pick one of the generated opponent branches
      const randomMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
      
      console.log(`\nOpponent (White) plays: ${randomMove.san}`);
      chess.move(randomMove.san);
    }
    
    // Add a tiny delay for readability
    await new Promise(res => setTimeout(res, 500));
  }
}

main()
  .catch(console.error)
  .finally(() => {
    rl.close();
    prisma.$disconnect();
  });
