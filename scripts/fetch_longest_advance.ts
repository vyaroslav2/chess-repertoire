import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const stats = await prisma.repertoirePositionStat.findMany({
    include: {
      position: true,
      targetMove: true
    }
  });

  let longestLine: string[] = [];

  for (const s of stats) {
    const lineMoves = [];
    let currPosId = s.positionId;
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
    
    // Check if it's the Advance Variation
    if (lineMoves.slice(0, 5).join(" ") === "e4 c6 d4 d5 e5") {
      const fullLine = [...lineMoves, s.targetMove.san];
      if (fullLine.length > longestLine.length) {
        longestLine = fullLine;
      }
    }
  }

  console.log("Longest Advance Caro-Kann line found in DB:");
  console.log(longestLine.join(" "));
}

main().finally(() => prisma.$disconnect());
