import { PrismaClient } from "@prisma/client";
import { createEmptyCard } from "ts-fsrs";
const prisma = new PrismaClient();

// Every card back to a new FSRS card, as the generator creates them.
async function main() {
  const empty = createEmptyCard();
  await prisma.repertoirePositionStat.updateMany({
    data: {
      due: new Date(),
      stability: empty.stability,
      difficulty: empty.difficulty,
      elapsed_days: empty.elapsed_days,
      scheduled_days: empty.scheduled_days,
      reps: empty.reps,
      lapses: empty.lapses,
      state: empty.state,
      last_review: null
    }
  });
  console.log("All SRS stats have been reset to factory defaults.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
