import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.repertoirePositionStat.updateMany({
    data: {
      easeFactor: 2.5,
      interval: 0,
      dueDate: new Date()
    }
  });
  console.log("All SRS stats have been reset to factory defaults.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
