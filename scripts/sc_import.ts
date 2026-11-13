// SC.52, SC.53: reads the friend's exchange file and adds the evals not yet cached here.
// Checks the whole file first; writes all of it or nothing. Run: npx tsx scripts/sc_import.ts <file>
import fs from "node:fs";
import { prisma } from "../src/lib/db/operations";
import { importSharedEvals, parseExchangeFile } from "../src/lib/core/shared-cache";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Give the file to import: npx tsx scripts/sc_import.ts <file>");
  const evals = parseExchangeFile(fs.readFileSync(filePath, "utf8"));
  const result = await importSharedEvals(prisma, evals);
  console.log(`"[FINISHED] ${evals.length} evals in the file: ${result.added} added, ${result.alreadyCached} already cached and equal."`);
}

main().catch(error => {
  console.error(`"[FAILED] ${error.message}"`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
