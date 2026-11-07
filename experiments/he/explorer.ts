import { createHash } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Chess } from "chess.js";
import { assertDataDirectory, DATA_ROOT, runPath } from "./paths";
import type { MoveGroup } from "./types";

// HEK: groups from the Lichess Explorer's counts, for k. Same band, speeds and period as the
// curve's games; the Explorer groups a game by the average of both ratings (HEK.34).
export const EXPLORER = { ratings: [1600, 1800, 2000], speeds: ["rapid", "classical"],
  since: "2023-01", until: "2024-12", moves: 100 } as const;
export const DEFAULT_BASE = "http://127.0.0.1:55555/lichess";
export type ExplorerMove = { uci: string; san: string; white: number; draws: number; black: number };
export type ExplorerAnswer = { white: number; draws: number; black: number; moves: ExplorerMove[] };
export type Fetcher = (url: string) => Promise<ExplorerAnswer>;
export type WalkOptions = { base: string; follow: number; calls: number; minGroup: number; lastMove: number;
  askFrom?: number; cache?: string };

const START = ["d4 d5", "e4 c6"];
const games = (row: { white: number; draws: number; black: number }) => row.white + row.draws + row.black;
const positionKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

// The months a count comes from, and optionally fewer rating groups. The walk's are EXPLORER's
// own; the 2025 check asks for others.
export type Months = { since: string; until: string; ratings?: readonly number[] };
export function parseMonths(text: string): Months {
  const match = /^(\d{4}-\d{2})\.\.(\d{4}-\d{2})$/.exec(text);
  if (!match || match[1] > match[2]) throw new Error("Months must look like 2025-01..2025-12.");
  return { since: match[1], until: match[2] };
}

export function explorerUrl(base: string, fen: string, months: Months = EXPLORER): string {
  const query = new URLSearchParams({ fen, speeds: EXPLORER.speeds.join(","), ratings: (months.ratings ?? EXPLORER.ratings).join(","),
    since: months.since, until: months.until, moves: String(EXPLORER.moves), topGames: "0", recentGames: "0" });
  return base.replace(/\/$/, "") + "/lichess?" + query;
}

// One request at a time. A 429 asks us to wait a minute before the next one; a server error
// (the proxy reports a slow Explorer as 500) is tried again after 10 s.
export const httpFetcher: Fetcher = async url => {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (response.ok) return await response.json() as ExplorerAnswer;
    const retry = response.status === 429 || response.status >= 500;
    if (!retry || attempt === 5) throw new Error("Explorer answered " + response.status + " for " + url);
    const wait = response.status === 429 ? 60 : 10;
    console.error("Explorer answered " + response.status + "; waiting " + wait + " s.");
    await new Promise(resolve => setTimeout(resolve, wait * 1000));
  }
};

// The request's shape names the cache, so answers to other filters are never reused. The
// spread keeps EXPLORER's key order, so the walk's own months give its original cache. Tests
// pass their own root.
function cacheDirectory(months: Months, root = path.join(DATA_ROOT, "explorer-cache")) {
  const profile = createHash("sha256").update(JSON.stringify({ ...EXPLORER, ...months })).digest("hex").slice(0, 16);
  return path.join(root, profile);
}
const cacheFile = (cache: string, fen: string) => path.join(cache, createHash("sha256").update(positionKey(fen)).digest("hex") + ".json");

