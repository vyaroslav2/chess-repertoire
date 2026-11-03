// TGL: print the stored tree as a log. Built up a piece at a time; for now, the header and the first two positions from move 2.
// Read-only: it reads the tree and the caches and writes new-docs/logs/tree-log.md, so a rerun takes seconds.
// Usage: npm run tree-log [-- <repertoire title>], or npm run tree-log:mock for made-up data.
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
  explorerProfile: string;
  explorerByPositionKey: Map<string, ExplorerPosition>;
  engineBestByFullFen: Map<string, EngineBest>;
  searchSecondsByFullFen: Map<string, number>;
  // The run's time so far when each Black reply's step ended.
  elapsedSecondsByMoveId: Map<string, number>;
  config: Config;
  printedAt: Date;
};

const percent = (share: number, digits = 1) => `${(share * 100).toFixed(digits)}%`;
const count = (value: number) => value.toLocaleString("en-GB");
// White's view: +0.38 is good for White.
const evalText = (cp: number | null | undefined, mate?: number | null) =>
  cp !== null && cp !== undefined ? `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}` : mate ? `${mate > 0 ? "" : "-"}M${Math.abs(mate)}` : "—";

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

// HM.06: least common first, as the generator handles them.
const whiteMovesAt = (input: TreeLogInput, node: RepertoireNode) =>
  input.moves.filter(move => move.fromNodeId === node.id && move.playerTurn === "OPPONENT")
    .sort((a, b) => (a.moveProb ?? 0) - (b.moveProb ?? 0));
const replyTo = (input: TreeLogInput, white: RepertoireMove) =>
  input.moves.find(move => move.fromNodeId === white.toNodeId && move.playerTurn === "RESPONSE");
const numberedRoute = (route: string) =>
  route.split(" ").filter(Boolean).map((san, ply) => ply % 2 === 0 ? `${ply / 2 + 1}. ${san}` : san).join(" ");

const duration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return `${hours > 0 ? `${hours}h ` : ""}${minutes}m ${seconds % 60}s`;
};

// A 200M search of this position: its eval, its depth and its time.
function searchFacts(input: TreeLogInput, fullFen: string, move: RepertoireMove): string {
  const seconds = input.searchSecondsByFullFen.get(fullFen);
  return [evalText(move.cp, move.mate), move.depth !== null ? `depth ${move.depth}` : "",
    seconds === undefined ? "time —" : duration(seconds)].filter(Boolean).join("  ");
}

const line = (label: string, text: string) => `${label.padEnd(10)} ${text}`;
// RE, S3.14: a route only ends this way on Black's move, so the log doesn't say so.
const REPLY_ENDINGS: Record<string, string> = {
  "Depth cap reached on Black's move": "Depth cap",
  "Game over on Black's move": "Game over",
  "No opponent moves found": "No White moves"
};
const POSITION_RULE = "=".repeat(64);
const STEP_RULE = "-".repeat(64);

// HEG.10, HEG.41: what the selector judged. No table means it didn't run or no move had games; the Reply line names the winner.
function selectorLines(reply: RepertoireMove): string[] {
  if (!reply.selectorJudged) return [];
  const stored: StoredSelector = JSON.parse(reply.selectorJudged);
  if (stored.skipped === "mate") return [line("Selector", "nothing judged: a mate score")];
  if (stored.skipped) return [];
  const rows = [
    ["move", "games", "score", "2M eval", "safe gain", "200M cp loss", "verdict"],
    [reply.championSan ?? "?", count(stored.championGames), stored.championScore === null ? "—" : percent(stored.championScore),
      evalText(reply.championCp2M), "—", "—", stored.judged.some(move => move.verdict === "passes") ? "" : "champion"],
    // HEG.32: a safe-gain failure stops before its 200M search; its stored cp loss is the 2M evals' difference.
    ...stored.judged.map(move => [move.san, count(move.games), percent(move.score), evalText(move.cpWhite, move.mateWhite),
      move.safeGain === undefined ? "—" : percent(move.safeGain),
      move.cpLoss === undefined || move.cpLoss === null || move.verdict === "safe-gain" ? "—" : String(move.cpLoss),
      move.verdict === "passes" ? "pass" : ""])
  ];
  return table(rows, [1, 2, 3, 4, 5]);
}

