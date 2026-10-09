import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { Chess } from "chess.js";
import { assertDataDirectory, DATA_ROOT } from "./paths";

export const SETTINGS = { depth: 24, multiPv: 1, threads: 1, hashMb: 64 } as const;
export type Evaluation = { uci: string; depth: number; cpWhite: number | null; mateWhite: number | null };
export type EngineProfile = { id: string; name: string; binarySha256: string; settings: typeof SETTINGS };
export function parseEvaluation(lines: string[], fen: string, expectedUci?: string): Evaluation {
  const best = /^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)(?:\s|$)/.exec(lines.at(-1) ?? "")?.[1];
  if (!best || (expectedUci && best !== expectedUci)) throw new Error("Engine did not return the requested legal root move.");
  const legal = new Chess(fen).moves({ verbose: true }).some(move => move.lan === best);
  if (!legal) throw new Error("Engine returned an illegal move.");
  const multiplier = fen.split(" ")[1] === "b" ? -1 : 1;
  for (const line of [...lines].reverse()) {
    if (!line.startsWith("info ") || /\b(?:lowerbound|upperbound)\b/.test(line)) continue;
    const depth = Number(/\bdepth (\d+)\b/.exec(line)?.[1]);
    const score = /\bscore (cp|mate) (-?\d+)\b/.exec(line);
    const pv = /\bpv (\S+)/.exec(line)?.[1];
    const multiPv = Number(/\bmultipv (\d+)\b/.exec(line)?.[1] ?? "1");
    if (depth !== SETTINGS.depth || !score || pv !== best || multiPv !== 1) continue;
    const value = Number(score[2]) * multiplier;
    return { uci: best, depth, cpWhite: score[1] === "cp" ? value : null,
      mateWhite: score[1] === "mate" ? value : null };
  }
  throw new Error("Engine returned no exact, unbounded depth-24 score for its best move.");
}

class UciProcess {
  private readonly process: ChildProcessWithoutNullStreams;
  private pending: { lines: string[]; until: (line: string) => boolean; resolve: (lines: string[]) => void;
    reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private dead: Error | null = null;
  constructor(binary: string, private readonly timeoutMs: number) {
    this.process = spawn(binary, [], { windowsHide: true, stdio: "pipe" });
    const lines = createInterface({ input: this.process.stdout });
    lines.on("line", line => {
      const request = this.pending;
      if (!request) return;
      request.lines.push(line);
      if (request.until(line)) {
        clearTimeout(request.timer); this.pending = null; request.resolve(request.lines);
      }
    });
    this.process.stderr.resume();
    this.process.on("error", error => this.fail(error));
    this.process.on("exit", (code, signal) => this.fail(new Error("Stockfish exited: " + (signal ?? code))));
    this.process.stdin.on("error", error => this.fail(error));
  }
  private fail(error: Error) {
    this.dead = error;
    if (this.pending) {
      clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null;
    }
  }
  command(command: string, until: (line: string) => boolean): Promise<string[]> {
    if (this.dead) return Promise.reject(this.dead);
    if (this.pending) return Promise.reject(new Error("Overlapping UCI commands are not supported."));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error("Stockfish command timed out.")); this.process.kill();
      }, this.timeoutMs);
      this.pending = { lines: [], until, resolve, reject, timer };
      this.process.stdin.write(command + "\n");
    });
  }
  close() {
    this.fail(new Error("Stockfish session closed."));
    this.process.stdin.end("quit\n");
    this.process.kill();
  }
}

export class HeEngine {
  private constructor(private readonly uci: UciProcess, readonly profile: EngineProfile) {}
  static async start(binary: string, timeoutMs = 600_000): Promise<HeEngine> {
    const binarySha256 = createHash("sha256").update(await readFile(binary)).digest("hex");
    const uci = new UciProcess(binary, timeoutMs);
    try {
      const handshake = await uci.command("uci", line => line === "uciok");
      const name = handshake.find(line => line.startsWith("id name "))?.slice(8) ?? "";
      if (!/^Stockfish 19(?:\s|$)/.test(name)) throw new Error("HE requires Stockfish 19; found " + name);
      await uci.command("setoption name Threads value 1\nsetoption name Hash value 64\nsetoption name MultiPV value 1\nisready", line => line === "readyok");
      const profile = { name, binarySha256, settings: SETTINGS };
      const id = createHash("sha256").update(JSON.stringify(profile)).digest("hex");
      await assertDataDirectory(path.join(DATA_ROOT, "eval-cache", id));
      return new HeEngine(uci, { id, ...profile });
    } catch (error) { uci.close(); throw error; }
  }
  async evaluate(fen: string, candidate?: string): Promise<Evaluation> {
    const chess = new Chess(fen);
    if (chess.turn() !== "b") throw new Error("HE evaluates Black decisions only.");
    if (candidate && !chess.moves({ verbose: true }).some(move => move.lan === candidate)) throw new Error("Illegal HE candidate.");
    const request = { profile: this.profile.id, fen, candidate: candidate ?? null };
    const key = createHash("sha256").update(JSON.stringify(request)).digest("hex");
    const directory = path.join(DATA_ROOT, "eval-cache", this.profile.id);
    await assertDataDirectory(directory);
    const cachePath = path.join(directory, key + ".json");
    try {
      const cached = JSON.parse(await readFile(cachePath, "utf8"));
      if (JSON.stringify(cached.request) !== JSON.stringify(request) ||
          !Array.isArray(cached.rawLines)) throw new Error("Invalid HE evaluation cache: " + cachePath);
      return parseEvaluation(cached.rawLines, fen, candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    // Clear search history between requests so results don't depend on import order.
    await this.uci.command("ucinewgame\nsetoption name Clear Hash\nisready", line => line === "readyok");
    const rawLines = await this.uci.command("position fen " + fen + "\ngo depth 24" +
      (candidate ? " searchmoves " + candidate : ""), line => line.startsWith("bestmove "));
    const evaluation = parseEvaluation(rawLines, fen, candidate);
    const temporary = cachePath + "." + process.pid + "." + Date.now() + ".tmp";
    await writeFile(temporary, JSON.stringify({ request, profile: this.profile, rawLines, evaluation }), { flag: "wx" });
    await rename(temporary, cachePath);
    return evaluation;
  }
  close() { this.uci.close(); }
}
