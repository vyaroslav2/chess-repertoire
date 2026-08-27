import { acquireLock, type LockHandle } from "../src/lib/core/lockfile";
import { runDeepVerification } from "../src/lib/core/deep-verification";
import { prisma } from "../src/lib/db/operations";

export async function main(args = process.argv.slice(2)) {
  const repertoireId = args[0];
  if (!repertoireId) throw new Error("Usage: npx tsx scripts/deep_verify.ts <repertoireId>");
  let lock: LockHandle | null = null;
  try {
    lock = acquireLock();
    const result = await runDeepVerification(repertoireId);
    if (result.status === "COMPLETE") console.log(`Deep Verification complete: ${result.verifiedCount} RESPONSE(s) verified.`);
    else {
      console.log(`Deep Verification stopped at ${result.failed.san} (${result.failed.uci}).`);
      console.log("Proposed correction:", result.proposal);
    }
    return result;
  } finally {
    if (lock) lock.release();
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch(error => {
  console.error("Deep Verification failed:", error);
  process.exitCode = 1;
});