// HM.36, EW, RE: one White move, from the search of the position it reaches to Black's reply going on the queue.
function whiteMoveStep(input: TreeLogInput, white: RepertoireMove, queue: RepertoireNode[], nextStep: () => number): string[] {
  const after = input.nodes.find(node => node.id === white.toNodeId);
  if (!after) return [`${white.san}: its node is missing`];
  const heading = `#${nextStep()}  ${numberedRoute(after.displayPgn)}`;
  const reply = replyTo(input, white);
  if (!reply) return [`${heading}  ${white.stopReason?.toLowerCase() ?? "no reply yet"}`];
  const replyNode = input.nodes.find(node => node.id === reply.toNodeId);
  if (!replyNode) return [`${heading}: the node after ${reply.san} is missing`];
  const best = input.engineBestByFullFen.get(after.fullFen);
  if (!reply.stopReason) queue.push(replyNode);
  const elapsed = input.elapsedSecondsByMoveId.get(reply.id);
  return [
    `${heading}  cumProb ${percent(after.cumProb, 2)}`,
    `FEN=${after.fullFen}`,
    line("Baseline", `${best ? best.san ?? best.uci : "?"}  ${searchFacts(input, after.fullFen, white)}`),
    ...(reply.selectionMethod === "Hardcoded" ? [line("Hardcoded", reply.san)] : []),
    ...selectorLines(reply),
    line("Reply", `${reply.san}  ${searchFacts(input, replyNode.fullFen, reply)}`),
    ...(reply.selectionMethod === "Human evidence" ? [line("Budget", `spent ${reply.lineCpSpent} of ${input.config.selectorLineBudget}`)] : []),
    reply.stopReason ? line("Ends", REPLY_ENDINGS[reply.stopReason] ?? reply.stopReason) : line("Queue", `push ${numberedRoute(replyNode.displayPgn)}; waiting ${queue.length}`),
    line("Elapsed", elapsed === undefined ? "—" : duration(elapsed))
  ];
}

const queueLines = (queue: RepertoireNode[]) => [
  `[Queue]`,
  ...(queue.length ? [...queue].reverse().map(waiting => numberedRoute(waiting.displayPgn)) : ["(empty)"])
];

// S3: one position off the queue: White's moves as fetched, then each of them in turn, then the queue as it stands.
function positionStep(input: TreeLogInput, node: RepertoireNode, queue: RepertoireNode[], nextStep: () => number): string[] {
  return [
    POSITION_RULE,
    `Position after ${numberedRoute(node.displayPgn)}; off the queue, waiting ${queue.length}`,
    ...fetchedMoves(input, node),
    ...whiteMovesAt(input, node).filter(white => white.stopReason !== "Too rare").flatMap(white => [``, STEP_RULE, ...whiteMoveStep(input, white, queue, nextStep)]),
    ``,
    STEP_RULE,
    ...queueLines(queue)
  ];
}

function tally(labels: string[]): string {
  const totals = new Map<string, number>();
  for (const label of labels) totals.set(label, (totals.get(label) ?? 0) + 1);
  return [...totals].sort((a, b) => b[1] - a[1]).map(([label, total]) => `${label} ${total}`).join(", ");
}

// S3.10, HEG.41: totals for the whole stored tree, not only the positions printed above.
function summaryLines(input: TreeLogInput): string[] {
  const whites = input.moves.filter(move => move.playerTurn === "OPPONENT");
  const replies = input.moves.filter(move => move.playerTurn === "RESPONSE");
  const whiteLabels = whites.map(white => replyTo(input, white) ? "replied" : white.stopReason?.toLowerCase() ?? "no reply yet");
  const endings = replies.flatMap(reply => reply.stopReason ? [REPLY_ENDINGS[reply.stopReason] ?? reply.stopReason] : []);
  // The replies pushed on the queue whose positions were never taken off it.
  const expanded = new Set(whites.map(white => white.fromNodeId));
  const waiting = replies.filter(reply => !reply.stopReason && !expanded.has(reply.toNodeId ?? "")).length;
  const judged = replies.filter(reply => reply.selectorJudged && !(JSON.parse(reply.selectorJudged) as StoredSelector).skipped);
  const switched = judged.filter(reply => reply.selectionMethod === "Human evidence");
  const cumProbOf = (selected: RepertoireMove[]) =>
    selected.reduce((sum, reply) => sum + (input.nodes.find(node => node.id === reply.fromNodeId)?.cumProb ?? 0), 0);
  const elapsed = [...input.elapsedSecondsByMoveId.values()];
  return [
    POSITION_RULE,
    `[Summary]`,
    line("White", `${whites.length}: ${tally(whiteLabels)}`),
    line("Black", `${replies.length}: ${tally(replies.map(reply => reply.selectionMethod?.toLowerCase() ?? "unknown"))}`),
    ...(endings.length ? [line("Endings", tally(endings))] : []),
    ...(judged.length ? [line("Selector", `judged ${judged.length}, switched ${switched.length} (${percent(cumProbOf(switched) / cumProbOf(judged))} of judged cumProb)`)] : []),
    line("Waiting", String(waiting)),
    line("Elapsed", elapsed.length ? duration(Math.max(...elapsed)) : "—")
  ];
}

