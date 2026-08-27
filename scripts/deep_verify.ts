import { acquireLock, type LockHandle } from "../src/lib/core/lockfile";
import { runDeepVerification } from "../src/lib/core/deep-verification";
import { applyApprovedDeepCorrection } from "../src/lib/core/rm-correction";
import { prisma } from "../src/lib/db/operations";
import * as readline from "readline/promises";

export async function main(args = process.argv.slice(2), testPrompter?: () => Promise<boolean>, lockOwner = "deep-verify") {
  const repertoireId = args.find(a => !a.startsWith("--"));
  const autoApprove = args.includes("--approve");

  if (!repertoireId) throw new Error("Usage: npx tsx scripts/deep_verify.ts <repertoireId> [--approve]");

  let lock: LockHandle | null = null;
  try {
    lock = acquireLock(lockOwner);
    const result = await runDeepVerification(repertoireId);

    if (result.status === "COMPLETE") {
      console.log(`Deep Verification complete: ${result.verifiedCount} RESPONSE(s) verified.`);
    } else {
      console.log(`Deep Verification stopped at ${result.failed.san} (${result.failed.uci}).`);
      console.log("Proposed correction:", result.proposal);

      let approved = false;
      if (autoApprove) {
        console.log("Auto-approved via --approve flag.");
        approved = true;
      } else if (testPrompter) {
        approved = await testPrompter();
      } else {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question("Apply this correction? [y/N] ");
        rl.close();
        if (answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes") {
          approved = true;
        }
      }

      if (approved) {
        const correctionResult = await applyApprovedDeepCorrection({
          repertoireId,
          failed: {
            responseId: result.failed.responseId,
            uci: result.failed.uci,
            fullFen: result.failed.fullFen,
            cp: result.failed.cp,
            mate: result.failed.mate,
            source: result.failed.source
          , fromNodeId: result.failed.fromNodeId, toNodeId: result.failed.toNodeId },
          proposal: result.proposal
        });
        console.log(`Correction applied. Removed ${correctionResult.removedNodeCount} nodes and ${correctionResult.removedMoveCount} moves. Created replacement ${correctionResult.replacementUci}.`);
      } else {
        console.log("Correction not applied.");
      }
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
