// TGL: print a run as a log: the stored tree, plus the events the generator recorded (config, times, cache hits, queue, cascades, sweeps).
// A tree with no recorded run is replayed, and those facts show as dashes. For now, from move 2 on the hardcoded lines only.
// Read-only: it reads the database, the caches and the events and writes new-docs/logs/tree-log.md, so a rerun takes seconds.
// Usage: npm run tree-log [-- <repertoire title>] [--route "e4 c6 d4"] [--step 12], or npm run tree-log:mock for made-up data.
import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";

if (fs.existsSync("C:\\Files\\.env")) {
  dotenv.config({ path: "C:\\Files\\.env", quiet: true });
} else {
  dotenv.config({ quiet: true });
}

import type { Repertoire, RepertoireMove, RepertoireNode } from "@prisma/client";
import { prisma } from "../src/lib/db/operations";
import {
  computeExplorerCacheProfile,
  computeLocalEngineEvaluationProfile,
  computeSelectorExplorerCacheProfile,
  defaultConfig,
  type Config
} from "../src/lib/core/config";
import { readRunEvents, RUN_EVENTS_PATH, type RunEvent, type SearchFact } from "../src/lib/core/run-events";

const LOG_PATH = path.resolve(__dirname, "..", "new-docs", "logs", "tree-log.md");
const MOCK_LOG_PATH = path.resolve(__dirname, "..", "new-docs", "logs", "tree-log-mock.md");

export type ExplorerPosition = {
  positionTotalGames: number;
  fetchedAt?: Date;
  cacheProfile?: string;
  moves: { uci: string; san: string; games: number }[];
};
export type EngineBest = { san: string | null; uci: string; cp: number | null; mate: number | null };
// HEG.40: what `selectorJudged` holds.
type StoredSelector = {
  championGames: number;
  championScore: number | null;
  skipped: string | null;
  judged: { san: string; games: number; score: number; verdict: string; cpWhite?: number | null; mateWhite?: number | null; cpLoss?: number | null; safeGain?: number }[];
};
export type TreeLogInput = {
  repertoire: Pick<Repertoire, "title" | "generationStatus">;
  nodes: RepertoireNode[];
  moves: RepertoireMove[];
  explorerByPositionKey: Map<string, ExplorerPosition>;
  engineBestByFullFen: Map<string, EngineBest>;
  // What the run did, recorded by the generator or else replayed from the tree.
  events: RunEvent[];
  recorded: boolean;
  config: Config;
  printedAt: Date;
};
export type TreeLogFilter = { route?: string; step?: number };
// One printed block, kept apart so a route or a step can be picked out.
type Block = { route: string; step?: number; lines: string[] };

const NO_OPPONENT_MOVES = "No opponent moves found";
// RE, S3.14: a route only ends this way on Black's move, so the log doesn't say so.
const REPLY_ENDINGS: Record<string, string> = {
  "Depth cap reached on Black's move": "Depth cap",
  "Game over on Black's move": "Game over",
  [NO_OPPONENT_MOVES]: "No White moves"
};
const POSITION_RULE = "=".repeat(68);
const STEP_RULE = "-".repeat(68);

const percent = (share: number, digits = 1) => `${(share * 100).toFixed(digits)}%`;
const count = (value: number) => value.toLocaleString("en-GB");
// White's view: +0.38 is good for White.
const evalText = (cp: number | null | undefined, mate?: number | null) =>
  cp !== null && cp !== undefined ? `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}` : mate ? `${mate > 0 ? "" : "-"}M${Math.abs(mate)}` : "—";
const line = (label: string, text: string) => `${label.padEnd(10)} ${text}`;
const duration = (seconds: number) => {
  const whole = Math.round(seconds), hours = Math.floor(whole / 3600), minutes = Math.floor(whole % 3600 / 60);
  return `${hours > 0 ? `${hours}h ` : ""}${minutes}m ${whole % 60}s`;
};
const elapsedLine = (elapsed: number | null) => line("Elapsed", elapsed === null ? "—" : duration(elapsed));
const numberedRoute = (route: string) =>
  route.split(" ").filter(Boolean).map((san, ply) => ply % 2 === 0 ? `${ply / 2 + 1}. ${san}` : san).join(" ");