export function treeLogLines(input: TreeLogInput): string[] {
  const { config } = input;
  const root = input.nodes.find(node => node.history === "");
  // For now Black's first moves are left out: the queue starts with the hardcoded replies, 1. e4 c6 and 1. d4 d5.
  // S3.09: it is last in, first out, so the most common move, handled last, is taken next.
  const queue = root ? whiteMovesAt(input, root).flatMap(white => {
    const reply = replyTo(input, white);
    const after = reply?.selectionMethod === "Hardcoded" ? input.nodes.find(node => node.id === reply.toNodeId) : undefined;
    return after ? [after] : [];
  }) : [];
  const start = queueLines(queue);
  const positions: string[] = [];
  let step = 0;
  for (let taken = 0; taken < 2 && queue.length > 0; taken++) {
    positions.push(``, ...positionStep(input, queue.pop()!, queue, () => ++step));
  }
  return [
    `Tree log — ${input.repertoire.title} — printed ${localTime(input.printedAt)}`,
    ``,
    `Config`,
    `minCumProb ${percent(config.minCumProb)}`,
    `depthCap ${config.depthCap}`,
    `rating ${ratingRange(config.explorerRatings)}`,
    `speeds ${config.explorerSpeeds.join(" + ")}`,
    `Stockfish ${config.localStockfishVersion}, ${config.localStockfishNodes / 1_000_000}M nodes`,
    `humanEvidence ${config.humanEvidence ? "on" : "off"}`,
    ``,
    ...start,
    ...positions,
    ``,
    ...summaryLines(input)
  ];
}

function writeLog(lines: string[], logPath: string) {
  const text = ["```text", ...lines, "```", ""].join("\n");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, text);
  console.log(text);
  console.log(`Written to ${logPath}`);
}

async function main() {
  if (process.argv.includes("--mock")) {
    const { mockTreeLogInput } = await import("./tree_log_mock");
    writeLog(treeLogLines(mockTreeLogInput()), MOCK_LOG_PATH);
    return;
  }
  const title = process.argv[2];
  const repertoire = await prisma.repertoire.findFirst({ where: title ? { title } : {} });
  if (!repertoire) throw new Error(title ? `No repertoire titled "${title}"` : "No repertoire in the database");
  const [nodes, moves] = await Promise.all([
    prisma.repertoireNode.findMany({ where: { repertoireId: repertoire.id } }),
    prisma.repertoireMove.findMany({ where: { repertoireId: repertoire.id } })
  ]);
  // The run's own config is not stored, so the caches are read under the current one.
  const config = defaultConfig;
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
  // The current profile first, else the latest fetched.
  const explorerByPositionKey = new Map<string, (typeof explorerRows)[number]>();
  for (const row of explorerRows) {
    if (explorerByPositionKey.get(row.positionKey)?.cacheProfile !== explorerProfile) explorerByPositionKey.set(row.positionKey, row);
  }
  const engineBestByFullFen = new Map(engineRows.filter(row => row.evaluations[0]).map(row => [row.fullFen, row.evaluations[0]]));

  // The generator records no times yet, so a real log shows none.
  const searchSecondsByFullFen = new Map<string, number>();
  const elapsedSecondsByMoveId = new Map<string, number>();
  writeLog(treeLogLines({ repertoire, nodes, moves, explorerProfile, explorerByPositionKey, engineBestByFullFen, searchSecondsByFullFen, elapsedSecondsByMoveId, config, printedAt: new Date() }), LOG_PATH);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  }).finally(() => prisma.$disconnect());
}
