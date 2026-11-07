// AK.02: makes the Anki deck from the repertoire, through AnkiConnect: one card
// per whole line. Reads the database only. Run: npx tsx scripts/anki_export.ts
// Options: --limit 10 (cards; default every line), --while-generating (final lines only, AK.17).
import { ankiConfig, ankiConnect, exportLines } from "../src/lib/core/anki-export";
import { prisma } from "../src/lib/db/operations";

const args = process.argv.slice(2);
const limitIndex = args.indexOf("--limit");
const cardLimit = limitIndex === -1 ? Infinity : Number(args[limitIndex + 1]);
if (limitIndex !== -1 && (!Number.isInteger(cardLimit) || cardLimit < 1)) throw new Error("--limit needs a whole number of cards");
const whileGenerating = args.includes("--while-generating");

// loadProfile returns before the switch is done. Anything sent too early lands
// in the old profile, or fails with "collection is not available".
// Loading the profile that is already open stops AnkiConnect, so skip it then.
async function loadProfile() {
  if (await ankiConnect<string>("getActiveProfile") === ankiConfig.profile) return;
  await ankiConnect("loadProfile", { name: ankiConfig.profile });
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if (await ankiConnect<string>("getActiveProfile") === ankiConfig.profile) {
        await ankiConnect("deckNames");
        return;
      }
    } catch {
      // Still loading.
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Profile ${ankiConfig.profile} did not load in 30s`);
}

async function main() {
  // AK.02: a tree being built is wiped and half there; only its final lines may go (AK.17).
  const building = await prisma.repertoire.findFirst({ where: { generationStatus: { not: "IDLE" } } });
  if (building && !whileGenerating) throw new Error(`${building.title} is ${building.generationStatus}; run again once the tree is built`);

  await loadProfile();
  const result = await exportLines({ lines: building ? "final" : "all", limit: cardLimit });
  console.log(`"[FINISHED] ${result.added} cards added to ${ankiConfig.deckName} (profile ${ankiConfig.profile}); ${result.replaced} replaced; ${result.alreadyThere} already there."`);
}

main().catch(error => {
  console.error(`"[FAILED] ${error.message}"`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
