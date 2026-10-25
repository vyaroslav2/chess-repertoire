import { createHash } from "node:crypto";
import { Chess } from "chess.js";
import { open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { HeEngine, parseEvaluation, SETTINGS, type Evaluation } from "./engine";
import type { Job, ReusedJob, Source } from "./jobs";
import { assertDataDirectory, runPath } from "./paths";
import type { MoveGroup, Observation, Period } from "./types";

// One finished Colab search, as colab/he_colab.py writes it. cp and mate are Black's view.
export type ResultLine = { type: "result"; id: number; uci: string; cp: number | null; mate: number | null;
  depth: number; nodes: number | null; info: string; bestmove: string };
type SessionLine = { type: "session"; startedAt: string; archiveSha256: string; binarySha256: string;
  bench: number; nodes: number; hashMb: number; threads: number; multiPv: number; jobs: string };
// A group with the eval of the move played, in White's view. from says where the search
// lies when an earlier run made it; part is then that run's results file.
export type GroupEval = MoveGroup & { id: number; part: Part; cpWhite: number | null; mateWhite: number | null;
  depth: number; nodes: number | null; from?: Source };
// One pair of jobs and results files. c is optional: part of a's jobs, split off for a third person.
export type Part = "a" | "b" | "c";
type Checked = { job: Job; result: ResultLine; part: Part; from?: Source };

const PARTS: Part[] = ["a", "b", "c"];
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
// For readFile(...).catch: a missing file reads as null.
const absent = (error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; };
// What a search found, without its speed: nps and time differ between machines.
const found = (info: string) => info.replace(/ (?:nps|time) \d+/g, "");

// Reads each part's jobs and results files and checks every result against its job and its session.
// A part with no jobs file is left out.
// Groups in jobs-reused.jsonl take their search from the earlier run, checked the same way.
async function readResults(directory: string): Promise<{ checked: Map<number, Checked>; binarySha256: string;
  report: Partial<Record<Part, object>>; reused?: { groups: number; runs: Record<string, object>; sha256: string } }> {
  const checked = new Map<number, Checked>();
  const binaries = new Set<string>();
  const report: Partial<Record<Part, { jobs: number; results: number; sessions: number; repeats: number; sha256: string }>> = {};
  for (const part of PARTS) {
    const jobsFile = "jobs-" + part + ".jsonl", resultsFile = "results-" + part + ".jsonl";
    const jobsText = await readFile(path.join(directory, jobsFile), "utf8").catch(absent);
    if (jobsText === null) continue;
    const jobs = new Map(lines<Job>(jobsText, jobsFile).map(job => [job.id, job]));
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
  const reusedText = await readFile(path.join(directory, "jobs-reused.jsonl"), "utf8").catch(absent);
  let reused;
  if (reusedText !== null) {
    const runs = new Map<string, Awaited<ReturnType<typeof readResults>>>();
    for (const job of lines<ReusedJob>(reusedText, "jobs-reused.jsonl")) {
      if (checked.has(job.id)) throw new Error("jobs-reused.jsonl: id " + job.id + " is searched in this run too.");
      const { run, part, id } = job.from;
      if (!runs.has(run)) runs.set(run, await readResults(runPath(run)));
      const entry = runs.get(run)!.checked.get(id);
      if (!entry || entry.from || entry.part !== part || entry.job.positionKey !== job.positionKey || entry.job.uci !== job.uci)
        throw new Error("jobs-reused.jsonl: id " + job.id + " is not the search in " + run + "'s results-" + part + ".jsonl, id " + id + ".");
      checked.set(job.id, { ...entry, from: job.from });
    }
    for (const run of runs.values()) binaries.add(run.binarySha256);
    reused = { groups: [...checked.values()].filter(entry => entry.from).length,
      runs: Object.fromEntries([...runs].map(([run, { report }]) => [run, report])), sha256: sha256(reusedText) };
  }
  if (binaries.size !== 1) throw new Error("The results come from " + binaries.size + " different Stockfish binaries.");
  return { checked, report, reused, binarySha256: [...binaries][0] };
}

// Joins results-a and results-b to their groups and writes evals.jsonl: one line per group,
// its win/draw/loss counts (Black's view, as in groups.jsonl) and the eval of its move (White's view).
export async function importResults(name: string, period: Period) {
  const directory = runPath(name);
  await assertDataDirectory(directory);
  const { checked, report, reused, binarySha256 } = await readResults(directory);
  const groups = lines<MoveGroup>(await readFile(path.join(directory, "groups.jsonl"), "utf8"), "groups.jsonl")
    .filter(group => group.period === period);
  if (groups.length !== checked.size) throw new Error(period + " has " + groups.length + " groups but " + checked.size + " results.");
  const rows: GroupEval[] = groups.map((group, index) => {
    const entry = checked.get(index + 1);
    // A reused search began from the earlier run's first FEN, which may differ in the clocks.
    if (!entry || entry.job.positionKey !== group.positionKey || entry.job.uci !== group.uci || (!entry.from && entry.job.fen !== group.fens[0]))
      throw new Error("Job " + (index + 1) + " does not match group " + (index + 1) + " of " + period + ": were the jobs written from this groups.jsonl?");
    // readResults checked these against the engine's parser: the flip to White's view.
    const { cp, mate, depth, nodes } = entry.result;
    return { id: index + 1, ...group, part: entry.part, cpWhite: cp === null ? null : -cp || 0,
      mateWhite: mate === null ? null : -mate, depth, nodes, ...(entry.from ? { from: entry.from } : {}) };
  });
  const depths = rows.map(row => row.depth).sort((x, y) => x - y);
  const mates = rows.filter(row => row.mateWhite !== null), reusedRows = rows.filter(row => row.from);
  const summary = { period, groups: rows.length, games: rows.reduce((sum, row) => sum + row.games, 0),
    mates: { groups: mates.length, games: mates.reduce((sum, row) => sum + row.games, 0) },
    depth: { minimum: depths[0], median: depths[Math.floor(depths.length / 2)], maximum: depths.at(-1) },
    ...(reused ? { reused: { groups: reusedRows.length, games: reusedRows.reduce((sum, row) => sum + row.games, 0) } } : {}),
    binarySha256, files: reused ? { ...report, reused } : report };
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

// Searches one chosen game's position again here, always afresh, and sets the Colab line above
// the local one. Reads only what that game needs, so it answers in seconds.
export async function recheckGame(name: string, binary: string, gameId: string, print: (text: string) => void = console.log) {
  if (!/^[A-Za-z0-9]{8}$/.test(gameId)) throw new Error("A game id is 8 letters or digits, e.g. g8gCaNm4.");
  const directory = runPath(name);
  const first = async <T>(file: string, hint: string, test: (row: T) => boolean, folder = directory) => {
    for (const line of (await readFile(path.join(folder, file), "utf8")).split("\n")) {
      if (!line.includes(hint)) continue;
      const row = JSON.parse(line) as T;
      if (test(row)) return row;
    }
  };
  const game = await first<Observation>("observations.jsonl", gameId, row => row.gameId === gameId);
  if (!game) throw new Error("Game " + gameId + " is not in run " + name + ".");
  let hit: { job: Job; part: Part; result: ResultLine; run?: string } | undefined;
  for (const part of PARTS) {
    const job = await first<Job>("jobs-" + part + ".jsonl", game.uci, row => row.positionKey === game.positionKey && row.uci === game.uci)
      .catch(absent);
    if (!job) continue;
    const result = await first<ResultLine>("results-" + part + ".jsonl", '"id": ' + job.id + ",", row => row.type === "result" && row.id === job.id);
    if (!result) throw new Error("results-" + part + ".jsonl has no result for id " + job.id + ".");
    hit = { job, part, result };
  }
  // A group an earlier run searched: its search lies in that run's files.
  const reused = hit ? undefined : await first<ReusedJob>("jobs-reused.jsonl", game.uci,
    row => row.positionKey === game.positionKey && row.uci === game.uci).catch(absent);
  if (reused) {
    const { run, part, id } = reused.from, folder = runPath(run);
    const job = await first<Job>("jobs-" + part + ".jsonl", '"id":' + id + ",", row => row.id === id, folder);
    const result = await first<ResultLine>("results-" + part + ".jsonl", '"id": ' + id + ",", row => row.type === "result" && row.id === id, folder);
    if (!job || !result) throw new Error(run + " has no search for id " + id + " in results-" + part + ".jsonl.");
    hit = { job, part, result, run };
  }
  if (!hit) throw new Error("No search job for game " + gameId + "'s move.");
  const { job, part, result, run } = hit;
  const colab = parseEvaluation([result.info, result.bestmove], job.fen, job.uci);
  const evalText = (e: Evaluation) => e.mateWhite !== null ? "mate " + e.mateWhite :
    (e.cpWhite! > 0 ? "+" : "") + (e.cpWhite! / 100).toFixed(2);
  const outcome = { wins: "0-1, Black won", draws: "1/2-1/2, a draw", losses: "1-0, Black lost" }[game.outcome];
  print([
    "Game " + gameId + ": https://lichess.org/" + gameId + "/black#" + 2 * game.moveNumber,
    "Black's move " + game.moveNumber + "... " + game.san + " (" + game.uci + "), result " + outcome,
    "Position: " + job.fen + (job.fen === game.fen ? "" : " (the group's first position; this game's differs only in the clocks)"),
    "Search: " + (run ? run + "/" : "") + "results-" + part + ".jsonl, id " + job.id,
    "",
    "Stockfish 19 here, searching only " + game.san + ", up to " + (SETTINGS.nodes / 1e6) + "M nodes. Each row is one finished depth:",
    "",
    table(["Depth", "Sel", "Time", "Nodes", "Speed", "Eval", "Line"]),
  ].join("\n"));
  // One row per finished depth: a depth's last exact line is printed once a deeper one arrives.
  let current: string | undefined;
  const row = (info: string, star: boolean) => {
    const field = (name: string) => /\b(\d+)\b/.exec(info.split(" " + name + " ")[1] ?? "")?.[1];
    const evaluation = parseEvaluation([info, "bestmove " + job.uci], job.fen, job.uci);
    print(table([(star ? "*" : " ") + field("depth"), field("seldepth") ?? "-", (Number(field("time")) / 1000).toFixed(1) + " s",
      count(Number(field("nodes"))), count(Number(field("nps"))) + "/s", evalText(evaluation),
      sanLine(job.fen, info.split(" pv ")[1]?.split(" ") ?? [], 8)]));
  };
  const onLine = (line: string) => {
    if (!line.startsWith("info ") || !/ score (?:cp|mate) /.test(line) || !/ pv /.test(line) ||
        /\b(?:lowerbound|upperbound)\b/.test(line)) return;
    const depth = (info: string) => Number(/\bdepth (\d+)\b/.exec(info)?.[1]);
    if (current && depth(line) > depth(current)) row(current, false);
    current = line;
  };
  const engine = await HeEngine.start(binary);
  const started = Date.now();
  let rawLines: string[];
  try { rawLines = (await engine.search(job.fen, job.uci, true, onLine)).rawLines; } finally { engine.close(); }
  const seconds = (Date.now() - started) / 1000;
  // The deepest finished depth is the result, as parseEvaluation reads it.
  if (current) row(current, true);
  const local = parseEvaluation(rawLines, job.fen, job.uci);
  const localInfo = current ?? "";
  const same = found(localInfo) === found(result.info) && rawLines.at(-1) === result.bestmove &&
    JSON.stringify(local) === JSON.stringify(colab);
  print([
    "",
    "* = the result: the last exact line Stockfish gave before the node limit stopped it.",
    "",
    "Colab: " + found(result.info),
    "Here:  " + found(localInfo),
    "",
    "Eval for White: " + evalText(colab) + " on Colab, " + evalText(local) + " here (searched now, " + seconds.toFixed(1) + " s)",
    same ? "SAME: depth, score, nodes and every move of the line match. Only the speed differs."
      : "DIFFERENT: compare the two lines above.",
  ].join("\n"));
  return { same };
}
const WIDTHS = [6, 4, 7, 7, 8, 7];
const table = (cells: string[]) => cells.map((cell, i) => i < WIDTHS.length ? (i ? cell.padStart(WIDTHS[i]) : cell.padEnd(WIDTHS[i])) : cell).join("  ");
const count = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n);
// The first moves of a line in SAN, numbered: "5... Nc6 6. Ng3 Bg6".
function sanLine(fen: string, uci: string[], max: number): string {
  const chess = new Chess(fen), parts: string[] = [];
  for (const move of uci.slice(0, max)) {
    const number = chess.moveNumber();
    const san = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }).san;
    parts.push(chess.turn() === "b" ? number + ". " + san : (parts.length ? "" : number + "... ") + san);
  }
  return parts.join(" ") + (uci.length > max ? " …" : "");
}

// Searches a fixed random choice of jobs from each file again on this machine. Each must give
// the same move, score, depth, nodes and line; only the speed may differ.
export async function recheckResults(name: string, binary: string, count: number) {
  if (!Number.isInteger(count) || count < 1) throw new Error("Count must be a positive integer.");
  const { checked } = await readResults(runPath(name));
  // Searches reused from an earlier run are that run's to recheck.
  const chosen = PARTS.flatMap(part => [...checked.values()].filter(entry => entry.part === part && !entry.from)
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
