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
import { basis, chances, fit } from "../curve";
import { DATA_ROOT, assertDataDirectory, runPath } from "../paths";
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
test("results join both files to their groups, flip to White's view and refuse bad input", async () => {
  const name = "test-results-" + process.pid, run = runPath(name);
  await assertDataDirectory(run);
  const fen = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";
  const group = (period: string, uci: string) => ({ period, positionKey: fen.split(" ").slice(0, 4).join(" "), uci,
    fens: [fen], games: 2, wins: 1, draws: 0, losses: 1, moveNumbers: { "1": 2 } });
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
