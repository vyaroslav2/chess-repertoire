import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { open, unlink } from "node:fs/promises";
import path from "node:path";
import { Chess } from "chess.js";
import { assertDataDirectory, runPath } from "./paths";
import type { MoveGroup, Period } from "./types";

// One search for the curve: the group's position, limited to the move played.
export type Job = { id: number; positionKey: string; fen: string; uci: string };

// Writes one period's groups as search jobs for colab/he_colab.py, in groups.jsonl order:
// ids 1 to split in jobs-a.jsonl, the rest in jobs-b.jsonl. A group whose FENs differ only
// in the clocks is searched from its first FEN.
export async function writeJobs(name: string, period: Period, split: number) {
  if (!Number.isInteger(split) || split < 1) throw new Error("Split must be a positive integer.");
  const directory = runPath(name);
  await assertDataDirectory(directory);
  const files = ["jobs-a.jsonl", "jobs-b.jsonl"].map(file => path.join(directory, file));
  // Exclusive creation protects existing job files.
  const outputs = [await open(files[0], "wx")];
  try { outputs.push(await open(files[1], "wx")); }
  catch (error) { await outputs[0].close(); await unlink(files[0]); throw error; }
  const counts = [0, 0];
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
      const part = id <= split ? 0 : 1;
      await outputs[part].write(JSON.stringify(job) + "\n");
      counts[part]++;
    }
  } catch (error) {
    lines.close(); source.destroy();
    await Promise.all(outputs.map(output => output.close()));
    await Promise.all(files.map(file => unlink(file)));
    throw error;
  }
  lines.close(); source.destroy();
  await Promise.all(outputs.map(output => output.close()));
  return { files, period, jobs: id, a: { ids: counts[0] ? "1-" + counts[0] : "none", jobs: counts[0] },
    b: { ids: counts[1] ? counts[0] + 1 + "-" + id : "none", jobs: counts[1] } };
}
