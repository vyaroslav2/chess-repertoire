import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const stats = await prisma.repertoirePositionStat.findMany({
    include: {
      position: true,
      targetMove: true
    }
  });

  let lines: string[][] = [];

  for (const s of stats) {
    const lineMoves = [];
    let currPosId = s.positionId;
    const visited = new Set<string>();
    visited.add(currPosId);

    while (true) {
      const incoming = await prisma.move.findFirst({
        where: { toPositionId: currPosId }
      });
      if (incoming) {
        lineMoves.unshift(incoming.san);
        currPosId = incoming.fromPositionId;
        if (visited.has(currPosId)) {
          console.warn("CYCLE DETECTED!", currPosId);
          break;
        }
        visited.add(currPosId);
      } else {
        break;
      }
    }
    
    // Check if it starts with the Advance Variation moves
    const fullLine = [...lineMoves, s.targetMove.san];
    if (fullLine[0] === "e4" && fullLine[1] === "c6" && fullLine[2] === "d4" && fullLine[3] === "d5" && fullLine[4] === "e5") {
      lines.push(fullLine);
    }
  }

  // Sort by length descending
  lines.sort((a, b) => b.length - a.length);

  console.log("Advance Caro-Kann lines found:");
  for (const l of lines) {
    console.log(l.join(" "));
  }
}

main().finally(() => prisma.$disconnect());