// One position's counts for the given months, from the cache or else from the Explorer.
export async function explorerCounts(fen: string, months: Months, base = DEFAULT_BASE, fetcher: Fetcher = httpFetcher,
  cacheOverride?: string): Promise<{ answer: ExplorerAnswer; fetched: boolean }> {
  const cache = cacheDirectory(months, cacheOverride);
  await assertDataDirectory(cache);
  const file = cacheFile(cache, fen);
  try { return { answer: JSON.parse(await readFile(file, "utf8")).answer, fetched: false }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const answer = await fetcher(explorerUrl(base, fen, months));
  if (!Array.isArray(answer?.moves)) throw new Error("Explorer answer without moves for " + fen);
  await writeFile(file, JSON.stringify({ fen, answer, fetchedAt: new Date().toISOString() }) + "\n");
  return { answer, fetched: true };
}

// HEK.11–12: walks the main lines from 1. d4 d5 and 1. e4 c6, most-played position first. It
// follows every move with at least `follow` games and stops after Black's move `lastMove`. At
// each position with Black to move, every move with at least `minGroup` games is a group.
// Positions before move `askFrom` are read from the cache only, so a deeper walk spends its calls
// on deep moves; one missing from the cache is skipped.
export async function walkExplorer(name: string, options: WalkOptions, fetcher: Fetcher = httpFetcher) {
  const askFrom = options.askFrom ?? 1;
  for (const [key, value] of Object.entries({ follow: options.follow, calls: options.calls, minGroup: options.minGroup, lastMove: options.lastMove, askFrom }))
    if (!Number.isInteger(value) || value < (key === "minGroup" ? 2 : 1)) throw new Error(key + " must be a positive integer" + (key === "minGroup" ? " of at least 2." : "."));
  const cache = cacheDirectory(EXPLORER, options.cache);
  await assertDataDirectory(cache);
  await assertDataDirectory(path.join(DATA_ROOT, "runs"));
  const directory = runPath(name);
  await mkdir(directory);
  await assertDataDirectory(directory);
  const manifest = { source: "lichess explorer", request: EXPLORER, options: { follow: options.follow, calls: options.calls,
    minGroup: options.minGroup, lastMove: options.lastMove, askFrom }, cache: path.relative(DATA_ROOT, cache), startedAt: new Date().toISOString() };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ ...manifest, status: "running" }, null, 2));
  const groupsOut = await open(path.join(directory, "groups.jsonl"), "wx");
  const positionsOut = await open(path.join(directory, "positions.jsonl"), "wx");
  // A max-heap on games: the most-played position is asked first, so a cap cuts the rarest.
  const queue: { fen: string; line: string[]; games: number }[] = [];
  const push = (item: typeof queue[number]) => {
    let i = queue.push(item) - 1;
    while (i > 0 && queue[(i - 1) >> 1].games < queue[i].games) { [queue[i], queue[(i - 1) >> 1]] = [queue[(i - 1) >> 1], queue[i]]; i = (i - 1) >> 1; }
  };
  const pop = () => {
    const top = queue[0], last = queue.pop()!;
    if (queue.length) {
      queue[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < queue.length && queue[l].games > queue[m].games) m = l;
        if (r < queue.length && queue[r].games > queue[m].games) m = r;
        if (m === i) break;
        [queue[i], queue[m]] = [queue[m], queue[i]]; i = m;
      }
    }
    return top;
  };
  for (const start of START) {
    const chess = new Chess();
    for (const san of start.split(" ")) chess.move(san);
    push({ fen: chess.fen(), line: start.split(" "), games: Infinity });
  }
  const seen = new Map<string, number>();
  const byMove: Record<string, { groups: number; games: number; "2-9": number; "10-49": number; "50-199": number; "200-999": number; "1000+": number }> = {};
  let calls = 0, cached = 0, skipped = 0, positions = 0, groups = 0, transpositions = 0, unaccounted = 0, stoppedAtCap = false;
  try {
    while (queue.length) {
      const node = pop(), key = positionKey(node.fen), moveNumber = Number(node.fen.split(" ")[5]);
      if (seen.has(key)) { if (seen.get(key) !== moveNumber) transpositions++; continue; }
      const file = cacheFile(cache, node.fen);
      let answer: ExplorerAnswer;
      try { answer = JSON.parse(await readFile(file, "utf8")).answer; cached++; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        if (moveNumber < askFrom) { skipped++; continue; }
        if (calls >= options.calls) { stoppedAtCap = true; push(node); break; }
        answer = await fetcher(explorerUrl(options.base, node.fen)); calls++;
        if (!Array.isArray(answer?.moves)) throw new Error("Explorer answer without moves for " + node.fen);
        await writeFile(file, JSON.stringify({ fen: node.fen, answer, fetchedAt: new Date().toISOString() }) + "\n");
        if (calls % 100 === 0) console.error(calls + " calls, " + positions + " positions, " + groups + " groups");
      }
      seen.set(key, moveNumber); positions++;
      if (answer.moves.reduce((sum, move) => sum + games(move), 0) !== games(answer)) unaccounted++;
      const chess = new Chess(node.fen), black = chess.turn() === "b";
      await positionsOut.write(JSON.stringify({ positionKey: key, fen: node.fen, line: node.line.join(" "),
        games: games(answer), moves: answer.moves.length }) + "\n");
      for (const move of answer.moves) {
        const n = games(move);
        if (n < options.minGroup && n < options.follow) continue;
        // The move's UCI comes from chess.js, so castling reads e8g8 as the jobs expect.
        const played = chess.move(move.san);
        const next = { fen: chess.fen(), line: [...node.line, move.san], games: n };
        chess.undo();
        if (black && n >= options.minGroup) {
          const group: MoveGroup = { period: "fit", positionKey: key, uci: played.lan, fens: [node.fen], games: n,
            wins: move.black, draws: move.draws, losses: move.white, moveNumbers: { [moveNumber]: n } };
          await groupsOut.write(JSON.stringify(group) + "\n");
          groups++;
          const row = byMove[moveNumber] ??= { groups: 0, games: 0, "2-9": 0, "10-49": 0, "50-199": 0, "200-999": 0, "1000+": 0 };
          row.groups++; row.games += n;
          row[n < 10 ? "2-9" : n < 50 ? "10-49" : n < 200 ? "50-199" : n < 1000 ? "200-999" : "1000+"]++;
        }
        if (n >= options.follow && !(black && moveNumber >= options.lastMove)) push(next);
      }
    }
    const summary = { calls, cached, skipped, positions, groups, byMove, transpositions, unaccounted, stoppedAtCap, queueLeft: queue.length };
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ ...manifest, status: "complete",
      finishedAt: new Date().toISOString(), summary }, null, 2));
    return { directory, ...summary };
  } catch (error) {
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ ...manifest, status: "failed", error: String(error),
      calls, positions, groups }, null, 2));
    throw error;
  } finally { await groupsOut.close(); await positionsOut.close(); }
}

