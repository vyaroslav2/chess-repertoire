import { createHash } from "node:crypto";
import { open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { HeEngine, parseEvaluation, SETTINGS } from "./engine";
import type { Job } from "./jobs";
import { assertDataDirectory, runPath } from "./paths";
import type { MoveGroup, Period } from "./types";

// One finished Colab search, as colab/he_colab.py writes it. cp and mate are Black's view.
export type ResultLine = { type: "result"; id: number; uci: string; cp: number | null; mate: number | null;
  depth: number; nodes: number | null; info: string; bestmove: string };
type SessionLine = { type: "session"; startedAt: string; archiveSha256: string; binarySha256: string;
  bench: number; nodes: number; hashMb: number; threads: number; multiPv: number; jobs: string };
// A group with the eval of the move played, in White's view.
export type GroupEval = MoveGroup & { id: number; part: Part; cpWhite: number | null; mateWhite: number | null;
  depth: number; nodes: number | null };
type Part = "a" | "b";
type Checked = { job: Job; result: ResultLine; part: Part };

const PARTS: Part[] = ["a", "b"];
// The Stockfish 19 Linux release and its bench, as fixed in colab/he_colab.py.
const ARCHIVE_SHA256 = "9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f";
const BENCH = 2_497_913;

function lines<T>(text: string, file: string): T[] {
  if (text && !text.endsWith("\n")) throw new Error(file + " ends in a cut-off line.");
  return text.split("\n").map(line => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as T; }
    catch { throw new Error(file + " line " + (index + 1) + " is not JSON."); }
  });
}
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
// What a search found, without its speed: nps and time differ between machines.
const found = (info: string) => info.replace(/ (?:nps|time) \d+/g, "");

// Reads both jobs and results files and checks every result against its job and its session.
async function readResults(directory: string) {
  const checked = new Map<number, Checked>();
  const binaries = new Set<string>();
  const report = { a: {}, b: {} } as Record<Part, { jobs: number; results: number; sessions: number; repeats: number; sha256: string }>;
  for (const part of PARTS) {
    const jobsFile = "jobs-" + part + ".jsonl", resultsFile = "results-" + part + ".jsonl";
    const jobs = new Map(lines<Job>(await readFile(path.join(directory, jobsFile), "utf8"), jobsFile).map(job => [job.id, job]));
    const text = await readFile(path.join(directory, resultsFile), "utf8");
    const rows = lines<SessionLine | ResultLine>(text, resultsFile);
    if (rows[0]?.type !== "session") throw new Error(resultsFile + " must start with a session line.");
    let sessions = 0, repeats = 0;
    for (const row of rows) {
      if (row.type === "session") {
        const expected = { archiveSha256: ARCHIVE_SHA256, bench: BENCH, nodes: SETTINGS.nodes, hashMb: SETTINGS.hashMb,
          threads: SETTINGS.threads, multiPv: SETTINGS.multiPv, jobs: jobsFile };
        for (const [key, value] of Object.entries(expected))
          if (row[key as keyof SessionLine] !== value) throw new Error(resultsFile + ": session " + row.startedAt + " has " +
            key + " " + row[key as keyof SessionLine] + ", expected " + value + ".");
        binaries.add(row.binarySha256);
        sessions++;
        continue;
      }
      const job = jobs.get(row.id);
      if (!job) throw new Error(resultsFile + ": id " + row.id + " is not in " + jobsFile + ".");
      if (row.uci !== job.uci || !row.bestmove.startsWith("bestmove " + job.uci))
        throw new Error(resultsFile + ": id " + row.id + " searched " + row.uci + ", but the job is " + job.uci + ".");
      // The engine's own parser checks the move is legal, the score exact, and flips it to White's view.
      const evaluation = parseEvaluation([row.info, row.bestmove], job.fen, job.uci);
      const nodes = /\bnodes (\d+)\b/.exec(row.info)?.[1];
      if (evaluation.depth !== row.depth || evaluation.cpWhite !== (row.cp === null ? null : -row.cp) ||
          evaluation.mateWhite !== (row.mate === null ? null : -row.mate) || (row.cp === null) === (row.mate === null) ||
          (nodes === undefined ? null : Number(nodes)) !== row.nodes)
        throw new Error(resultsFile + ": id " + row.id + " has fields that disagree with its info line.");
      const earlier = checked.get(row.id);
      if (earlier) {
        if (found(earlier.result.info) !== found(row.info)) throw new Error(resultsFile + ": id " + row.id + " appears twice with different results.");
        repeats++;
        continue;
      }
      checked.set(row.id, { job, result: row, part });
    }
    const missing = [...jobs.keys()].filter(id => !checked.has(id));
    if (missing.length) throw new Error(resultsFile + " lacks " + missing.length + " of " + jobs.size + " jobs, e.g. id " + missing.slice(0, 5).join(", ") + ".");
    report[part] = { jobs: jobs.size, results: jobs.size, sessions, repeats, sha256: sha256(text) };
  }
  if (binaries.size !== 1) throw new Error("The results come from " + binaries.size + " different Stockfish binaries.");
  return { checked, report, binarySha256: [...binaries][0] };
}