// "1. e4 c6 2. d4" and "e4 c6 d4" name the same route.
const routeMoves = (route: string) => route.replace(/\d+\.+/g, " ").split(/\s+/).filter(Boolean);
const routeStartsWith = (route: string, start: string) => {
  const moves = routeMoves(route), wanted = routeMoves(start);
  return wanted.every((move, index) => moves[index] === move);
};

function localTime(date: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

// Lichess rating bands: each runs up to the next band's start, less 1; 2500 has no top.
const RATING_BANDS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];
function ratingRange(ratings: number[]): string {
  const top = Math.max(...ratings), next = RATING_BANDS.find(band => band > top);
  return next === undefined ? `${Math.min(...ratings)}+` : `${Math.min(...ratings)}–${next - 1}`;
}

function table(rows: string[][], rightAligned: number[]): string[] {
  const widths = rows[0].map((_, column) => Math.max(...rows.map(row => row[column].length)));
  return rows.map(row => row.map((cell, column) =>
    rightAligned.includes(column) ? cell.padStart(widths[column]) : cell.padEnd(widths[column])).join("  ").trimEnd());
}

// HM.06: least common first, as the generator handles them.
const whiteMovesAt = (moves: RepertoireMove[], nodeId: string) =>
  moves.filter(move => move.fromNodeId === nodeId && move.playerTurn === "OPPONENT")
    .sort((a, b) => (a.moveProb ?? 0) - (b.moveProb ?? 0));
const replyTo = (moves: RepertoireMove[], white: RepertoireMove) =>
  moves.find(move => move.fromNodeId === white.toNodeId && move.playerTurn === "RESPONSE");

/**
 * S3.09: what a run did, worked out from the tree alone: the queue is last in, first out, and the
 * first position with no stored White moves is where the run stopped. Sweeps can't be seen here.
 */
export function replayEvents(nodes: RepertoireNode[], moves: RepertoireMove[]): RunEvent[] {
  const root = nodes.find(node => node.history === "");
  if (!root) return [];
  const events: RunEvent[] = [];
  const queue = [root.id];
  while (queue.length > 0) {
    const nodeId = queue[queue.length - 1];
    const whites = whiteMovesAt(moves, nodeId);
    const noMoves = moves.some(move => move.toNodeId === nodeId && move.stopReason === NO_OPPONENT_MOVES);
    if (whites.length === 0 && !noMoves) break;
    queue.pop();
    events.push({ type: "position", nodeId, waiting: queue.length, elapsed: null });
    for (const white of whites) {
      const reply = replyTo(moves, white);
      if (white.stopReason === "Too rare") continue;
      if (white.stopReason === "Transposition") {
        events.push({ type: "transposition", whiteMoveId: white.id, cascade: null, elapsed: null });
      } else if (!reply) {
        events.push({ type: "ending", whiteMoveId: white.id, ending: white.stopReason ?? "no reply yet", elapsed: null });
      } else {
        const pushed = !reply.stopReason || reply.stopReason === NO_OPPONENT_MOVES;
        if (pushed) queue.push(reply.toNodeId!);
        events.push({ type: "reply", whiteMoveId: white.id, replyMoveId: reply.id, pushed, waiting: queue.length, elapsed: null, searches: [], selectorSeconds: null });
      }
    }
    events.push({ type: "queue", next: queue.slice(-3).reverse(), waiting: queue.length });
  }
  return events;
}

// EX.01 - EX.05, HM.21: White's moves at a position as Explorer returned them, most common first. A too-rare move ends here.
function fetchedMoves(input: TreeLogInput, node: RepertoireNode): string[] {
  const explorer = input.explorerByPositionKey.get(node.positionKey);
  if (!explorer || explorer.moves.length === 0) return ["(no moves in the Explorer cache)"];
  const share = (games: number) => explorer.positionTotalGames > 0 ? games / explorer.positionTotalGames : 0;
  const tooRare = (uci: string) => {
    const white = input.moves.find(move => move.fromNodeId === node.id && move.uci === uci && move.stopReason === "Too rare");
    const after = white && input.nodes.find(candidate => candidate.id === white.toNodeId);
    return after ? `too rare: cumProb ${percent(after.rareDropped, 2)}` : "";
  };
  return table([...explorer.moves].sort((a, b) => b.games - a.games)
    .map(move => [move.san, percent(share(move.games), 2), count(move.games), tooRare(move.uci)]), [1, 2]);
}

