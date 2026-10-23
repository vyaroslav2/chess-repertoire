import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Chess } from "chess.js";
import { assertDataDirectory, runPath } from "./paths";
import type { GroupEval } from "./results";
import type { MoveGroup, Period } from "./types";

// One search for the curve: the group's position, limited to the move played.
export type Job = { id: number; positionKey: string; fen: string; uci: string };
// Where a search lies: its run, results file and id there.
export type Source = { run: string; part: "a" | "b"; id: number };
// A group an earlier run has searched already: it is not searched again.
export type ReusedJob = Job & { from: Source };

// Writes one period's groups as search jobs for colab/he_colab.py, in groups.jsonl order.
// Ids are group numbers in that order: the first split jobs go to jobs-a.jsonl, the rest to
// jobs-b.jsonl. A group whose FENs differ only in the clocks is searched from its first FEN.
// With reuse, a group whose position and move one of those runs' evals.jsonl has goes to
// jobs-reused.jsonl instead, with where its search lies.
export async function writeJobs(name: string, period: Period, split: number, reuse: string[] = []) {
  if (!Number.isInteger(split) || split < 1) throw new Error("Split must be a positive integer.");
  if (reuse.includes(name)) throw new Error("A run cannot reuse its own searches.");
  const directory = runPath(name);
  await assertDataDirectory(directory);
  const earlier = new Map<string, Source>();
  for (const run of reuse) {
    const text = await readFile(path.join(runPath(run), "evals.jsonl"), "utf8")
      .catch(() => { throw new Error("Run " + run + " has no evals.jsonl to reuse."); });
    for (const line of text.split("\n").filter(Boolean)) {
      const row: GroupEval = JSON.parse(line);
      const key = row.positionKey + " " + row.uci;
      if (!earlier.has(key)) earlier.set(key, row.from ?? { run, part: row.part, id: row.id });
    }
  }
  const files = ["jobs-a.jsonl", "jobs-b.jsonl", ...(reuse.length ? ["jobs-reused.jsonl"] : [])].map(file => path.join(directory, file));
  // Exclusive creation protects existing job files.
  const outputs = [];
  try { for (const file of files) outputs.push(await open(file, "wx")); }
  catch (error) {
    for (const [index, output] of outputs.entries()) { await output.close(); await unlink(files[index]); }
    throw error;
  }
  const counts = [0, 0, 0], ids: number[][] = [[], [], []];
  let id = 0;
  const source = createReadStream(path.join(directory, "groups.jsonl"));
  const lines = createInterface({ input: source, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      const group: MoveGroup = JSON.parse(line);
      if (group.period !== period) continue;
      const fen = group.fens[0];
      const chess = new Chess(fen);
      if (chess.turn() !== "b" || !chess.moves({ verbose: true }).some(move => move.lan === group.uci))
        throw new Error("Group is not a legal Black move: " + group.positionKey + " " + group.uci);
      const job: Job = { id: ++id, positionKey: group.positionKey, fen, uci: group.uci };
      const from = earlier.get(group.positionKey + " " + group.uci);
      const part = from ? 2 : counts[0] < split ? 0 : 1;
      await outputs[part].write(JSON.stringify(from ? { ...job, from } : job) + "\n");
      counts[part]++;
      ids[part] = [ids[part][0] ?? id, id];
    }
  } catch (error) {
    lines.close(); source.destroy();
    await Promise.all(outputs.map(output => output.close()));
    await Promise.all(files.map(file => unlink(file)));
    throw error;
  }
  lines.close(); source.destroy();
  await Promise.all(outputs.map(output => output.close()));
  const report = (part: number) => ({ ids: counts[part] ? ids[part].join("-") : "none", jobs: counts[part] });
  return { files, period, groups: id, jobs: counts[0] + counts[1], a: report(0), b: report(1),
    ...(reuse.length ? { reused: { from: reuse, groups: counts[2] } } : {}) };
}
