import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { Chess } from "chess.js";
import { selectObservation, readGames, gameRecord } from "../pgn";
import { importFiles, groupObservations } from "../import";
import { parseEvaluation } from "../engine";
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
test("UCI parser enforces d24, exact bounds, legal root and White-view sign", () => {
  const row = observation();
  const lines = ["info depth 23 score cp 10 pv " + row.uci,
    "info depth 24 multipv 1 score cp 42 pv " + row.uci, "bestmove " + row.uci];
  assert.equal(parseEvaluation(lines, row.fen, row.uci).cpWhite, -42);
  const mate = ["info depth 24 score mate -3 pv " + row.uci, "bestmove " + row.uci];
  assert.equal(parseEvaluation(mate, row.fen).mateWhite, 3);
  assert.equal(parseEvaluation(mate, row.fen).cpWhite, null);
  assert.throws(() => parseEvaluation(lines.map(s => s.replace("depth 24", "depth 23")), row.fen), /depth-24/);
  assert.throws(() => parseEvaluation(lines.map(s => s.replace("score cp 42", "score cp 42 lowerbound")), row.fen), /depth-24/);
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
  assert.deepEqual(gameRecord(fixture({ Termination: "Normal", ECO: "?", Opening: "?" })), { rejected: "opening-header" });
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
