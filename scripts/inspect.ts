import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const positions = await prisma.position.findMany();
  console.log("Positions:");
  positions.forEach(p => console.log(`ID: "${p.id}", FEN: "${p.fen}"`));
  
  const moves = await prisma.move.findMany();
  console.log("\nMoves:");
  moves.forEach(m => console.log(`ID: "${m.id}", SAN: "${m.san}", From: "${m.fromPositionId}", To: "${m.toPositionId}"`));
}

main().finally(() => prisma.$disconnect());