// A deep search of this position: its eval, its depth, and its time, or that it came from the cache.
function searchFacts(fullFen: string, move: RepertoireMove, searches: SearchFact[]): string {
  const search = searches.find(fact => fact.kind === "deep" && fact.fullFen === fullFen);
  const time = !search ? "time —" : search.reused ? "cached" : duration(search.seconds);
  return [evalText(move.cp, move.mate), move.depth !== null ? `depth ${move.depth}` : "", time].filter(Boolean).join("  ");
}

// HEG.10, HEG.31, HEG.41: what the selector judged, against the limits it had here.
// No table means it didn't run or no move had games; the Reply line names the winner.
function selectorLines(input: TreeLogInput, reply: RepertoireMove, event: Extract<RunEvent, { type: "reply" }>): string[] {
  if (!reply.selectorJudged) return [];
  const stored: StoredSelector = JSON.parse(reply.selectorJudged);
  if (stored.skipped === "mate") return [line("Selector", "nothing judged: a mate score")];
  if (stored.skipped) return [];
  const { selectorCpLimit, selectorLineBudget, selectorMargin } = input.config;
  const winnerLoss = reply.selectionMethod === "Human evidence" ? stored.judged.find(move => move.san === reply.san)?.cpLoss ?? 0 : 0;
  const spentBefore = (reply.lineCpSpent ?? 0) - Math.max(0, winnerLoss);
  const rows = [
    ["move", "games", "score", "2M eval", `safe gain >${(selectorMargin * 100).toFixed(1)}`, `200M loss ≤${Math.min(selectorCpLimit, selectorLineBudget - spentBefore)}`, "verdict"],
    [reply.championSan ?? "?", count(stored.championGames), stored.championScore === null ? "—" : percent(stored.championScore),
      evalText(reply.championCp2M), "—", "—", stored.judged.some(move => move.verdict === "passes") ? "" : "champion"],
    // HEG.32: a safe-gain failure stops before its 200M search; its stored cp loss is the 2M evals' difference.
    ...stored.judged.map(move => [move.san, count(move.games), percent(move.score), evalText(move.cpWhite, move.mateWhite),
      move.safeGain === undefined ? "—" : (move.safeGain * 100).toFixed(1),
      move.cpLoss === undefined || move.cpLoss === null || move.verdict === "safe-gain" ? "—" : String(move.cpLoss),
      move.verdict === "passes" ? "pass" : ""])
  ];
  const selectorSearches = event.searches.filter(fact => fact.kind === "selector");
  const run = selectorSearches.filter(fact => !fact.reused).length;
  const spent = event.selectorSeconds === null ? [] : [line("Selector", `2M searches ${run}, cached ${selectorSearches.length - run}  ${duration(event.selectorSeconds)}`)];
  return [...table(rows, [1, 2, 3, 4, 5]), ...spent];
}

// cumProb includes what cascades brought here; the route's own share shows beside it when they differ.
function probabilityText(node: RepertoireNode): string {
  const own = Math.abs(node.cumProb - node.routeProb) > 1e-9 ? ` (route ${percent(node.routeProb, 2)})` : "";
  return `cumProb ${percent(node.cumProb, 2)}${own}`;
}

