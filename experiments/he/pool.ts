import { open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { assertDataDirectory, runPath } from "./paths";
import type { GroupEval } from "./results";
import type { Observation } from "./types";

// Pools finished runs into one: a position and move that several runs have becomes one group,
// with their games summed. Its search is the one it already had: the same position and move
// are searched once and reused (jobs --reuse), so their evals must agree exactly.
// Writes evals.jsonl, observations.jsonl and pool.json; curve, k and dots then run on it.
export async function poolRuns(name: string, from: string[]) {
  if (from.length < 2 || new Set(from).size !== from.length) throw new Error("Pool needs two or more different runs.");
  if (from.includes(name)) throw new Error("A pool cannot include itself.");
  const directory = runPath(name);
  await assertDataDirectory(directory);
  const read = async <T>(run: string, file: string): Promise<T[]> =>
    (await readFile(path.join(runPath(run), file), "utf8").catch(() => { throw new Error("Run " + run + " has no " + file + "."); }))
      .trim().split("\n").map(line => JSON.parse(line));
  const groups = new Map<string, GroupEval>(), games = new Set<string>(), observations: Observation[] = [];
  const runs: Record<string, { groups: number; games: number }> = {};
  for (const run of from) {
    const rows = await read<GroupEval>(run, "evals.jsonl");
    for (const row of rows) {
      const key = row.period + " " + row.positionKey + " " + row.uci;
      const source = row.from ?? { run, part: row.part, id: row.id };
      const pooled = groups.get(key);
      if (!pooled) {
        groups.set(key, { ...row, id: groups.size + 1, fens: [...row.fens], moveNumbers: { ...row.moveNumbers }, from: source });
        continue;
      }
      if (pooled.cpWhite !== row.cpWhite || pooled.mateWhite !== row.mateWhite || pooled.depth !== row.depth)
        throw new Error(run + ": " + key + " has another eval than in an earlier run. Were its jobs written with --reuse?");
      for (const field of ["games", "wins", "draws", "losses"] as const) pooled[field] += row[field];
      for (const [move, count] of Object.entries(row.moveNumbers)) pooled.moveNumbers[move] = (pooled.moveNumbers[move] ?? 0) + count;
      for (const fen of row.fens) if (!pooled.fens.includes(fen)) pooled.fens.push(fen);
    }
    // The same game twice would make groups out of nothing.
    const own = await read<Observation>(run, "observations.jsonl");
    for (const game of own) {
      if (games.has(game.gameId)) throw new Error(run + ": game " + game.gameId + " is in an earlier run too.");
      games.add(game.gameId);
      observations.push(game);
    }
    runs[run] = { groups: rows.length, games: own.length };
  }
  const rows = [...groups.values()];
  const files = ["evals.jsonl", "observations.jsonl", "pool.json"].map(file => path.join(directory, file));
  const contents = [rows.map(row => JSON.stringify(row)).join("\n") + "\n",
    observations.map(game => JSON.stringify(game)).join("\n") + "\n"];
  const summary = { from, runs, groups: rows.length, games: observations.length,
    repeated: rows.filter(row => row.games >= 2).length };
  contents.push(JSON.stringify({ ...summary, createdAt: new Date().toISOString() }, null, 2) + "\n");
  // Exclusive creation protects an existing pool; a failure leaves none of its files.
  const written: string[] = [];
  try {
    for (const [index, file] of files.entries()) {
      const output = await open(file, "wx");
      written.push(file);
      await output.write(contents[index]); await output.close();
    }
  } catch (error) {
    await Promise.all(written.map(file => unlink(file)));
    throw error;
  }
  return { directory, ...summary };
}
