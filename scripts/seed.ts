import { PrismaClient } from "@prisma/client";
import { Chess } from "chess.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning database...");
  await prisma.repertoirePositionStat.deleteMany();
  await prisma.move.deleteMany();
  await prisma.position.deleteMany();
  await prisma.repertoire.deleteMany();
  await prisma.user.deleteMany();

  console.log("Creating user and repertoire...");
  const user = await prisma.user.create({
    data: {
      username: "Yaroslav",
    },
  });

  const repertoire = await prisma.repertoire.create({
    data: {
      title: "Caro-Kann Defense (Black)",
      color: "black",
      userId: user.id,
    },
  });

  console.log("Simulating sequence: 1. e4 c6 2. d4 d5");
  const chess = new Chess();
  const movesToPlay = ["e4", "c6", "d4", "d5"];

  let currentPosId: string | null = null;

  // Insert the initial position (empty board)
  const initialFen = chess.fen().split(" ").slice(0, 4).join(" "); // Strip move counters for uniqueness
  const startPos = await prisma.position.create({
    data: { fen: initialFen },
  });
  currentPosId = startPos.id;

  for (const sanMove of movesToPlay) {
    const moveResult = chess.move(sanMove);
    const newFen = chess.fen().split(" ").slice(0, 4).join(" ");

    // Check if resulting position exists (transpositions)
    let newPos = await prisma.position.findUnique({
      where: { fen: newFen },
    });

    if (!newPos) {
      newPos = await prisma.position.create({
        data: { fen: newFen },
      });
    }

    // Create the move (the branch)
    const move = await prisma.move.create({
      data: {
        san: moveResult.san,
        fromPositionId: currentPosId!,
        toPositionId: newPos.id,
      },
    });

    // If it's black's turn to move from `currentPosId`, we need to memorize this response!
    // Since Yaroslav is playing black, he needs to remember to play 'c6' against 'e4'.
    // `currentPosId` FEN after 'e4' is black's turn. 
    if (moveResult.color === "b") { // Black just moved, meaning they chose to play this
      await prisma.repertoirePositionStat.create({
        data: {
          repertoireId: repertoire.id,
          positionId: currentPosId!,
          targetMoveId: move.id,
        },
      });
    }

    currentPosId = newPos.id;
  }

  console.log("Database seeded successfully!");
  
  const stats = await prisma.repertoirePositionStat.findMany({
    include: {
      position: true,
      targetMove: true
    }
  });
  
  console.log("\n--- SRS Training Cards Generated ---");
  for (const stat of stats) {
    console.log(`When the board is: ${stat.position.fen}`);
    console.log(`You must play: ${stat.targetMove.san}\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
