// AK.02, AK.17, AK.18: the repertoire's whole lines as Anki cards, through AnkiConnect.
// Used by the generator after each position and at the end of a run, and by scripts/anki_export.ts.
// Reads the database only.
import { createHash } from "crypto";

import { prisma } from "../db/operations";

export const ankiConfig = {
  ankiConnectUrl: "http://localhost:8765",
  profile: "User test New",
  deckName: "Chess Repertoire",
  modelName: "Chess Repertoire",
};

export type AnkiCall = <T>(action: string, params?: object) => Promise<T>;

export const ankiConnect: AnkiCall = async <T>(action: string, params: object = {}): Promise<T> => {
  const response = await fetch(ankiConfig.ankiConnectUrl, {
    method: "POST",
    body: JSON.stringify({ action, version: 6, params }),
  });
  const { result, error } = await response.json();
  if (error) throw new Error(`AnkiConnect ${action}: ${error}`);
  return result as T;
};

// AK.03: SAN with move numbers. ["e4", "c6", "d4"] --> "1. e4 c6 2. d4"
export function numberMoves(sans: string[]) {
  return sans.map((san, ply) => (ply % 2 === 0 ? `${ply / 2 + 1}. ${san}` : san)).join(" ");
}

// The move at this ply on its own: "2... d5" for Black, "3. Nf3" for White.
export function numberMove(san: string, ply: number) {
  const moveNumber = Math.floor(ply / 2) + 1;
  return ply % 2 === 0 ? `${moveNumber}. ${san}` : `${moveNumber}... ${san}`;
}

/** AK.18: a card's whole line, from its Line and Answer fields. "1. e4 c6 2. d4" + "2... d5" --> e4 c6 d4 d5 */
export function cardMoves(line: string, answer: string): string[] {
  return `${line} ${answer}`.split(/\s+/).filter(token => token !== "" && !/^\d+\.+$/.test(token));
}

// AK.04
export function cardKey(historyUcis: string[], answerUci: string) {
  return createHash("sha1").update([...historyUcis, answerUci].join(" ")).digest("hex");
}

/** AK.17: what a line's end tells about whether it can still grow. */
export type LineEnd = {
  /** The Black reply's stopReason (DB.20), if it ended the route. */
  replyStopReason: string | null;
  /** The position after the reply has been dealt with: White's moves there exist. */
  dealtWith: boolean;
  /** The stopReasons of White's moves there; null where a move did not end. */
  whiteStopReasons: (string | null)[];
};

export type Finality = "final" | "held" | "open";

/** AK.17: final now, held back until the run's end (a too-rare move can be reopened), or still open. */
export function lineFinality(end: LineEnd): Finality {
  if (end.replyStopReason !== null) return "final";
  if (!end.dealtWith || end.whiteStopReasons.some(reason => reason === null)) return "open";
  return end.whiteStopReasons.includes("Too rare") ? "held" : "final";
}

export type ReplyLine = {
  /** SAN, from move 1 to the reply. */
  fullLine: string[];
  historyUcis: string[];
  answerSan: string;
  answerUci: string;
  openingName: string | null;
  end: LineEnd;
};

/** AK.02: a line ends at a reply no other reply goes on from. */
export function wholeLines(replies: ReplyLine[]): ReplyLine[] {
  const routes = replies.map(reply => reply.fullLine.slice(0, -1).join(" "));
  return replies.filter(reply => !routes.some(route => route.startsWith(`${reply.fullLine.join(" ")} `)));
}

/** AK.02: move by move, as on /demo (AK.15). */
export function compareLines(a: ReplyLine, b: ReplyLine) {
  const sharedLength = Math.min(a.fullLine.length, b.fullLine.length);
  for (let index = 0; index < sharedLength; index++) {
    const comparison = a.fullLine[index].localeCompare(b.fullLine[index]);
    if (comparison !== 0) return comparison;
  }
  return a.fullLine.length - b.fullLine.length;
}

export type ExistingNote = { noteId: number; key: string; moves: string[] };

export type NewNote = { line: ReplyLine; key: string; fields: { Line: string; Opening: string; Answer: string; Key: string } };

/** AK.04, AK.18: which lines to add, and which cards a longer line replaces. */
export function planNotes(lines: ReplyLine[], existing: ExistingNote[]): { add: NewNote[]; replace: number[] } {
  const existingKeys = new Set(existing.map(note => note.key));
  const add: NewNote[] = [];
  const replace = new Set<number>();
  for (const line of lines) {
    const key = cardKey(line.historyUcis, line.answerUci);
    if (existingKeys.has(key)) continue;
    for (const note of existing) {
      const isShorterLine = note.moves.length < line.fullLine.length && note.moves.every((san, index) => san === line.fullLine[index]);
      if (isShorterLine) replace.add(note.noteId);
    }
    const sans = line.fullLine.slice(0, -1);
    add.push({
      line,
      key,
      fields: { Line: numberMoves(sans), Opening: line.openingName ?? "", Answer: numberMove(line.answerSan, sans.length), Key: key },
    });
  }
  return { add, replace: [...replace] };
}

