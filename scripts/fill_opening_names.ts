// DB.06: name every node whose opening name is missing (no status), e.g. after a
// stopped run or a failed Explorer request. Takes the generator's lock, so it never
// runs beside a generation.
import fs from "node:fs";
import * as dotenv from "dotenv";

if (fs.existsSync("C:\\Files\\.env")) {
  dotenv.config({ path: "C:\\Files\\.env" });
} else {
  dotenv.config();
}

import { fillMissingOpeningMetadata } from "../src/lib/core/generator";
import { prisma } from "../src/lib/db/operations";
import { acquireLock } from "../src/lib/core/lockfile";

async function main() {
  const lock = acquireLock("fill-opening-names");
  try {
    for (const repertoire of await prisma.repertoire.findMany({ select: { id: true, title: true } })) {
      const named = await fillMissingOpeningMetadata(repertoire.id);
      console.log(`${repertoire.title}: named ${named} nodes with a missing opening name.`);
    }
  } finally {
    lock.release();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