// Joins results-a and results-b to their groups and writes evals.jsonl: one line per group,
// its win/draw/loss counts (Black's view, as in groups.jsonl) and the eval of its move (White's view).
export async function importResults(name: string, period: Period) {
  const directory = runPath(name);
  await assertDataDirectory(directory);
  const { checked, report, binarySha256 } = await readResults(directory);
  const groups = lines<MoveGroup>(await readFile(path.join(directory, "groups.jsonl"), "utf8"), "groups.jsonl")
    .filter(group => group.period === period);
  if (groups.length !== checked.size) throw new Error(period + " has " + groups.length + " groups but " + checked.size + " results.");
  const rows: GroupEval[] = groups.map((group, index) => {
    const entry = checked.get(index + 1);
    if (!entry || entry.job.positionKey !== group.positionKey || entry.job.uci !== group.uci || entry.job.fen !== group.fens[0])
      throw new Error("Job " + (index + 1) + " does not match group " + (index + 1) + " of " + period + ": were the jobs written from this groups.jsonl?");
    // readResults checked these against the engine's parser: the flip to White's view.
    const { cp, mate, depth, nodes } = entry.result;
    return { id: index + 1, ...group, part: entry.part, cpWhite: cp === null ? null : -cp || 0,
      mateWhite: mate === null ? null : -mate, depth, nodes };
  });
  const depths = rows.map(row => row.depth).sort((x, y) => x - y);
  const mates = rows.filter(row => row.mateWhite !== null);
  const summary = { period, groups: rows.length, games: rows.reduce((sum, row) => sum + row.games, 0),
    mates: { groups: mates.length, games: mates.reduce((sum, row) => sum + row.games, 0) },
    depth: { minimum: depths[0], median: depths[Math.floor(depths.length / 2)], maximum: depths.at(-1) },
    binarySha256, files: report };
  const destination = path.join(directory, "evals.jsonl");
  // Exclusive destination protects existing results.
  const reservation = await open(destination, "wx");
  await reservation.close();
  const temporary = destination + "." + process.pid + ".partial";
  try {
    await writeFile(temporary, rows.map(row => JSON.stringify(row)).join("\n") + "\n", { flag: "wx" });
    await writeFile(path.join(directory, "evals-manifest.json"), JSON.stringify({ ...summary,
      createdAt: new Date().toISOString() }, null, 2) + "\n", { flag: "wx" });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(destination);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { destination, ...summary };
}

// Searches a fixed random choice of jobs from each file again on this machine. Each must give
// the same move, score, depth, nodes and line; only the speed may differ.
export async function recheckResults(name: string, binary: string, count: number) {
  if (!Number.isInteger(count) || count < 1) throw new Error("Count must be a positive integer.");
  const { checked } = await readResults(runPath(name));
  const chosen = PARTS.flatMap(part => [...checked.values()].filter(entry => entry.part === part)
    .sort((x, y) => sha256("recheck:" + x.job.id).localeCompare(sha256("recheck:" + y.job.id))).slice(0, count));
  const engine = await HeEngine.start(binary);
  const mismatches: { id: number; part: Part; colab: string; local: string }[] = [];
  try {
    for (const { job, result, part } of chosen) {
      const { rawLines } = await engine.search(job.fen, job.uci);
      const same = rawLines.map(found).includes(found(result.info)) && rawLines.at(-1) === result.bestmove &&
        JSON.stringify(parseEvaluation(rawLines, job.fen, job.uci)) === JSON.stringify(parseEvaluation([result.info, result.bestmove], job.fen, job.uci));
      if (!same) mismatches.push({ id: job.id, part, colab: found(result.info),
        local: found(rawLines.filter(line => line.startsWith("info ") && / pv /.test(line)).at(-1) ?? "") });
      console.error(job.id + (same ? " same" : " DIFFERENT"));
    }
  } finally { engine.close(); }
  return { checked: chosen.length, same: chosen.length - mismatches.length, ids: chosen.map(entry => entry.job.id), mismatches };
}