/** AK.02: every reply in the database, with what its end tells (AK.17). */
export async function readReplyLines(): Promise<ReplyLine[]> {
  const stats = await prisma.repertoirePositionStat.findMany({
    where: { nodeId: { not: null }, targetMoveId: { not: null } },
    include: {
      node: true,
      targetMove: { include: { toNode: { include: { outgoingMoves: { where: { playerTurn: "OPPONENT" }, select: { stopReason: true } } } } } },
    },
  });
  return stats.map(stat => {
    if (!stat.node || !stat.targetMove?.uci) throw new Error(`Incomplete repertoire card ${stat.id}`);
    const sans = stat.node.displayPgn === "" ? [] : stat.node.displayPgn.split(/\s+/);
    const whiteMoves = stat.targetMove.toNode?.outgoingMoves ?? [];
    return {
      fullLine: [...sans, stat.targetMove.san],
      historyUcis: stat.node.history === "" ? [] : stat.node.history.split(/\s+/),
      answerSan: stat.targetMove.san,
      answerUci: stat.targetMove.uci,
      openingName: stat.node.openingName,
      end: {
        replyStopReason: stat.targetMove.stopReason,
        dealtWith: whiteMoves.length > 0,
        whiteStopReasons: whiteMoves.map(move => move.stopReason),
      },
    };
  });
}

const css = `.card { font-family: arial; font-size: 22px; text-align: center; color: black; background-color: white; }
.opening { font-size: 16px; color: #777; margin-top: 8px; }
.answer { font-size: 28px; font-weight: bold; }`;

async function ensureModel(anki: AnkiCall) {
  const modelNames = await anki<string[]>("modelNames");
  if (modelNames.includes(ankiConfig.modelName)) return;
  await anki("createModel", {
    modelName: ankiConfig.modelName,
    inOrderFields: ["Line", "Opening", "Answer", "Key"],
    css,
    cardTemplates: [{
      Name: "Reply",
      Front: `<div class="line">{{Line}}</div><div class="opening">{{Opening}}</div>`,
      Back: `{{FrontSide}}<hr id="answer"><div class="answer">{{Answer}}</div>`,
    }],
  });
  console.log(`"Created note type ${ankiConfig.modelName}."`);
}

/** AK.04: our notes, in any deck. */
async function readExistingNotes(anki: AnkiCall): Promise<ExistingNote[]> {
  const noteIds = await anki<number[]>("findNotes", { query: `note:"${ankiConfig.modelName}"` });
  const notes = await anki<{ noteId: number; fields: Record<string, { value: string }> }[]>("notesInfo", { notes: noteIds });
  return notes.map(note => ({
    noteId: note.noteId,
    key: note.fields.Key?.value ?? "",
    moves: cardMoves(note.fields.Line?.value ?? "", note.fields.Answer?.value ?? ""),
  }));
}

export type ExportOptions = {
  /** AK.17: "final" adds only lines that can no longer grow; "all" adds every line (a finished tree). */
  lines: "final" | "all";
  limit?: number;
  anki?: AnkiCall;
};

/** AK.02, AK.17, AK.18: adds the lines not yet in Anki, and deletes the shorter cards they replace. Anki's profile must already be open. */
export async function exportLines(options: ExportOptions): Promise<{ added: number; replaced: number; alreadyThere: number }> {
  const anki = options.anki ?? ankiConnect;
  await anki("createDeck", { deck: ankiConfig.deckName });
  await ensureModel(anki);

  const lines = wholeLines(await readReplyLines())
    .filter(line => options.lines === "all" || lineFinality(line.end) === "final")
    .sort(compareLines)
    .slice(0, options.limit ?? Infinity);
  const { add, replace } = planNotes(lines, await readExistingNotes(anki));

  if (replace.length > 0) await anki("deleteNotes", { notes: replace });
  if (add.length > 0) {
    await anki("addNotes", {
      notes: add.map(note => ({ deckName: ankiConfig.deckName, modelName: ankiConfig.modelName, fields: note.fields })),
    });
  }
  return { added: add.length, replaced: replace.length, alreadyThere: lines.length - add.length };
}

/**
 * AK.17: the generator's exporter. Never switches Anki's profile and never throws: if Anki isn't
 * running or another profile is open, it says so once and the next call catches up.
 */
export function createRunExporter(anki: AnkiCall = ankiConnect, log: (line: string) => void = console.log) {
  let lastReason: string | null = null;
  return async (lines: "final" | "all") => {
    try {
      const profile = await anki<string>("getActiveProfile");
      if (profile !== ankiConfig.profile) throw new Error(`profile ${profile} is open, not ${ankiConfig.profile}`);
      const result = await exportLines({ lines, anki });
      lastReason = null;
      if (result.added > 0 || result.replaced > 0) log(`"[ANKI] ${result.added} cards added; ${result.replaced} replaced."`);
    } catch (error) {
      const reason = error instanceof TypeError ? "Anki is not running" : (error as Error).message;
      if (reason === lastReason) return; // said once until something changes
      lastReason = reason;
      log(`"[WARNING] Anki export skipped: ${reason}. Retrying after the next position."`);
    }
  };
}
