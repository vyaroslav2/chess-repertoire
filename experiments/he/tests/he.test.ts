import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { Chess } from "chess.js";
import { selectObservation, readGames, gameRecord } from "../pgn";
import { importFiles, groupObservations } from "../import";
import { parseEvaluation } from "../engine";
import { writeJobs } from "../jobs";
import { importResults } from "../results";
import { basis, chances, fit, random } from "../curve";
import { fitK, fitKTrend, logGamma, type KGroup } from "../scatter";
import { sampledMoves } from "../dots";
import { poolRuns } from "../pool";
import { choose, couldPass, DIALS, judge, safeGain, scoreDraws, type Curve } from "../select";
import { DATA_ROOT, assertDataDirectory, runPath } from "../paths";
import { sampleGroups, walkExplorer, type ExplorerAnswer } from "../explorer";
import type { Observation } from "../types";

const options = { seed: "he-v1", maxGap: 100 as const };
export function fixture(overrides: Record<string, string> = {}, caro = false): string {
  const tags = { Event: "Rated rapid game", Site: "https://lichess.org/abcd1234", Date: "2024.06.01",
    White: "FixtureWhite", Black: "FixtureBlack", WhiteElo: "1800", BlackElo: "1800", Result: "0-1", ...overrides };
  const chess = new Chess();
  chess.move(caro ? "e4" : "d4"); chess.move(caro ? "c6" : "d5");
  for (let number = 2; number <= 16; number++) {
    chess.move(number % 2 === 0 ? "Nf3" : "Ng1");
    chess.move(number % 2 === 0 ? "Nf6" : "Ng8");
  }
  return Object.entries(tags).map(([key, value]) => '[' + key + ' "' + value + '"]').join("\n") +
    "\n\n" + chess.history().map((san, i) => (i % 2 === 0 ? (i / 2 + 1) + ". " : "") + san).join(" ") + " " + tags.Result + "\n";
}
function observation(pgn = fixture()): Observation {
  const result = selectObservation(pgn, options);
  assert.ok("observation" in result, JSON.stringify(result));
  return result.observation;
}
function rejection(overrides: Record<string, string>, reason: string) {
  assert.deepEqual(selectObservation(fixture(overrides), options), { rejected: reason });
}
test("one deterministic Black observation, White-view FEN, real Black WDL", () => {
  const row = observation();
  assert.equal(row.fen.split(" ")[1], "b");
  assert.ok(row.moveNumber >= 2 && row.moveNumber <= 15);
  assert.equal(row.period, "fit"); assert.equal(row.outcome, "wins");
  assert.equal(observation(fixture({ Result: "1-0" })).outcome, "losses");
  assert.equal(observation(fixture({ Result: "1/2-1/2" })).outcome, "draws");
  assert.equal(observation(fixture({ Result: "1-0" })).moveNumber, row.moveNumber);
  assert.deepEqual(observation(), row);
});
test("both scoped openings and dated period boundaries", () => {
  assert.equal(observation(fixture({}, true)).opening, "caro-kann");
  assert.equal(observation().opening, "d4-d5");
  for (const [Date, period] of [["2023.01.01", "fit"], ["2024.12.31", "fit"],
    ["2025.01.01", "tune"], ["2026.01.01", "test"]]) assert.equal(observation(fixture({ Date })).period, period);
  rejection({ Date: "2024.02.30" }, "date");
  rejection({ Date: "2022.12.31" }, "date");
  rejection({ Date: "2027.01.01" }, "date");
  assert.equal(observation(fixture({ Date: "2025.01.01", UTCDate: "2024.12.31" })).period, "fit");
});
test("average rating and strict gap filters, speed, variant, IDs, results", () => {
  assert.equal(observation(fixture({ WhiteElo: "1551", BlackElo: "1650" })).averageRating, 1600.5);
  rejection({ WhiteElo: "1550", BlackElo: "1650" }, "rating-gap");
  rejection({ WhiteElo: "1599", BlackElo: "1599" }, "rating-band");
  rejection({ WhiteElo: "2200", BlackElo: "2200" }, "rating-band");
  rejection({ WhiteElo: "?" }, "rating");
  rejection({ Event: "Rated blitz game" }, "speed-or-unrated");
  rejection({ Event: "Casual rapid game" }, "speed-or-unrated");
  assert.equal(observation(fixture({ Event: "Rated classical game" })).speed, "classical");
  rejection({ Variant: "Chess960" }, "nonstandard");
  rejection({ Site: "https://example.com/abcd1234" }, "game-id");
  rejection({ Result: "*" }, "unfinished");
  const diagnostic = selectObservation(fixture({ WhiteElo: "1800", BlackElo: "1950" }), { ...options, maxGap: 200 });
  assert.ok("observation" in diagnostic);
  assert.equal(diagnostic.observation.gapBand, "100-199");
});
test("other openings, illegal moves, missing fixed sampled move, result mismatch", () => {
  assert.deepEqual(selectObservation(fixture().replace("1. d4 d5", "1. c4 d5"), options), { rejected: "opening" });
  assert.deepEqual(selectObservation(fixture().replace("1. d4 d5", "1. d4 d4"), options), { rejected: "opening" });
  assert.deepEqual(selectObservation(fixture().replace("1. d4 d5", "1. e4 d5"), options), { rejected: "opening" });
  assert.deepEqual(selectObservation(fixture().replace("2. Nf3", "2. Qh8"), options), { rejected: "invalid-pgn" });
  const clocked = fixture().replace("1. d4 d5", "1. d4 { [%clk 0:10:00] } 1... d5?! { [%clk 0:10:00] }");
  assert.equal(observation(clocked).opening, "d4-d5");
  const short = fixture().replace(/1\. d4[\s\S]*/, "1. d4 d5 0-1");
  assert.deepEqual(selectObservation(short, options), { rejected: "sampled-move-missing" });
  assert.deepEqual(selectObservation(fixture().replace(/0-1\s*$/, "1-0"), options), { rejected: "result-mismatch" });
  // Rules infraction is the filter's last check: a game failing an earlier check is counted there instead.
  rejection({ Termination: "Rules infraction" }, "rules-infraction");
  const shortCheat = short.replace("[Result", '[Termination "Rules infraction"]\n[Result');
  assert.deepEqual(selectObservation(shortCheat, options), { rejected: "sampled-move-missing" });
  assert.equal(observation(fixture({ Termination: "Normal" })).outcome, "wins");
});
test("groups contain raw counts, separate periods and retain full FEN variants", () => {
  const a = observation();
  const groups = groupObservations([a, { ...a, outcome: "draws", fen: a.fen.replace(/ \d+ (\d+)$/, " 37 $1") },
    { ...a, period: "tune", outcome: "losses" }]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].games, 2); assert.equal(groups[0].wins, 1); assert.equal(groups[0].draws, 1);
  assert.equal(groups[0].fens.length, 2);
  assert.equal(groups[1].losses, 1);
});
test("stream PGN and gzip, preserve multiline comments, deduplicate across files", async () => {
  await assertDataDirectory(DATA_ROOT);
  const directory = await mkdtemp(path.join(DATA_ROOT, "test-"));
  const name = "test-import-" + path.basename(directory) + "-" + Date.now();
  const run = runPath(name);
  try {
    const pgn = fixture().replace("1. d4", '1. {a comment\n[Event "not a new game"]\n} d4');
    const first = path.join(directory, "one.pgn"), second = path.join(directory, "two.pgn.gz");
    await writeFile(first, "\uFEFF" + pgn + "\n" + fixture({ Site: "https://lichess.org/efgh5678", Date: "2025.03.02" }));
    await writeFile(second, gzipSync(pgn));
    const split: string[] = [];
    for await (const game of readGames(first)) split.push(game);
    assert.equal(split.length, 2);
    const report = await importFiles([first, second], name, options);
    assert.equal(report.accepted, 2, JSON.stringify(report)); assert.equal(report.duplicates, 1);
    assert.equal(report.coverage.fit.games, 1); assert.equal(report.coverage.tune.games, 1);
    const rows = (await readFile(path.join(run, "observations.jsonl"), "utf8")).trim().split("\n");
    assert.equal(rows.length, 2);
    await assert.rejects(importFiles([first], name, options), /EEXIST/);
    assert.equal(JSON.parse(await readFile(path.join(run, "manifest.json"), "utf8")).status, "complete");
  } finally {
    await assertDataDirectory(directory); await assertDataDirectory(run);
    await rm(directory, { recursive: true }); await rm(run, { recursive: true });
  }
});
test("bounded pilot import and diagnostic provenance", async () => {
  await assertDataDirectory(DATA_ROOT);
  const directory = await mkdtemp(path.join(DATA_ROOT, "test-"));
  const name = "test-limit-" + path.basename(directory) + "-" + Date.now();
  const run = runPath(name);
  try {
    const file = path.join(directory, "games.pgn");
    await writeFile(file, fixture() + fixture({ Site: "https://lichess.org/efgh5678" }));
    const report = await importFiles([file], name, { ...options, maxGap: 200 }, 1);
    assert.equal(report.accepted, 1); assert.equal(report.stoppedAtLimit, true);
    const manifest = JSON.parse(await readFile(path.join(run, "manifest.json"), "utf8"));
    assert.equal(manifest.population, "gap-diagnostic");
  } finally {
    await assertDataDirectory(directory); await assertDataDirectory(run);
    await rm(directory, { recursive: true }); await rm(run, { recursive: true });
  }
});
test("UCI parser takes the last exact score, legal root and White-view sign", () => {
  const row = observation();
  const lines = ["info depth 23 score cp 10 pv " + row.uci,
    "info depth 24 multipv 1 score cp 42 pv " + row.uci, "bestmove " + row.uci];
  assert.equal(parseEvaluation(lines, row.fen, row.uci).cpWhite, -42);
  assert.equal(parseEvaluation(lines, row.fen, row.uci).depth, 24);
  const mate = ["info depth 24 score mate -3 pv " + row.uci, "bestmove " + row.uci];
  assert.equal(parseEvaluation(mate, row.fen).mateWhite, 3);
  assert.equal(parseEvaluation(mate, row.fen).cpWhite, null);
  // A bound from the unfinished depth is skipped: the last completed depth counts.
  const stopped = [...lines.slice(0, 2), "info depth 25 score cp 90 lowerbound pv " + row.uci, "bestmove " + row.uci];
  assert.equal(parseEvaluation(stopped, row.fen, row.uci).cpWhite, -42);
  assert.throws(() => parseEvaluation(lines.map(s => s.replace(/score cp \d+/, "$& lowerbound")), row.fen), /exact/);
  // A root search stopped mid-depth reports the completed depth's move, not bestmove.
  const switched = ["info depth 24 score cp 42 pv " + row.uci, "bestmove a7a6"];
  assert.equal(parseEvaluation(switched, row.fen).uci, row.uci);
  assert.throws(() => parseEvaluation(lines, row.fen, "a7a6"), /requested/);
  assert.throws(() => parseEvaluation(["bestmove a1a8"], row.fen), /illegal/);
});
test("run output paths reject traversal", () => {
  assert.throws(() => runPath("../outside"));
  assert.throws(() => runPath("a/b"));
  assert.throws(() => runPath(""));
});
test("game record keeps the full mainline, the PGN result and how it ended", () => {
  const parsed = gameRecord(fixture({ Result: "1/2-1/2", Termination: "Normal", ECO: "D02", Opening: "Queen's Pawn Game" }));
  assert.ok("record" in parsed, JSON.stringify(parsed));
  assert.equal(parsed.record.result, "1/2-1/2");
  assert.equal(parsed.record.termination, "Normal");
  assert.equal(parsed.record.finalState, "undefined");
  assert.equal(parsed.record.eco, "D02");
  assert.equal(parsed.record.opening, "Queen's Pawn Game");
  const unlabelled = gameRecord(fixture({ Termination: "Normal" }));
  assert.ok("record" in unlabelled, JSON.stringify(unlabelled));
  assert.equal(unlabelled.record.eco, "?");
  assert.equal(unlabelled.record.opening, "?");
  assert.equal(parsed.record.sanMoves.split(" ").length, 32);
  assert.ok(parsed.record.sanMoves.startsWith("d4 d5 Nf3 Nf6"));
  assert.ok(parsed.record.uciMoves.startsWith("d2d4 d7d5 g1f3 g8f6"));
  assert.equal(parsed.record.gameDate, "2024-06-01");
  assert.deepEqual(gameRecord(fixture()), { rejected: "termination" });
  assert.deepEqual(gameRecord(fixture({ Termination: "Normal", ECO: "D02", Opening: "Queen's Pawn Game" }).replace(/0-1\n$/, "1-0\n")), { rejected: "result-mismatch" });
});
test("a checkmate or stalemate on the board must match the result", () => {
  const mate = (result: string) => `[Site "https://lichess.org/abcd1234"]\n[UTCDate "2024.06.01"]\n[WhiteElo "1800"]\n` +
    `[BlackElo "1800"]\n[Result "${result}"]\n[Termination "Normal"]\n[ECO "A00"]\n` +
    `[Opening "Barnes Opening: Fool's Mate"]\n\n1. f3 e5 2. g4 Qh4# ${result}\n`;
  const parsed = gameRecord(mate("0-1"));
  assert.ok("record" in parsed, JSON.stringify(parsed));
  assert.equal(parsed.record.finalState, "checkmate");
  assert.deepEqual(gameRecord(mate("1-0")), { rejected: "final-state-mismatch" });
  assert.deepEqual(gameRecord(mate("1/2-1/2")), { rejected: "final-state-mismatch" });
});
test("jobs split one period's groups by id and keep each group's first FEN", async () => {
  const name = "test-jobs-" + process.pid, run = runPath(name);
  await assertDataDirectory(run);
  const fen = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";
  const group = (period: string, uci: string) => ({ period, positionKey: fen.split(" ").slice(0, 4).join(" "), uci,
    fens: [fen, fen.replace(" 0 1", " 2 3")], games: 2, wins: 1, draws: 0, losses: 1, moveNumbers: { "1": 2 } });
  try {
    await writeFile(path.join(run, "groups.jsonl"),
      [group("fit", "d7d5"), group("tune", "e7e6"), group("fit", "g8f6")].map(g => JSON.stringify(g)).join("\n") + "\n");
    const report = await writeJobs(name, "fit", 1);
    assert.equal(report.jobs, 2);
    const read = async (file: string) => (await readFile(path.join(run, file), "utf8")).trim().split("\n").map(l => JSON.parse(l));
    assert.deepEqual(await read("jobs-a.jsonl"), [{ id: 1, positionKey: group("fit", "").positionKey, fen, uci: "d7d5" }]);
    assert.deepEqual((await read("jobs-b.jsonl")).map(job => [job.id, job.uci]), [[2, "g8f6"]]);
    await assert.rejects(writeJobs(name, "fit", 1));
  } finally { await rm(run, { recursive: true }); }
});
// Colab's session and result lines, as colab/he_colab.py writes them.
const session = (part: string, overrides = {}) => JSON.stringify({ type: "session", startedAt: "2026-10-12T00:00:00Z",
  engine: "Stockfish 19", archiveSha256: "9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f",
  binarySha256: "x", bench: 2497913, nodes: 2000000, hashMb: 64, threads: 1, multiPv: 1, engines: 2,
  jobs: "jobs-" + part + ".jsonl", ...overrides });
