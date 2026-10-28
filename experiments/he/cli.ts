import { parseArgs } from "node:util";
import { importFiles } from "./import";
import { downloadRun, filterDownloaded } from "./download";
import { evaluateRun } from "./evaluate";
import { writeJobs } from "./jobs";
import { importResults, recheckGame, recheckResults } from "./results";
import { writeCurve } from "./curve";
import { writeK } from "./scatter";
import type { Period } from "./types";
import { resolveInputPath } from "./paths";
import { checkConnection, loadGames, loadSampledMoves } from "./db";
import { writeDots } from "./dots";
import { poolRuns } from "./pool";
import { selectMoves } from "./select";
import path from "node:path";
import { DATA_ROOT, runPath } from "./paths";

const HELP = String.raw`Human evidence pilot
  npm --prefix experiments/he run download -- --run 2024-01-2500mb --month 2024-01 --gb 2.5 --limit 50000
  npm --prefix experiments/he run filter -- --run 2024-01-2500mb
  npm --prefix experiments/he run import -- --run pilot-50k --limit 50000 file.pgn [other.pgn.gz]
  npm --prefix experiments/he run evaluate -- --run pilot-50k --engine <stockfish-19-binary> [--period fit] [--limit 5]
  npm --prefix experiments/he run jobs -- --run 2024-03-3000mb [--period fit] [--split 20000] [--reuse 2024-02-3000mb ...]
  npm --prefix experiments/he run results -- --run 2024-02-3000mb [--period fit]
  npm --prefix experiments/he run recheck -- --run 2024-02-3000mb --engine <stockfish-19-binary> [--count 20 | --game g8gCaNm4]
  npm --prefix experiments/he run pool -- --run 2024-02-03 --from 2024-02-3000mb --from 2024-03-3000mb
  npm --prefix experiments/he run curve -- --run 2024-02-3000mb
  npm --prefix experiments/he run k -- --run 2024-02-3000mb
  npm --prefix experiments/he run dots -- --run 2024-02-3000mb
  npm --prefix experiments/he run select -- --run tree-low --pool 2024-02-03 --k low --engine <stockfish-19-binary> [--db prisma/dev.db]
  npm --prefix experiments/he run db-check
  npm --prefix experiments/he run load -- --run 2024-01-2500mb [--limit 100]
  npm --prefix experiments/he run load-moves -- --run 2024-02-3000mb

Import: --seed he-v1 (default), --max-gap 100 (default) or 200 (diagnostic).
Periods: fit (2023-24), tune (2025), test (2026).
Input and engine paths are relative to the terminal directory where you launch npm.
All outputs live in experiments/he/data/. Existing run/results names are protected.
Load copies a download's sample.pgn into the MySQL games table; repeating it is safe.
Load-moves copies each game's sampled move and its eval into the MySQL sampled_moves table; repeating it is safe.
Dots writes dots.html into the run's folder: every game as a dot, eval against result; open it in a browser.
Jobs writes the groups as Colab search jobs: the first --split in jobs-a.jsonl, the rest in jobs-b.jsonl.
With --reuse, groups a finished earlier run has searched go to jobs-reused.jsonl instead; results takes their evals from that run.
Results checks results-a.jsonl and results-b.jsonl against their jobs and writes evals.jsonl: each group with its eval.
Recheck searches --count random jobs from each results file again here; they must match exactly.
With --game it searches that one game's position afresh and prints the Colab line above the local one.
Pool joins finished runs into one: groups with the same position and move add up. Curve, k and dots run on it.
Curve fits eval → Black's win/draw/loss on evals.jsonl and writes curve.json and curve.svg.
K fits the scatter around the curve on groups with 2+ games, overall and by size, eval and move, into k.json.
It also fits k as a trend, k(move) = k2 × r^(move − 2), giving a k for every move.
Select runs the HE selector over the app's tree (read-only): for each position with Black to move, the
tree's move stays unless another move's games prove it better (HES). --k low or best picks k from the pool's trend.
Input supports .pgn and .pgn.gz. Decompress Lichess .pgn.zst exports first.
`;
async function main() {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "help") { console.log(HELP); return; }
  const parsed = parseArgs({ args: process.argv.slice(3), allowPositionals: true, options: {
    run: { type: "string" }, seed: { type: "string" }, "max-gap": { type: "string" },
    month: { type: "string" }, gb: { type: "string" }, limit: { type: "string" }, engine: { type: "string" }, period: { type: "string" }, split: { type: "string" }, reuse: { type: "string", multiple: true }, from: { type: "string", multiple: true }, pool: { type: "string" }, k: { type: "string" }, db: { type: "string" }, count: { type: "string" }, game: { type: "string" }, help: { type: "boolean" },
  } });
  const { values, positionals } = parsed;
  if (values.help) { console.log(HELP); return; }
  if (command === "db-check") { console.log(JSON.stringify(await checkConnection(), null, 2)); return; }
  if (!values.run) throw new Error("--run is required.");
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit must be a positive integer.");
  if (command !== "download" && (values.month || values.gb)) throw new Error("--month and --gb belong to download.");
  if (command !== "jobs" && values.reuse) throw new Error("--reuse belongs to jobs.");
  if (command !== "pool" && values.from) throw new Error("--from belongs to pool.");
  if (command !== "select" && (values.pool || values.k || values.db)) throw new Error("--pool, --k and --db belong to select.");
  if (command === "download") {
    if (positionals.length || values.engine || values.period) throw new Error("Download takes --month and --gb, not input paths or engine options.");
    if (!values.month || !values.gb) throw new Error("Download requires --month YYYY-MM and --gb (e.g. 2.5).");
    const gap = Number(values["max-gap"] ?? 100);
    if (gap !== 100 && gap !== 200) throw new Error("--max-gap must be 100 or 200.");
    console.log(JSON.stringify(await downloadRun(values.run, values.month, Number(values.gb),
      { seed: values.seed ?? "he-v1", maxGap: gap }, limit), null, 2));
  } else if (command === "filter") {
    if (positionals.length || values.month || values.gb || values.limit || values.seed || values["max-gap"] || values.engine || values.period)
      throw new Error("Filter takes only --run; it reuses that download's archive and recorded options.");
    console.log(JSON.stringify(await filterDownloaded(values.run), null, 2));
  } else if (command === "import") {
    if (values.engine || values.period) throw new Error("--engine and --period belong to evaluate.");
    const gap = Number(values["max-gap"] ?? 100);
    if (gap !== 100 && gap !== 200) throw new Error("--max-gap must be 100 or 200.");
    console.log(JSON.stringify(await importFiles(positionals.map(file => resolveInputPath(file)), values.run, { seed: values.seed ?? "he-v1", maxGap: gap }, limit), null, 2));
  } else if (command === "load") {
    if (positionals.length || values.month || values.gb || values.seed || values["max-gap"] || values.engine || values.period)
      throw new Error("Load takes only --run and --limit.");
    runPath(values.run);
    console.log(JSON.stringify(await loadGames(path.join(DATA_ROOT, "downloads", values.run, "sample.pgn"), limit), null, 2));
  } else if (command === "jobs") {
    if (positionals.length || values.seed || values["max-gap"] || values.engine || values.limit)
      throw new Error("Jobs takes only --run, --period, --split and --reuse.");
    const period = values.period ?? "fit";
    if (!["fit", "tune", "test"].includes(period)) throw new Error("--period must be fit, tune or test.");
    console.log(JSON.stringify(await writeJobs(values.run, period as Period, Number(values.split ?? 20000), values.reuse), null, 2));
  } else if (command === "results") {
    if (positionals.length || values.seed || values["max-gap"] || values.engine || values.limit || values.split || values.count)
      throw new Error("Results takes only --run and --period.");
    const period = values.period ?? "fit";
    if (!["fit", "tune", "test"].includes(period)) throw new Error("--period must be fit, tune or test.");
    console.log(JSON.stringify(await importResults(values.run, period as Period), null, 2));
  } else if (command === "pool") {
    if (positionals.length || values.seed || values["max-gap"] || values.engine || values.limit || values.split || values.count || values.period)
      throw new Error("Pool takes only --run and two or more --from.");
    console.log(JSON.stringify(await poolRuns(values.run, values.from ?? []), null, 2));
  } else if (command === "select") {
    if (!values.engine || !values.pool || (values.k !== "low" && values.k !== "best"))
      throw new Error("Select needs --engine, --pool and --k low or --k best.");
    if (positionals.length || values.seed || values["max-gap"] || values.limit || values.split || values.count || values.period)
      throw new Error("Select takes only --run, --pool, --k, --engine and --db.");
    console.log(JSON.stringify(await selectMoves(values.run, values.pool, values.k, resolveInputPath(values.engine),
      values.db ? resolveInputPath(values.db) : undefined), null, 2));
  } else if (command === "curve") {
    if (positionals.length || values.seed || values["max-gap"] || values.engine || values.limit || values.split || values.count || values.period)
      throw new Error("Curve takes only --run.");
    console.log(JSON.stringify(await writeCurve(values.run), null, 2));
  } else if (command === "dots" || command === "load-moves") {
    if (positionals.length || values.seed || values["max-gap"] || values.engine || values.limit || values.split || values.count || values.period)
      throw new Error("Dots and load-moves take only --run.");
    runPath(values.run);
    console.log(JSON.stringify(command === "dots" ? await writeDots(values.run) : await loadSampledMoves(values.run), null, 2));
  } else if (command === "k") {
    if (positionals.length || values.seed || values["max-gap"] || values.engine || values.limit || values.split || values.count || values.period)
      throw new Error("K takes only --run.");
    console.log(JSON.stringify(await writeK(values.run), null, 2));
  } else if (command === "recheck") {
    if (!values.engine) throw new Error("--engine is required; point to a Stockfish 19 binary.");
    if (positionals.length || values.seed || values["max-gap"] || values.limit || values.split || values.period || (values.game && values.count))
      throw new Error("Recheck takes only --run, --engine, and --count or --game.");
    if (values.game) {
      const check = await recheckGame(values.run, resolveInputPath(values.engine), values.game);
      if (!check.same) process.exitCode = 1;
    } else console.log(JSON.stringify(await recheckResults(values.run, resolveInputPath(values.engine), Number(values.count ?? 20)), null, 2));
  } else if (command === "evaluate") {
    if (!values.engine) throw new Error("--engine is required; point to a Stockfish 19 binary.");
    if (positionals.length || values.seed || values["max-gap"]) throw new Error("Evaluate uses the import run's inputs and filters.");
    const period = values.period ?? "fit";
    if (!["fit", "tune", "test"].includes(period)) throw new Error("--period must be fit, tune or test.");
    console.log(JSON.stringify(await evaluateRun(values.run, resolveInputPath(values.engine), period as Period, limit), null, 2));
  } else throw new Error("Unknown command: " + command);
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