// HEK.70: the groups to search, as a new run. Every group with at least `minGames` games, at most
// `perMove` at each Black move number. Within a move they are picked by a hash of position and
// move, so the same sample comes out every time.
export async function sampleGroups(name: string, from: string, minGames: number, perMove: number) {
  for (const [key, value] of Object.entries({ minGames, perMove }))
    if (!Number.isInteger(value) || value < 1) throw new Error(key + " must be a positive integer.");
  const source = runPath(from);
  await assertDataDirectory(source);
  const rows: MoveGroup[] = (await readFile(path.join(source, "groups.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const byMove = new Map<number, { group: MoveGroup; rank: string }[]>();
  for (const group of rows) {
    if (group.games < minGames) continue;
    const move = Number(Object.keys(group.moveNumbers)[0]);
    const rank = createHash("sha256").update(group.positionKey + " " + group.uci).digest("hex");
    byMove.set(move, [...byMove.get(move) ?? [], { group, rank }]);
  }
  await assertDataDirectory(path.join(DATA_ROOT, "runs"));
  const directory = runPath(name);
  await mkdir(directory);
  await assertDataDirectory(directory);
  const output = await open(path.join(directory, "groups.jsonl"), "wx");
  const counts: Record<string, { eligible: number; chosen: number; games: number }> = {};
  let groups = 0;
  try {
    for (const [move, list] of [...byMove].sort(([x], [y]) => x - y)) {
      const chosen = list.sort((x, y) => x.rank < y.rank ? -1 : 1).slice(0, perMove);
      for (const { group } of chosen) await output.write(JSON.stringify(group) + "\n");
      counts[move] = { eligible: list.length, chosen: chosen.length, games: chosen.reduce((sum, { group }) => sum + group.games, 0) };
      groups += chosen.length;
    }
  } finally { await output.close(); }
  const summary = { source: "sample", from, minGames, perMove, groups, byMove: counts };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(summary, null, 2));
  return { directory, ...summary };
}
