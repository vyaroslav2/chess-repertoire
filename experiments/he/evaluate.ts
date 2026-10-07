import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { HeEngine } from "./engine";
import { assertDataDirectory, runPath } from "./paths";
import type { Observation, Period } from "./types";

export async function evaluateRun(name: string, binary: string, period: Period, limit?: number) {
  const directory = runPath(name);
  await assertDataDirectory(directory);
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  if (manifest.status !== "complete") throw new Error("Only complete import runs may be evaluated.");
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error("Limit must be a positive integer.");
  const suffix = limit === undefined ? period : period + "-first-" + limit;
  const destination = path.join(directory, "evaluations-" + suffix + ".jsonl");
  // Exclusive destination protects existing results.
  const reservation = await open(destination, "wx");
  await reservation.close();
  const temporary = destination + "." + process.pid + ".partial";
  let engine: HeEngine | undefined;
  let evaluated = 0;
  try {
    engine = await HeEngine.start(path.resolve(binary));
    const output = await open(temporary, "wx");
    const source = createReadStream(path.join(directory, "observations.jsonl"));
    const lines = createInterface({ input: source, crlfDelay: Infinity });
    try {
      await output.write(JSON.stringify({ type: "provenance", schemaVersion: 1, period, limit: limit ?? null,
        profile: engine.profile, population: manifest.population, importOptions: manifest.options }) + "\n");
      for await (const line of lines) {
        const row: Observation = JSON.parse(line);
        if (row.period !== period) continue;
        const champion = await engine.evaluate(row.fen);
        const candidate = row.uci === champion.uci ? champion : await engine.evaluate(row.fen, row.uci);
        const cpLoss = champion.cpWhite === null || candidate.cpWhite === null ? null :
          Math.max(0, candidate.cpWhite - champion.cpWhite);
        await output.write(JSON.stringify({ type: "observation", ...row, champion, candidate, cpLoss,
          curveEligible: candidate.cpWhite !== null }) + "\n");
        evaluated++;
        console.error(period + ": " + evaluated + " evaluated");
        if (limit !== undefined && evaluated >= limit) break;
      }
      await output.write(JSON.stringify({ type: "summary", evaluated, partial: limit !== undefined,
        finishedAt: new Date().toISOString() }) + "\n");
    } finally { lines.close(); source.destroy(); await output.close(); }
    await rename(temporary, destination);
    return { destination, evaluated, profile: engine.profile };
  } catch (error) {
    await unlink(destination);
    await unlink(temporary).catch(() => undefined);
    throw error;
  } finally { engine?.close(); }
}