// HM.36, EW, RE: one White move, from the search of the position it reaches to Black's reply going on the queue.
function replyStep(input: TreeLogInput, white: RepertoireMove, after: RepertoireNode, number: number, event: Extract<RunEvent, { type: "reply" }>): string[] {
  const heading = `#${number}  ${numberedRoute(after.displayPgn)}`;
  const reply = input.moves.find(move => move.id === event.replyMoveId);
  const replyNode = reply && input.nodes.find(node => node.id === reply.toNodeId);
  if (!reply || !replyNode) return [`${heading}: its reply is missing`];
  const best = input.engineBestByFullFen.get(after.fullFen);
  return [
    `${heading}  ${probabilityText(after)}`,
    `FEN=${after.fullFen}`,
    line("Baseline", `${best ? best.san ?? best.uci : "?"}  ${searchFacts(after.fullFen, white, event.searches)}`),
    ...(reply.selectionMethod === "Hardcoded" ? [line("Hardcoded", reply.san)] : []),
    ...selectorLines(input, reply, event),
    line("Reply", `${reply.san}  ${searchFacts(replyNode.fullFen, reply, event.searches)}`),
    ...(reply.selectionMethod === "Human evidence" ? [line("Budget", `spent ${reply.lineCpSpent} of ${input.config.selectorLineBudget}`)] : []),
    event.pushed
      ? line("Queue", `push ${numberedRoute(replyNode.displayPgn)}; waiting ${event.waiting}`)
      : line("Ends", REPLY_ENDINGS[reply.stopReason ?? ""] ?? reply.stopReason ?? "?"),
    elapsedLine(event.elapsed)
  ];
}

// TR.08 - TR.19: no reply and no card; the move's share goes to the owner and down its subtree.
function transpositionStep(input: TreeLogInput, after: RepertoireNode, number: number, event: Extract<RunEvent, { type: "transposition" }>): string[] {
  const owner = input.nodes.find(node => node.id === after.transposesTo);
  const { cascade } = event;
  const extras = cascade ? [`revisits ${cascade.revisits}`, `refires ${cascade.refires}`, `duplicates ${cascade.duplicates}`, `tiny dropped ${cascade.tinyDroppedCounter}`]
    .filter(text => !text.endsWith(" 0")) : [];
  return [
    `#${number}  ${numberedRoute(after.displayPgn)}  transposes to ${owner ? numberedRoute(owner.displayPgn) : "?"}`,
    line("Cascade", cascade ? [`${cascade.cascadeId}  +${percent(cascade.gain, 2)}`, `touched ${cascade.touched}`, ...extras].join("; ") : "—"),
    elapsedLine(event.elapsed)
  ];
}

const queueLines = (input: TreeLogInput, event: Extract<RunEvent, { type: "queue" }>) => {
  const names = event.next.map(nodeId => numberedRoute(input.nodes.find(node => node.id === nodeId)?.displayPgn ?? "?"));
  const more = event.waiting - names.length;
  return [`[Queue] waiting ${event.waiting}`, ...names, ...(more > 0 ? [`... ${more} more`] : [])];
};

// S3: the run, event by event. For now only the hardcoded lines are printed; the whole tree is still counted.
function runBlocks(input: TreeLogInput): Block[] {
  const shownLines = input.config.hardcodedBlackResponses;
  const shown = (route: string) => shownLines.some(start => routeStartsWith(route, start));
  const blocks: Block[] = [];
  const whiteAndNode = (whiteMoveId: string) => {
    const white = input.moves.find(move => move.id === whiteMoveId);
    const after = white && input.nodes.find(node => node.id === white.toNodeId);
    return white && after ? { white, after } : null;
  };
  let step = 0;
  let positionRoute = "";
  for (const event of input.events) {
    if (event.type === "position") {
      const node = input.nodes.find(candidate => candidate.id === event.nodeId);
      positionRoute = node?.displayPgn ?? "";
      if (!node || !shown(node.displayPgn)) continue;
      const noMoves = input.moves.some(move => move.toNodeId === node.id && move.stopReason === NO_OPPONENT_MOVES);
      blocks.push({ route: node.displayPgn, lines: [
        POSITION_RULE,
        `Position after ${numberedRoute(node.displayPgn)}; off the queue, waiting ${event.waiting}`,
        ...(noMoves ? [line("Ends", REPLY_ENDINGS[NO_OPPONENT_MOVES])] : fetchedMoves(input, node))
      ] });
    } else if (event.type === "reply" || event.type === "transposition" || event.type === "ending") {
      const found = whiteAndNode(event.whiteMoveId);
      if (!found || !shown(found.after.displayPgn)) continue;
      step++;
      const lines = event.type === "reply" ? replyStep(input, found.white, found.after, step, event)
        : event.type === "transposition" ? transpositionStep(input, found.after, step, event)
        : [`#${step}  ${numberedRoute(found.after.displayPgn)}  ${event.ending.toLowerCase()}`, elapsedLine(event.elapsed)];
      blocks.push({ route: found.after.displayPgn, step, lines: [STEP_RULE, ...lines] });
    } else if (event.type === "queue") {
      if (positionRoute === "" || shown(positionRoute)) blocks.push({ route: positionRoute, lines: [STEP_RULE, ...queueLines(input, event)] });
    } else if (event.type === "sweep") {
      // S3.16, DRS: the queue ran empty, so the too-rare moves are looked at again.
      const routes = event.reopenedMoveIds.map(moveId => numberedRoute(whiteAndNode(moveId)?.after.displayPgn ?? "?"));
      blocks.push({ route: "", lines: [POSITION_RULE, `Sweep ${event.number}: reopened ${routes.length}`, ...routes, elapsedLine(event.elapsed)] });
    }
  }
  return blocks;
}

