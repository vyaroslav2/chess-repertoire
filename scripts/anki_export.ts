// AK.02: makes the Anki deck from the repertoire, through AnkiConnect: one card
// per whole line. Reads the database only. Run: npx tsx scripts/anki_export.ts
// Options: --limit 10 (cards; default every line), --while-generating (AK.02.05).
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

const config = {
  ankiConnectUrl: "http://localhost:8765",
  profile: "User test New",
  deckName: "Chess Repertoire",
  modelName: "Chess Repertoire",
};

// AK.02.05: one-off options for testing.
const args = process.argv.slice(2);
const limitIndex = args.indexOf("--limit");
const cardLimit = limitIndex === -1 ? Infinity : Number(args[limitIndex + 1]);
if (limitIndex !== -1 && (!Number.isInteger(cardLimit) || cardLimit < 1)) throw new Error("--limit needs a whole number of cards");
const whileGenerating = args.includes("--while-generating");

const prisma = new PrismaClient();

async function anki<T>(action: string, params: object = {}): Promise<T> {
  const response = await fetch(config.ankiConnectUrl, {
    method: "POST",
    body: JSON.stringify({ action, version: 6, params }),
  });
  const { result, error } = await response.json();
  if (error) throw new Error(`AnkiConnect ${action}: ${error}`);
  return result;
}

// AK.03: SAN with move numbers. ["e4", "c6", "d4"] --> "1. e4 c6 2. d4"
function numberMoves(sans: string[]) {
  return sans.map((san, ply) => (ply % 2 === 0 ? `${ply / 2 + 1}. ${san}` : san)).join(" ");
}

// The move at this ply on its own: "2... d5" for Black, "3. Nf3" for White.
function numberMove(san: string, ply: number) {
  const moveNumber = Math.floor(ply / 2) + 1;
  return ply % 2 === 0 ? `${moveNumber}. ${san}` : `${moveNumber}... ${san}`;
}

// AK.04
function cardKey(historyUcis: string[], answerUci: string) {
  return createHash("sha1").update([...historyUcis, answerUci].join(" ")).digest("hex");
}

const css = `.card { font-family: arial; font-size: 22px; text-align: center; color: black; background-color: white; }
.opening { font-size: 16px; color: #777; margin-top: 8px; }
.answer { font-size: 28px; font-weight: bold; }`;

async function ensureModel() {
  const modelNames = await anki<string[]>("modelNames");
  if (modelNames.includes(config.modelName)) return;
  await anki("createModel", {
    modelName: config.modelName,
    inOrderFields: ["Line", "Opening", "Answer", "Key"],
    css,
    cardTemplates: [{
      Name: "Reply",
      Front: `<div class="line">{{Line}}</div><div class="opening">{{Opening}}</div>`,
      Back: `{{FrontSide}}<hr id="answer"><div class="answer">{{Answer}}</div>`,
    }],
  });
  console.log(`"Created note type ${config.modelName}."`);
}

// loadProfile returns before the switch is done. Anything sent too early lands
// in the old profile, or fails with "collection is not available".
// Loading the profile that is already open stops AnkiConnect, so skip it then.
async function loadProfile() {
  if (await anki<string>("getActiveProfile") === config.profile) return;
  await anki("loadProfile", { name: config.profile });
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if (await anki<string>("getActiveProfile") === config.profile) {
        await anki("deckNames");
        return;
      }
    } catch {
      // Still loading.
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Profile ${config.profile} did not load in 30s`);
}

async function main() {
  // AK.02: a tree being built is wiped and half there.
  const building = await prisma.repertoire.findFirst({ where: { generationStatus: { not: "IDLE" } } });
  if (building && !whileGenerating) throw new Error(`${building.title} is ${building.generationStatus}; run again once the tree is built`);

  await loadProfile();
  await anki("createDeck", { deck: config.deckName });
  await ensureModel();

  // AK.04: keys already in Anki, in any deck.
  const noteIds = await anki<number[]>("findNotes", { query: `note:"${config.modelName}"` });
  const notes = await anki<{ fields: Record<string, { value: string }> }[]>("notesInfo", { notes: noteIds });
  const existingKeys = new Set(notes.map(note => note.fields.Key?.value));

  // AK.02: every reply, as its line before it plus the reply.
  const replies = (await prisma.repertoirePositionStat.findMany({
    where: { nodeId: { not: null }, targetMoveId: { not: null } },
    include: { node: true, targetMove: true },
  })).map(stat => {
    if (!stat.node || !stat.targetMove?.uci) throw new Error(`Incomplete repertoire card ${stat.id}`);
    const sans = stat.node.displayPgn === "" ? [] : stat.node.displayPgn.split(/\s+/);
    return { node: stat.node, answerSan: stat.targetMove.san, answerUci: stat.targetMove.uci, sans, fullLine: [...sans, stat.targetMove.san] };
  });

  // AK.02: a line ends at a reply no other reply goes on from. One card per
  // line, the line's last reply as the answer.
  const routes = replies.map(reply => reply.sans.join(" "));
  const lines = replies.filter(reply => !routes.some(route => route.startsWith(`${reply.fullLine.join(" ")} `)));

  // Line by line, as on /demo (AK.15): Anki shows new cards in the order added.
  lines.sort((a, b) => {
    const sharedLength = Math.min(a.fullLine.length, b.fullLine.length);
    for (let index = 0; index < sharedLength; index++) {
      const comparison = a.fullLine[index].localeCompare(b.fullLine[index]);
      if (comparison !== 0) return comparison;
    }
    return a.fullLine.length - b.fullLine.length;
  });
  const chosen = lines.slice(0, cardLimit);

  const newNotes = [];
  for (const line of chosen) {
    const historyUcis = line.node.history === "" ? [] : line.node.history.split(/\s+/);
    const key = cardKey(historyUcis, line.answerUci);
    if (existingKeys.has(key)) continue;
    newNotes.push({
      deckName: config.deckName,
      modelName: config.modelName,
      fields: {
        Line: numberMoves(line.sans),
        Opening: line.node.openingName ?? "",
        Answer: numberMove(line.answerSan, line.sans.length),
        Key: key,
      },
    });
  }

  if (newNotes.length > 0) await anki("addNotes", { notes: newNotes });
  console.log(`"[FINISHED] ${newNotes.length} cards added to ${config.deckName} (profile ${config.profile}); ${chosen.length - newNotes.length} already there."`);
}

main().catch(error => {
  console.error(`"[FAILED] ${error.message}"`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