const result = (id: number, uci: string, reply: string, score: string, overrides = {}) => {
  const [kind, value] = score.split(" ");
  return JSON.stringify({ type: "result", id, uci, cp: kind === "cp" ? Number(value) : null,
    mate: kind === "mate" ? Number(value) : null, depth: 24, nodes: 2000100,
    info: "info depth 24 seldepth 30 multipv 1 score " + score + " nodes 2000100 nps 9 hashfull 1 tbhits 0 time 9 pv " + uci + " " + reply,
    bestmove: "bestmove " + uci + " ponder " + reply, ...overrides });
};
test("results join both files to their groups, flip to White's view and refuse bad input", async () => {
  const name = "test-results-" + process.pid, run = runPath(name);
  await assertDataDirectory(run);
  const fen = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";
  const group = (period: string, uci: string) => ({ period, positionKey: fen.split(" ").slice(0, 4).join(" "), uci,
    fens: [fen], games: 2, wins: 1, draws: 0, losses: 1, moveNumbers: { "1": 2 } });
  const write = (file: string, rows: string[]) => writeFile(path.join(run, file), rows.join("\n") + "\n");
  const goodA = [session("a"), result(1, "d7d5", "c2c4", "cp -15")];
  // Id 2 again after a dropped session: the same search, at another speed, is allowed.
  const goodB = [session("b"), result(2, "g8f6", "c2c4", "cp 20"), session("b"),
    result(2, "g8f6", "c2c4", "cp 20", { info: "info depth 24 seldepth 30 multipv 1 score cp 20 nodes 2000100 nps 5 hashfull 1 tbhits 0 time 50 pv g8f6 c2c4" })];
  try {
    await writeFile(path.join(run, "groups.jsonl"),
      [group("fit", "d7d5"), group("tune", "e7e6"), group("fit", "g8f6")].map(g => JSON.stringify(g)).join("\n") + "\n");
    await writeJobs(name, "fit", 1);
    for (const [rowsA, rowsB, message] of [
      [goodA, [session("b")], /lacks 1 of 1/],
      [[session("a", { nodes: 1000000 }), ...goodA.slice(1)], goodB, /nodes 1000000, expected 2000000/],
      [[session("a", { jobs: "jobs-b.jsonl" }), ...goodA.slice(1)], goodB, /jobs jobs-b.jsonl/],
      [goodA, [session("b", { binarySha256: "y" }), ...goodB.slice(1)], /2 different Stockfish binaries/],
      [[session("a"), result(1, "e7e5", "c2c4", "cp -15")], goodB, /illegal|job is d7d5/],
      [[session("a"), result(1, "d7d5", "c2c4", "cp -15", { cp: 15 })], goodB, /disagree/],
      [[...goodA, result(1, "d7d5", "c2c4", "cp -16")], goodB, /twice with different results/],
      [goodA, [session("b"), result(1, "d7d5", "c2c4", "cp -15")], /id 1 is not in jobs-b/],
      [[result(1, "d7d5", "c2c4", "cp -15")], goodB, /must start with a session/],
    ] as [string[], string[], RegExp][]) {
      await write("results-a.jsonl", rowsA); await write("results-b.jsonl", rowsB);
      await assert.rejects(importResults(name, "fit"), message);
    }
    await write("results-a.jsonl", goodA);
    await write("results-b.jsonl", [goodB[0], result(2, "g8f6", "c2c4", "mate 3")]);
    const report = await importResults(name, "fit");
    assert.deepEqual([report.groups, report.games, report.mates], [2, 4, { groups: 1, games: 2 }]);
    const rows = (await readFile(path.join(run, "evals.jsonl"), "utf8")).trim().split("\n").map(l => JSON.parse(l));
    assert.deepEqual(rows.map(row => [row.id, row.uci, row.part, row.cpWhite, row.mateWhite, row.wins]),
      [[1, "d7d5", "a", 15, null, 1], [2, "g8f6", "b", null, -3, 1]]);
    await assert.rejects(importResults(name, "fit"));
  } finally { await rm(run, { recursive: true }); }
});
test("results read a third part, c, split off from a", async () => {
  const name = "test-part-c-" + process.pid, run = runPath(name);
  await assertDataDirectory(run);
  const fen = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";
  const group = (uci: string) => JSON.stringify({ period: "fit", positionKey: fen.split(" ").slice(0, 4).join(" "), uci,
    fens: [fen], games: 1, wins: 1, draws: 0, losses: 0, moveNumbers: { "1": 1 } });
  const write = (file: string, rows: string[]) => writeFile(path.join(run, file), rows.join("\n") + "\n");
  try {
    await write("groups.jsonl", [group("d7d5"), group("g8f6"), group("e7e6")]);
    await writeJobs(name, "fit", 2);
    const [first, second] = (await readFile(path.join(run, "jobs-a.jsonl"), "utf8")).trim().split("\n");
    await write("jobs-a.jsonl", [first]); await write("jobs-c.jsonl", [second]);
    await write("results-a.jsonl", [session("a"), result(1, "d7d5", "c2c4", "cp -15")]);
    await write("results-b.jsonl", [session("b"), result(3, "e7e6", "c2c4", "cp 10")]);
    await assert.rejects(importResults(name, "fit"), /results-c.jsonl/);
    await write("results-c.jsonl", [session("c"), result(2, "g8f6", "c2c4", "cp 20")]);
    await importResults(name, "fit");
    const rows = (await readFile(path.join(run, "evals.jsonl"), "utf8")).trim().split("\n").map(l => JSON.parse(l));
    assert.deepEqual(rows.map(row => [row.id, row.part, row.cpWhite]), [[1, "a", 15], [2, "c", -20], [3, "b", -10]]);
  } finally { await rm(run, { recursive: true }); }
});
test("jobs skip groups an earlier run searched, and results take those evals from it", async () => {
  const earlier = "test-reuse-feb-" + process.pid, later = "test-reuse-mar-" + process.pid;
  const fen = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";
  const group = (uci: string, clocks = " 0 1") => JSON.stringify({ period: "fit", positionKey: fen.split(" ").slice(0, 4).join(" "), uci,
    fens: [fen.replace(" 0 1", clocks)], games: 2, wins: 1, draws: 0, losses: 1, moveNumbers: { "1": 2 } });
  const write = (name: string, file: string, rows: string[]) => writeFile(path.join(runPath(name), file), rows.join("\n") + "\n");
  const read = async (file: string) => (await readFile(path.join(runPath(later), file), "utf8")).trim().split("\n").map(l => JSON.parse(l));
  try {
    for (const name of [earlier, later]) await assertDataDirectory(runPath(name));
    await write(earlier, "groups.jsonl", [group("d7d5"), group("g8f6")]);
    await writeJobs(earlier, "fit", 1);
    await write(earlier, "results-a.jsonl", [session("a"), result(1, "d7d5", "c2c4", "cp -15")]);
    await write(earlier, "results-b.jsonl", [session("b"), result(2, "g8f6", "c2c4", "cp 20")]);
    // d7d5 here has other clocks: still the same group for the eval.
    await write(later, "groups.jsonl", [group("e7e6"), group("d7d5", " 2 3"), group("g8f6"), group("c7c5")]);
    await assert.rejects(writeJobs(later, "fit", 1, [earlier]), /has no evals.jsonl/);
    await importResults(earlier, "fit");
    const report = await writeJobs(later, "fit", 1, [earlier]);
    assert.deepEqual([report.groups, report.jobs, report.a, report.b, report.reused],
      [4, 2, { ids: "1-1", jobs: 1 }, { ids: "4-4", jobs: 1 }, { from: [earlier], groups: 2 }]);
    assert.deepEqual((await read("jobs-reused.jsonl")).map(job => [job.id, job.uci, job.from]),
      [[2, "d7d5", { run: earlier, part: "a", id: 1 }], [3, "g8f6", { run: earlier, part: "b", id: 2 }]]);
    await write(later, "results-a.jsonl", [session("a"), result(1, "e7e6", "c2c4", "cp 5")]);
    await write(later, "results-b.jsonl", [session("b", { binarySha256: "y" }), result(4, "c7c5", "c2c4", "cp 30")]);
    await assert.rejects(importResults(later, "fit"), /2 different Stockfish binaries/);
    await write(later, "results-b.jsonl", [session("b"), result(4, "c7c5", "c2c4", "cp 30")]);
    const imported = await importResults(later, "fit");
    assert.deepEqual([imported.groups, imported.reused], [4, { groups: 2, games: 4 }]);
    assert.deepEqual((await read("evals.jsonl")).map(row => [row.id, row.uci, row.part, row.cpWhite, row.from]), [
      [1, "e7e6", "a", -5, undefined], [2, "d7d5", "a", 15, { run: earlier, part: "a", id: 1 }],
      [3, "g8f6", "b", -20, { run: earlier, part: "b", id: 2 }], [4, "c7c5", "b", -30, undefined]]);
  } finally { for (const name of [earlier, later]) await rm(runPath(name), { recursive: true }); }
});
test("the curve fit finds the chances it was given, and the spline is straight beyond its outer knots", () => {
  const knots = [-6, -2, 0, 2, 6];
  const truth = [-0.1, 0.15, 0.3, 0.02, -0.05, 0.01];
  // Counts exactly in proportion to the true chances: the best fit is the truth itself.
  const groups = Array.from({ length: 81 }, (_, i) => -1000 + 25 * i).map(cp => {
    const c = chances(truth, knots, cp);
    return { basis: basis(Math.max(-10, Math.min(10, cp / 100)), knots), losses: 1000 * c.loss, draws: 1000 * c.draw, wins: 1000 * c.win };
  });
  const fitted = fit(groups, knots);
  fitted.params.forEach((value, j) => assert.ok(Math.abs(value - truth[j]) < 1e-4, "param " + j + ": " + value));
  const c = chances(truth, knots, 150);
  assert.ok(Math.abs(c.win + c.draw + c.loss - 1) < 1e-12 && c.loss > chances(truth, knots, 0).loss);
  const at = (x: number) => basis(x, knots).slice(1);
  for (const x of [7, -7]) at(x).forEach((value, j) => assert.ok(Math.abs(at(x + 1)[j] - 2 * value + at(x - 1)[j]) < 1e-9));
});
test("k fit finds the scatter it was given, and none where there is none", () => {
  for (const [x, expected] of [[1, 0], [5, Math.log(24)], [0.5, Math.log(Math.sqrt(Math.PI))], [100.5, 361.4355404677776], [0.01, 4.599479878042022]])
    assert.ok(Math.abs(logGamma(x) - expected) < 1e-9, "logGamma " + x);
  const next = random("k-test");
  const normal = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  // Marsaglia and Tsang; shape < 1 is lifted by one and scaled back.
  const gamma = (shape: number): number => {
    if (shape < 1) return gamma(shape + 1) * Math.pow(next(), 1 / shape);
    const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const z = normal(), v = (1 + c * z) ** 3;
      if (v > 0 && Math.log(next()) < z * z / 2 + d - d * v + d * Math.log(v)) return d * v;
    }
  };
  const groups = (k: number | null): KGroup[] => Array.from({ length: 3000 }, (_, i) => {
    const centre = i % 2 ? [0.45, 0.06, 0.49] : [0.3, 0.05, 0.65];
    const draws = centre.map(p => k === null ? p : gamma(k * p));
    const chances = draws.map(value => value / draws.reduce((sum, d) => sum + d, 0));
    const counts = [0, 0, 0];
    for (let n = 0; n < 2 + (i % 20); n++) { const u = next(); counts[u < chances[0] ? 0 : u < chances[0] + chances[1] ? 1 : 2]++; }
    return { counts, centre };
  });
  const scattered = fitK(groups(30));
  assert.ok(scattered.range[0]! < 30 && 30 < scattered.range[1]!, JSON.stringify(scattered));
  const none = fitK(groups(null));
  assert.ok(none.range[1] === null && none.k > 200, JSON.stringify(none));
});
test("pool adds up the same position and move across runs, and refuses doubtful input", async () => {
  const [feb, mar, pool] = ["feb", "mar", "pool"].map(name => "test-pool-" + name + "-" + process.pid);
  const row = observation();
  const group = (uci: string, games: number, extra = {}) => ({ id: 1, period: "fit", positionKey: row.positionKey, uci, fens: [row.fen],
    games, wins: games, draws: 0, losses: 0, moveNumbers: { [row.moveNumber]: games }, part: "a", cpWhite: -35, mateWhite: null,
    depth: 24, nodes: 2000000, ...extra });
  const write = (name: string, file: string, rows: object[]) =>
    writeFile(path.join(runPath(name), file), rows.map(r => JSON.stringify(r)).join("\n") + "\n");
  try {
    for (const name of [feb, mar]) await assertDataDirectory(runPath(name));
    await write(feb, "evals.jsonl", [group(row.uci, 1)]);
    await write(feb, "observations.jsonl", [row]);
    // March's search of the same group is February's, reused.
    await write(mar, "evals.jsonl", [group(row.uci, 2, { id: 4, part: "b", from: { run: feb, part: "a", id: 1 } }),
      group("a7a6", 1, { id: 5, cpWhite: 10 })]);
    await write(mar, "observations.jsonl", [row]);
    await assert.rejects(poolRuns(pool, [feb, mar]), /is in an earlier run too/);
    const other = { ...row, gameId: "efgh5678" }, third = { ...row, gameId: "ijkl9012", uci: "a7a6" };
    await write(mar, "observations.jsonl", [other, { ...other, gameId: "mnop3456" }, third]);
    const report = await poolRuns(pool, [feb, mar]);
    assert.deepEqual([report.groups, report.games, report.repeated], [2, 4, 1]);
    const rows = (await readFile(path.join(runPath(pool), "evals.jsonl"), "utf8")).trim().split("\n").map(l => JSON.parse(l));
    assert.deepEqual(rows.map(r => [r.id, r.uci, r.games, r.wins, r.from]),
      [[1, row.uci, 3, 3, { run: feb, part: "a", id: 1 }], [2, "a7a6", 1, 1, { run: mar, part: "a", id: 5 }]]);
    const games = await sampledMoves(pool);
    assert.deepEqual(games.map(g => [g.gameId, g.searchRun, g.groupGames]),
      [[row.gameId, feb, 3], ["efgh5678", feb, 3], ["mnop3456", feb, 3], ["ijkl9012", mar, 1]]);
    await assert.rejects(poolRuns(pool, [feb, mar]));
    await rm(runPath(pool), { recursive: true });
    await write(mar, "evals.jsonl", [group(row.uci, 2, { cpWhite: -36 })]);
    await assert.rejects(poolRuns(pool, [feb, mar]), /another eval/);
  } finally { for (const name of [feb, mar, pool]) await rm(runPath(name), { recursive: true, force: true }); }
});
test("k trend fit finds a k that falls with the move, and a flat one", () => {
  const next = random("k-trend-test");
  const normal = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  const gamma = (shape: number): number => {
    if (shape < 1) return gamma(shape + 1) * Math.pow(next(), 1 / shape);
    const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const z = normal(), v = (1 + c * z) ** 3;
      if (v > 0 && Math.log(next()) < z * z / 2 + d - d * v + d * Math.log(v)) return d * v;
    }
  };
  const groups = (k: (move: number) => number) => new Map(Array.from({ length: 7 }, (_, i) => i + 2).map(move =>
    [move, Array.from({ length: 1500 }, (_, i): KGroup => {
      const centre = i % 2 ? [0.45, 0.06, 0.49] : [0.3, 0.05, 0.65];
      const draws = centre.map(p => gamma(k(move) * p));
      const chances = draws.map(value => value / draws.reduce((sum, d) => sum + d, 0));
      const counts = [0, 0, 0];
      for (let n = 0; n < 5 + (i % 40); n++) { const u = next(); counts[u < chances[0] ? 0 : u < chances[0] + chances[1] ? 1 : 2]++; }
      return { counts, centre };
    })]));
  const inside = (value: number, range: (number | null)[]) => (range[0] ?? 0) < value && value < (range[1] ?? Infinity);
  const falling = fitKTrend(groups(move => 60 * 0.6 ** (move - 2)));
  // The check fails 1 time in 20 on a true trend, as this sample shows (12.6 against 11.07);
  // other samples gave 0.5 to 5.3. A step is far beyond it.
  assert.ok(inside(60, falling.k2.range) && inside(0.6, falling.r.range) && falling.check.chiSquare < 15, JSON.stringify(falling));
  const step = fitKTrend(groups(move => move <= 4 ? 200 : 10));
  assert.ok(!step.check.holds && step.check.chiSquare > 50, JSON.stringify(step.check));
  const move5 = falling.moves.find(row => row.move === 5)!;
  assert.ok(inside(60 * 0.6 ** 3, move5.range) && move5.groups === 1500, JSON.stringify(move5));
  const flat = fitKTrend(groups(() => 20));
  assert.ok(inside(1, flat.r.range) && inside(20, flat.k2.range), JSON.stringify(flat));
});
test("the selector switches only on strong evidence, within the cp limit (HES.40)", async () => {
  // A made-up curve: Black scores 50% at 0 and about 1.3 points less per 10 cp, with 6% draws.
  const curve: Curve = cp => { const s = 0.5 - cp / 750; return { win: s - 0.03, draw: 0.06, loss: 1 - s - 0.03, score: s }; };
  const record = (games: number, score: number) => {
    const draws = Math.round(games * 0.06), wins = Math.round(games * score - draws / 2);
    return { wins, draws, losses: games - wins - draws };
  };
  const evaluation = (cpWhite: number | null, mateWhite: number | null = null) => async () => ({ uci: "x", depth: 20, cpWhite, mateWhite });
  const never = async (): Promise<never> => { throw new Error("searched a contender that could not pass"); };
  const champion = (cpWhite: number, games: number, score: number, k: number) =>
    ({ cpWhite, draws: scoreDraws(curve, cpWhite, k, record(games, score), DIALS.draws, "champion") });
  // The worked example: champion at +30 with 500 games at 47%; contender at +50, k = 80.
  const a = champion(30, 500, 0.47, 80);
  const strong = await judge({ uci: "b", san: "B", record: record(600, 0.54) }, a, curve, 80, DIALS, "b", evaluation(50));
  // With 200 games it can't pass even at the champion's prior, so it isn't searched.
  const weak = await judge({ uci: "b", san: "B", record: record(200, 0.54) }, a, curve, 80, DIALS, "b", never);
  assert.deepEqual([strong.verdict, weak.verdict], ["passes", "best-case"], JSON.stringify([strong, weak]));
  assert.ok(strong.safeGain! > 0.01 && strong.cpLoss === 20 &&
    safeGain(scoreDraws(curve, 50, 80, record(200, 0.54), DIALS.draws, "b"), a.draws, DIALS.confidence).safe < 0.01);
  // Nd7, 3 games at 33%, against Bg7, 142 games at 44%.
  const bg7 = champion(0, 142, 0.44, 80);
  const nd7 = await judge({ uci: "d", san: "Nd7", record: { wins: 1, draws: 0, losses: 2 } }, bg7, curve, 80, DIALS, "d", evaluation(20));
  assert.notEqual(nd7.verdict, "passes");
  // No chance even in its best case: dropped without a search, and its full search fails too.
  const big = champion(0, 142, 0.44, 2000);
  const few = { uci: "f", san: "F", record: { wins: 2, draws: 0, losses: 0 } };
  const poor = { uci: "p", san: "P", record: record(5000, 0.42) };
  for (const move of [few, poor]) {
    assert.equal((await judge(move, big, curve, 2000, DIALS, "f", never)).verdict, "best-case");
    assert.ok(!couldPass(curve, 0, big.draws, 2000, move.record, DIALS, "f") &&
      safeGain(scoreDraws(curve, 10, 2000, move.record, DIALS.draws, "f"), big.draws, DIALS.confidence).safe <= DIALS.margin);
  }
  // A contender the 2M search rates above the champion gets no better prior than the champion's.
  const better = await judge({ uci: "b", san: "B", record: record(600, 0.54) }, bg7, curve, 80, DIALS, "b", evaluation(-60));
  assert.ok(better.verdict === "passes" && better.priorScore === curve(0).score && better.cpLoss === -60, JSON.stringify(better));
  // Beyond the cp limit, or a mate: no switch, whatever the games say.
  assert.equal((await judge({ uci: "b", san: "B", record: record(3000, 0.6) }, a, curve, 80, DIALS, "b", evaluation(70))).verdict, "cp-limit");
  assert.equal((await judge({ uci: "b", san: "B", record: record(600, 0.54) }, a, curve, 80, DIALS, "b", evaluation(null, -3))).verdict, "mate");
  // Choice: the highest safe gain; within 0.5 points, the better eval.
  const passing = (san: string, safe: number, cpWhite: number) => ({ uci: san, san, games: 1, score: 1, verdict: "passes" as const, safeGain: safe, cpWhite });
  assert.equal(choose([passing("X", 0.03, 40), passing("Y", 0.05, 45)], DIALS)?.san, "Y");
  assert.equal(choose([passing("X", 0.048, 40), passing("Y", 0.05, 45)], DIALS)?.san, "X");
  assert.equal(choose([{ ...passing("X", 0.03, 40), verdict: "safe-gain" }], DIALS), null);
});
test("each game gets its group's eval, and a game without one is refused", async () => {
  const name = "test-dots-" + process.pid, run = runPath(name);
  await assertDataDirectory(run);
  const row = observation();
  const group = { id: 7, period: row.period, positionKey: row.positionKey, uci: row.uci, fens: [row.fen], games: 1,
    wins: 1, draws: 0, losses: 0, moveNumbers: { [row.moveNumber]: 1 }, part: "b", cpWhite: -35, mateWhite: null, depth: 24, nodes: 2000000 };
  try {
    await writeFile(path.join(run, "observations.jsonl"), JSON.stringify(row) + "\n");
    await writeFile(path.join(run, "evals.jsonl"), JSON.stringify(group) + "\n");
    const [game] = await sampledMoves(name);
    assert.deepEqual([game.gameId, game.groupId, game.results, game.cpWhite, game.mateWhite, game.outcome], [row.gameId, 7, "b", -35, null, "wins"]);
    // A reused search lies in the earlier run, under its id there.
    await writeFile(path.join(run, "evals.jsonl"), JSON.stringify({ ...group, part: "a", from: { run: "2024-02-3000mb", part: "a", id: 3 } }) + "\n");
    const [reused] = await sampledMoves(name);
    assert.deepEqual([reused.groupId, reused.results, reused.searchRun], [3, "a", "2024-02-3000mb"]);
    await writeFile(path.join(run, "evals.jsonl"), JSON.stringify({ ...group, uci: "a7a6" }) + "\n");
    await assert.rejects(sampledMoves(name), /has no eval/);
  } finally { await rm(run, { recursive: true }); }
});
test("the Explorer walk writes Black's moves as groups and follows only big moves (HEK)", async () => {
  const fenAfter = (...sans: string[]) => { const chess = new Chess(); for (const san of sans) chess.move(san); return chess.fen(); };
  const key = (fen: string) => fen.split(" ").slice(0, 4).join(" ");
  const move = (san: string, white: number, draws: number, black: number) => ({ uci: "?", san, white, draws, black });
  const answer = (...moves: ReturnType<typeof move>[]): ExplorerAnswer => ({ moves,
    white: moves.reduce((s, m) => s + m.white, 0), draws: moves.reduce((s, m) => s + m.draws, 0), black: moves.reduce((s, m) => s + m.black, 0) });
  const answers = new Map([
    [key(fenAfter("d4", "d5")), answer(move("c4", 2000, 1000, 2000), move("Nf3", 200, 100, 200))],
    [key(fenAfter("d4", "d5", "c4")), answer(move("e6", 1000, 500, 1500), move("dxc4", 500, 500, 500), move("Nh6", 1, 0, 0))],
    [key(fenAfter("d4", "d5", "c4", "e6")), answer(move("Nc3", 800, 400, 800))],
    [key(fenAfter("d4", "d5", "c4", "e6", "Nc3")), answer(move("Nf6", 700, 600, 700))],
    [key(fenAfter("d4", "d5", "c4", "dxc4")), answer()],
    [key(fenAfter("e4", "c6")), answer()],
  ]);
  const asked: string[] = [], urls: string[] = [];
  const fetcher = async (url: string) => {
    urls.push(url);
    const fen = new URL(url).searchParams.get("fen")!;
    asked.push(fen);
    const found = answers.get(key(fen));
    if (!found) throw new Error("asked an unexpected position: " + fen);
    return found;
  };
  const cache = await mkdtemp(path.join(DATA_ROOT, "test-explorer-cache-"));
  const names = ["first", "again", "capped", "deep", "sample", "sample-one", "sample-two"].map(n => "test-explorer-" + n + "-" + process.pid);
  const options = { base: "http://proxy/lichess", follow: 1000, calls: 50, minGroup: 2, lastMove: 3, cache };
  try {
    const first = await walkExplorer(names[0], options, fetcher);
    assert.deepEqual([first.calls, first.positions, first.groups, first.stoppedAtCap], [6, 6, 3, false]);
    const url = new URL(urls[0]);
    assert.deepEqual([url.origin + url.pathname, url.searchParams.get("ratings"), url.searchParams.get("since"), url.searchParams.get("until")],
      ["http://proxy/lichess/lichess", "1600,1800,2000", "2023-01", "2024-12"]);
    const groups = (await readFile(path.join(runPath(names[0]), "groups.jsonl"), "utf8")).trim().split("\n").map(l => JSON.parse(l));
    // Black's view: Black's wins are wins. Nh6 has one game, so it is no group.
    assert.deepEqual(groups.map(g => [g.uci, g.games, g.wins, g.losses, g.moveNumbers]),
      [["e7e6", 3000, 1500, 1000, { "2": 3000 }], ["d5c4", 1500, 500, 500, { "2": 1500 }], ["g8f6", 2000, 700, 700, { "3": 2000 }]]);
    assert.deepEqual(first.byMove["2"], { groups: 2, games: 4500, "2-9": 0, "10-49": 0, "50-199": 0, "200-999": 0, "1000+": 2 });
    // Nf3 (500 games) is not followed; after Black's move 3 the walk stops.
    assert.ok(!asked.some(fen => key(fen) === key(fenAfter("d4", "d5", "Nf3"))));
    // A rerun takes every answer from the cache and asks nothing.
    const again = await walkExplorer(names[1], options, async () => { throw new Error("called the Explorer"); });
    assert.deepEqual([again.calls, again.cached, again.groups], [0, 6, 3]);
    // The call cap stops the walk and says so.
    const capped = await walkExplorer(names[2], { ...options, cache: cache + "-capped", calls: 2 }, fetcher);
    assert.deepEqual([capped.calls, capped.stoppedAtCap], [2, true]);
    // From move 3 on only: Nf3 (500 games) is now followed, but its move-2 position is not in the cache, so it is skipped.
    const deep = await walkExplorer(names[3], { ...options, follow: 500, askFrom: 3 }, async () => { throw new Error("called the Explorer"); });
    assert.deepEqual([deep.calls, deep.skipped, deep.cached], [0, 1, 6]);
    await assert.rejects(walkExplorer(names[0], options, fetcher));
    // The sample keeps groups of 1,600+ games: dxc4 (1,500) is left out.
    const sample = await sampleGroups(names[4], names[0], 1600, 5);
    assert.deepEqual([sample.groups, sample.byMove["2"], sample.byMove["3"]], [2, { eligible: 1, chosen: 1, games: 3000 }, { eligible: 1, chosen: 1, games: 2000 }]);
    const sampled = (await readFile(path.join(runPath(names[4]), "groups.jsonl"), "utf8")).trim().split("\n").map(l => JSON.parse(l).uci);
    assert.deepEqual(sampled, ["e7e6", "g8f6"]);
    // At most one per move, and the same one every time.
    const [one, two] = [await sampleGroups(names[5], names[0], 2, 1), await sampleGroups(names[6], names[0], 2, 1)];
    assert.deepEqual([one.groups, one.byMove["2"].eligible, one.byMove["2"].chosen], [2, 2, 1]);
    assert.deepEqual(two.byMove, one.byMove);
    assert.equal(await readFile(path.join(runPath(names[6]), "groups.jsonl"), "utf8"), await readFile(path.join(runPath(names[5]), "groups.jsonl"), "utf8"));
    await assert.rejects(sampleGroups(names[5], names[0], 2, 1));
  } finally {
    for (const name of names) await rm(runPath(name), { recursive: true, force: true });
    await rm(cache, { recursive: true }); await rm(cache + "-capped", { recursive: true, force: true });
  }
});
