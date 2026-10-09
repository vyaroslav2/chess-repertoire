import path from "node:path";
import { open, mkdir, writeFile, stat } from "node:fs/promises";
import { readGames, selectObservation, type ImportOptions } from "./pgn";
import { assertDataDirectory, DATA_ROOT, runPath } from "./paths";
import { POLICY, type MoveGroup, type Observation, type Period } from "./types";
export function groupObservations(observations: Iterable<Observation>): MoveGroup[] {
  const groups = new Map<string, MoveGroup>();
  for (const observation of observations) addGroup(groups, observation);
  return [...groups.values()];
}
function addGroup(groups: Map<string, MoveGroup>, row: Observation): void {
  const key = `${row.period}:${row.positionKey}:${row.uci}`;
  let group = groups.get(key);
  if (!group) {
    group = { period: row.period, positionKey: row.positionKey, uci: row.uci, fens: [], games: 0,
      wins: 0, draws: 0, losses: 0, moveNumbers: {} };
    groups.set(key, group);
  }
  group.games++; group[row.outcome]++;
  group.moveNumbers[row.moveNumber] = (group.moveNumbers[row.moveNumber] ?? 0) + 1;
  if (!group.fens.includes(row.fen)) group.fens.push(row.fen);
}
export async function importFiles(files: string[], name: string, options: ImportOptions, limit?: number) {
  if (!files.length) throw new Error("Supply at least one PGN file.");
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error("Limit must be a positive integer.");
  const inputs = await Promise.all(files.map(async file => {
    const resolved = path.resolve(file), info = await stat(resolved);
    if (!info.isFile()) throw new Error(`Not a file: ${resolved}`);
    return { path: resolved, bytes: info.size, modifiedAt: info.mtime.toISOString() };
  }));
  await assertDataDirectory(DATA_ROOT);
  await assertDataDirectory(path.join(DATA_ROOT, "runs"));
  const directory = runPath(name);
  await mkdir(directory);
  await assertDataDirectory(directory);
  const manifest = { policy: POLICY, options, limit: limit ?? null, inputs, startedAt: new Date().toISOString(),
    population: options.maxGap === 100 ? "pilot" : "gap-diagnostic" };
  const output = await open(path.join(directory, "observations.jsonl"), "wx");
  const seen = new Set<string>(), groups = new Map<string, MoveGroup>();
  const rejected: Record<string, number> = {};
  const periods: Record<Period, number> = { fit: 0, tune: 0, test: 0 };
  let scanned = 0, accepted = 0, duplicates = 0, stoppedAtLimit = false;
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ ...manifest, status: "running" }, null, 2));
  try {
    fileLoop: for (const input of inputs) {
      for await (const pgn of readGames(input.path)) {
        scanned++;
        if (scanned % 10_000 === 0) console.error(`${scanned} scanned; ${accepted} accepted`);
        const selected = selectObservation(pgn, options);
        if ("rejected" in selected) { rejected[selected.rejected] = (rejected[selected.rejected] ?? 0) + 1; continue; }
        const row = selected.observation;
        if (seen.has(row.gameId)) { duplicates++; continue; }
        seen.add(row.gameId); accepted++; periods[row.period]++;
        addGroup(groups, row);
        await output.write(`${JSON.stringify(row)}\n`);
        if (limit !== undefined && accepted >= limit) { stoppedAtLimit = true; break fileLoop; }
      }
    }
    const coverage = Object.fromEntries((["fit", "tune", "test"] as Period[]).map(period => {
      const sizes = [...groups.values()].filter(group => group.period === period).map(group => group.games);
      return [period, { games: periods[period], groups: sizes.length, singleton: sizes.filter(n => n === 1).length,
        "2-9": sizes.filter(n => n >= 2 && n < 10).length, "10-49": sizes.filter(n => n >= 10 && n < 50).length,
        "50-199": sizes.filter(n => n >= 50 && n < 200).length, "200+": sizes.filter(n => n >= 200).length }];
    }));
    const groupedOutput = await open(path.join(directory, "groups.jsonl"), "wx");
    try { for (const group of groups.values()) await groupedOutput.write(`${JSON.stringify(group)}\n`); }
    finally { await groupedOutput.close(); }
    const summary = { scanned, accepted, duplicates, rejected, coverage, stoppedAtLimit };
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ ...manifest, status: "complete",
      finishedAt: new Date().toISOString(), summary }, null, 2));
    return { directory, ...summary };
  } catch (error) {
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ ...manifest, status: "failed", error: String(error) }, null, 2));
    throw error;
  } finally { await output.close(); }
}