function tally(labels: string[]): string {
  const totals = new Map<string, number>();
  for (const label of labels) totals.set(label, (totals.get(label) ?? 0) + 1);
  return [...totals].sort((a, b) => b[1] - a[1]).map(([label, total]) => `${label} ${total}`).join(", ");
}

// S3.10, HEG.41: totals for the whole stored tree, not only the positions printed below.
function summaryLines(input: TreeLogInput): string[] {
  const whites = input.moves.filter(move => move.playerTurn === "OPPONENT");
  const replies = input.moves.filter(move => move.playerTurn === "RESPONSE");
  const whiteLabels = whites.map(white => replyTo(input.moves, white) ? "replied" : white.stopReason?.toLowerCase() ?? "no reply yet");
  const endings = replies.flatMap(reply => reply.stopReason ? [REPLY_ENDINGS[reply.stopReason] ?? reply.stopReason] : []);
  // The replies pushed on the queue whose positions were never taken off it.
  const expanded = new Set(whites.map(white => white.fromNodeId));
  const waiting = replies.filter(reply => !reply.stopReason && !expanded.has(reply.toNodeId ?? "")).length;
  const judged = replies.filter(reply => reply.selectorJudged && !(JSON.parse(reply.selectorJudged) as StoredSelector).skipped);
  const switched = judged.filter(reply => reply.selectionMethod === "Human evidence");
  const sweeps = input.events.filter(event => event.type === "sweep");
  const elapsed = input.events.flatMap(event => "elapsed" in event && event.elapsed !== null ? [event.elapsed] : []);
  return [
    `[Summary]`,
    line("Positions", String(input.events.filter(event => event.type === "position").length)),
    line("White", `${whites.length}: ${tally(whiteLabels)}`),
    line("Black", `${replies.length}: ${tally(replies.map(reply => reply.selectionMethod?.toLowerCase() ?? "unknown"))}`),
    ...(endings.length ? [line("Endings", tally(endings))] : []),
    ...(judged.length ? [line("Selector", `judged ${judged.length}, switched ${switched.length}`)] : []),
    ...(sweeps.length ? [line("Sweeps", `${sweeps.length}, reopened ${sweeps.reduce((sum, sweep) => sum + sweep.reopenedMoveIds.length, 0)}`)] : []),
    ...(waiting ? [line("Waiting", `${waiting}: the run stopped early`)] : []),
    line("Elapsed", elapsed.length ? duration(Math.max(...elapsed)) : "—")
  ];
}

