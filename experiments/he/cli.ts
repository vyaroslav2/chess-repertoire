import { parseArgs } from "node:util";
import { importFiles } from "./import";
import { downloadRun, filterDownloaded } from "./download";
import { evaluateRun } from "./evaluate";
import type { Period } from "./types";
import { resolveInputPath } from "./paths";

const HELP = String.raw`Human evidence pilot
  npm --prefix experiments/he run download -- --run fit-50k --month 2024-01 --gb 2.5 --limit 50000
  npm --prefix experiments/he run filter -- --run fit-50k
  npm --prefix experiments/he run import -- --run pilot-50k --limit 50000 file.pgn [other.pgn.gz]
  npm --prefix experiments/he run evaluate -- --run pilot-50k --engine <stockfish-19-binary> [--period fit] [--limit 5]

Import: --seed he-v1 (default), --max-gap 100 (default) or 200 (diagnostic).
Periods: fit (2023-24), tune (2025), test (2026).
Input and engine paths are relative to the terminal directory where you launch npm.
All outputs live in experiments/he/data/. Existing run/results names are protected.
Input supports .pgn and .pgn.gz. Decompress Lichess .pgn.zst exports first.
`;
async function main() {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "help") { console.log(HELP); return; }
  const parsed = parseArgs({ args: process.argv.slice(3), allowPositionals: true, options: {
    run: { type: "string" }, seed: { type: "string" }, "max-gap": { type: "string" },
    month: { type: "string" }, gb: { type: "string" }, limit: { type: "string" }, engine: { type: "string" }, period: { type: "string" }, help: { type: "boolean" },
  } });
  const { values, positionals } = parsed;
  if (values.help) { console.log(HELP); return; }
  if (!values.run) throw new Error("--run is required.");
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit must be a positive integer.");
  if (command !== "download" && (values.month || values.gb)) throw new Error("--month and --gb belong to download.");
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
  } else if (command === "evaluate") {
    if (!values.engine) throw new Error("--engine is required; point to a Stockfish 19 binary.");
    if (positionals.length || values.seed || values["max-gap"]) throw new Error("Evaluate uses the import run's inputs and filters.");
    const period = values.period ?? "fit";
    if (!["fit", "tune", "test"].includes(period)) throw new Error("--period must be fit, tune or test.");
    console.log(JSON.stringify(await evaluateRun(values.run, resolveInputPath(values.engine), period as Period, limit), null, 2));
  } else throw new Error("Unknown command: " + command);
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
