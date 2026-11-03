import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config";

// TGL: what a run did, in order, for what the database doesn't hold: its config, times, cache hits,
// the queue, cascades and sweeps. An `elapsed` is seconds since the run began. A replay of a tree
// with no recorded run gives the same events without those facts, so `elapsed` can be null.

export const RUN_EVENTS_PATH = path.resolve(__dirname, "..", "..", "..", "new-docs", "logs", "tree-events.jsonl");

/** One search: `deep` is EW.09's search of a position (HEG.32), `selector` a 2M search of one move (HEG.21). */
export type SearchFact = { fullFen: string; uci?: string; kind: "deep" | "selector"; seconds: number; reused: boolean };

/** TR.09 - TR.19: one cascade. `gain` is what the pointer handed to its owner. */
export type CascadeFact = {
  cascadeId: string;
  gain: number;
  touched: number;
  revisits: number;
  refires: number;
  duplicates: number;
  tinyDroppedCounter: number;
};

export type RunEvent =
  | { type: "run"; repertoireId: string; startedAt: string; config: Config }
  | { type: "position"; nodeId: string; waiting: number; elapsed: number | null }
  | { type: "reply"; whiteMoveId: string; replyMoveId: string; pushed: boolean; waiting: number; elapsed: number | null;
      searches: SearchFact[]; selectorSeconds: number | null }
  | { type: "ending"; whiteMoveId: string; ending: string; elapsed: number | null }
  | { type: "transposition"; whiteMoveId: string; cascade: CascadeFact | null; elapsed: number | null }
  | { type: "queue"; next: string[]; waiting: number }
  | { type: "sweep"; number: number; reopenedMoveIds: string[]; elapsed: number }
  | { type: "end"; elapsed: number };

/** Starts the run's file, replacing the last run's: the database holds one tree, so the file holds one run. */
export function runEventWriter(filePath: string): (event: RunEvent) => void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
  return event => fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`);
}

export function readRunEvents(filePath: string): RunEvent[] | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as RunEvent);
}