export function treeLogLines(input: TreeLogInput, filter: TreeLogFilter = {}): string[] {
  const { config } = input;
  const blocks = runBlocks(input).filter(block =>
    filter.step !== undefined ? block.step === filter.step
    : filter.route !== undefined ? block.route !== "" && routeStartsWith(block.route, filter.route)
    : true);
  return [
    `Tree log — ${input.repertoire.title} — printed ${localTime(input.printedAt)}`,
    ...(filter.step !== undefined ? [`Only step #${filter.step}`] : filter.route !== undefined ? [`Only the route ${filter.route}`] : []),
    ``,
    input.recorded ? `Config` : `Config (today's: this run recorded none)`,
    `minCumProb ${percent(config.minCumProb)}`,
    `depthCap ${config.depthCap}`,
    `rating ${ratingRange(config.explorerRatings)}`,
    `speeds ${config.explorerSpeeds.join(" + ")}`,
    `Stockfish ${config.localStockfishVersion}, ${config.localStockfishNodes / 1_000_000}M nodes`,
    `humanEvidence ${config.humanEvidence ? "on" : "off"}`,
    ``,
    ...summaryLines(input),
    ...blocks.flatMap(block => [``, ...block.lines])
  ];
}

function writeLog(lines: string[], logPath: string) {
  const text = ["```text", ...lines, "```", ""].join("\n");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, text);
  console.log(text);
  console.log(`Written to ${logPath}`);
}

// The arguments: --route "<moves>", --step <number>, and the title if anything else is left.
function parseArguments(args: string[]): TreeLogFilter & { title?: string } {
  const parsed: TreeLogFilter & { title?: string } = {};
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--route") parsed.route = args[++index];
    else if (args[index] === "--step") parsed.step = Number(args[++index]);
    else if (args[index] !== "--mock") parsed.title = args[index];
  }
  return parsed;
}

async function main() {
  const { title, ...filter } = parseArguments(process.argv.slice(2));
  if (process.argv.includes("--mock")) {
    const { mockTreeLogInput } = await import("./tree_log_mock");
    writeLog(treeLogLines(mockTreeLogInput(), filter), MOCK_LOG_PATH);
    return;
  }
  const repertoire = await prisma.repertoire.findFirst({ where: title ? { title } : {} });
  if (!repertoire) throw new Error(title ? `No repertoire titled "${title}"` : "No repertoire in the database");
  const [nodes, moves] = await Promise.all([
    prisma.repertoireNode.findMany({ where: { repertoireId: repertoire.id } }),
    prisma.repertoireMove.findMany({ where: { repertoireId: repertoire.id } })
  ]);
  // The recorded run, if it is this tree's: another repertoire's or an older tree's events don't apply.
  const moveIds = new Set(moves.map(move => move.id));
  const recordedEvents = readRunEvents(RUN_EVENTS_PATH);
  const run = recordedEvents?.find(event => event.type === "run");
  const recorded = run?.repertoireId === repertoire.id
    && recordedEvents!.every(event => event.type !== "reply" || moveIds.has(event.replyMoveId));
  const config = recorded ? run.config : defaultConfig;
  const explorerProfile = computeExplorerCacheProfile(config);
  const [explorerRows, engineRows] = await Promise.all([
    // Every Amateur profile, so a tree built under older settings still shows its moves.
    prisma.positionCache.findMany({
      where: {
        cacheProfile: { notIn: [computeSelectorExplorerCacheProfile(config), "empty-profile"] },
        positionKey: { in: nodes.map(node => node.positionKey) }
      },
      include: { moves: true },
      orderBy: { fetchedAt: "asc" }
    }),
    prisma.engineCache.findMany({
      where: { engine: "LOCAL", engineProfile: computeLocalEngineEvaluationProfile(config), fullFen: { in: nodes.map(node => node.fullFen) } },
      include: { evaluations: { where: { rank: 1 } } }
    })
  ]);
  // The run's profile first, else the latest fetched.
  const explorerByPositionKey = new Map<string, (typeof explorerRows)[number]>();
  for (const row of explorerRows) {
    if (explorerByPositionKey.get(row.positionKey)?.cacheProfile !== explorerProfile) explorerByPositionKey.set(row.positionKey, row);
  }
  const engineBestByFullFen = new Map(engineRows.filter(row => row.evaluations[0]).map(row => [row.fullFen, row.evaluations[0]]));
  const events = recorded ? recordedEvents! : replayEvents(nodes, moves);

  writeLog(treeLogLines({ repertoire, nodes, moves, explorerByPositionKey, engineBestByFullFen, events, recorded, config, printedAt: new Date() }, filter), LOG_PATH);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  }).finally(() => prisma.$disconnect());
}
