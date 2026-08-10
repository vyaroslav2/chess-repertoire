import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const stats = await prisma.repertoirePositionStat.findMany({
    include: {
      position: true,
      targetMove: true
    }
  });

  const allMoves = await prisma.move.findMany();
  
  // Build lookup maps
  // toPositionId -> incoming move (just take the first one, it's a tree most of the time)
  const incomingMoves = new Map<string, any>();
  for (const m of allMoves) {
    if (!incomingMoves.has(m.toPositionId)) {
      incomingMoves.set(m.toPositionId, m);
    }
  }

  let lines: { line: string[], explanation: string }[] = [];

  for (const s of stats) {
    const lineMoves = [];
    let currPosId = s.positionId;
    const visited = new Set<string>();
    visited.add(currPosId);

    while (true) {
      const incoming = incomingMoves.get(currPosId);
      if (incoming) {
        lineMoves.unshift(incoming.san);
        currPosId = incoming.fromPositionId;
        if (visited.has(currPosId)) break;
        visited.add(currPosId);
      } else {
        break;
      }
    }
    
    lines.push({ line: [...lineMoves, s.targetMove.san], explanation: s.explanation || "" });
  }

  const caroLines = lines.filter(l => l.line.join(" ").startsWith("e4 c6 d4 d5 e5"));
  caroLines.sort((a, b) => b.line.length - a.line.length);

  const qgdLines = lines.filter(l => l.line.join(" ").startsWith("d4 d5 c4 e6"));
  qgdLines.sort((a, b) => b.line.length - a.line.length);

  console.log("=== ADVANCE CARO-KANN LINES (DEEPEST) ===");
  for (const l of caroLines.slice(0, 5)) {
    console.log(`Line: ${l.line.join(" ")}`);
    console.log(`Meta: ${l.explanation}\n`);
  }

  console.log("=== QGD LINES (DEEPEST) ===");
  if (qgdLines.length === 0) {
      const d4d5 = lines.filter(l => l.line.join(" ").startsWith("d4 d5"));
      d4d5.sort((a, b) => b.line.length - a.line.length);
      for (const l of d4d5.slice(0, 5)) {
        console.log(`Line: ${l.line.join(" ")}`);
        console.log(`Meta: ${l.explanation}\n`);
      }
  } else {
      for (const l of qgdLines.slice(0, 5)) {
        console.log(`Line: ${l.line.join(" ")}`);
        console.log(`Meta: ${l.explanation}\n`);
      }
  }
}

main().finally(() => prisma.$disconnect());
