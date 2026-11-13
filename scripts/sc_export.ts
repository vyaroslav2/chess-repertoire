// SC.51, SC.56: writes every deep eval to exports/evals-YYYY-MM-DD.json, for the friend.
// Reads the database only. Run: npx tsx scripts/sc_export.ts
// Option: --out <path> writes there instead. The generator also does this after each run (SC.58).
import path from "node:path";
import { prisma } from "../src/lib/db/operations";
import { defaultExportPath, writeSharedEvalExport } from "../src/lib/core/shared-cache";

const PROJECT_ROOT = path.resolve(__dirname, "..");

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  if (outIndex !== -1 && !args[outIndex + 1]) throw new Error("--out needs a path");
  const outPath = outIndex === -1 ? defaultExportPath(PROJECT_ROOT) : path.resolve(args[outIndex + 1]);

  const count = await writeSharedEvalExport(prisma, outPath);
  console.log(`"[FINISHED] ${count} evals written to ${outPath}"`);
}

main().catch(error => {
  console.error(`"[FAILED] ${error.message}"`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
