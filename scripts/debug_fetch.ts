import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const rep = await prisma.repertoire.findFirst();
  if (!rep) return console.log("No rep");

  const stats = await prisma.repertoirePositionStat.findMany({
    where: {
      repertoireId: rep.id,
      due: { lte: new Date() }
    },
    include: {
      position: true,
      targetMove: true,
      repertoire: true
    },
    orderBy: { due: "asc" },
    take: 5
  });

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

  for (const s of enrichedStats) {
    console.log(`Stat ID: ${s.id}`);
    console.log(`Line: ${s.lineMoves.join(" ")}`);
    console.log(`Target: ${s.targetMove.san}`);
    console.log(`Explanation: ${s.explanation}`);
    console.log("-------------------");
  }
}

main().finally(() => prisma.$disconnect());
