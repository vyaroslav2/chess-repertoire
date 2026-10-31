import { Engine } from 'node-uci';
import { Chess } from 'chess.js';
import { spawn } from 'child_process';
import * as path from 'path';

import { defaultConfig, computeLocalEngineEvaluationProfile, computeSelectorEngineProfile, type Config } from './config';
import { parseFullFen } from './fen';
import { isValidUciMove } from './uci';
import {
  readLocalEngineBaseline,
  readLocalEngineCandidate,
  saveLocalEngineBaseline,
  saveLocalEngineCandidate,
  type LocalEngineEvaluation
} from '../db/operations';

type StockfishEngine = {
  init(): Promise<void>;
  setoption(name: string, value: string): Promise<void>;
  position(fen: string): Promise<void>;
  go(params: { nodes: number }): Promise<{ info?: unknown[] }>;
  quit(): Promise<void>;
};

export type LocalEngineFactory = (enginePath: string) => StockfishEngine;

/** EW.09: every evaluation comes from this Stockfish version and no other. */
export function assertStockfishVersion(uciLines: readonly string[], version: number = defaultConfig.localStockfishVersion): void {
  const name = uciLines.find(line => line.startsWith('id name '))?.slice('id name '.length) ?? '(no name)';
  const expected = `Stockfish ${version}`;
  if (name !== expected && !name.startsWith(`${expected} `)) {
    throw new Error(`The generator requires Stockfish ${version} at bin/stockfish.exe; found ${name}`);
  }
}

/**
 * S0.04: Ctrl+C must not interrupt the current position. node-uci starts
 * Stockfish on our console, so Ctrl+C would kill it mid-search. Start it
 * detached instead; it still quits on `quit` or when its stdin closes.
 */
export class ConsoleDetachedEngine extends Engine {
  async init(): Promise<void> {
    if (this.proc) throw new Error('cannot call "init()": already initialized');
    this.proc = spawn(this.filePath, [], { detached: true, windowsHide: true });
    this.proc.stdout.setEncoding('utf8');
    this.write('uci');
    const handshake = await this.getBufferUntil(line => line === 'uciok');
    try {
      assertStockfishVersion(handshake);
    } catch (error) {
      await this.quit(); // a wrong engine must not keep running
      throw error;
    }
  }

  /**
   * EW.09: node-uci reads `score cp 20 lowerbound` as an exact score. A node-limited search
   * stops part-way through a depth, where bounds are common, so read the lines ourselves.
   */
  async go(params: Record<string, unknown>): Promise<{ info?: unknown[] }> {
    const progress = new SearchProgress(Number(params.nodes));
    const listener = (chunk: string) => progress.read(chunk);
    const stdout = this.proc?.stdout;
    if (!stdout) throw new Error('Stockfish is not running');
    stdout.on('data', listener);
    const timer = setInterval(() => progress.draw(), 1000);
    try {
      this.write(`go nodes ${params.nodes}`);
      const lines = await this.getBufferUntil(line => line.startsWith('bestmove '));
      return { info: lines.map(parseInfoLine).filter(info => info !== null) };
    } finally {
      clearInterval(timer);
      stdout.off('data', listener);
      progress.finish();
    }
  }

  /** HEG.21: one root move's search, as raw lines, for the selector's HE-style read. */
  async goSearchmoves(nodes: number, uci: string): Promise<string[]> {
    this.write(`go nodes ${nodes} searchmoves ${uci}`);
    return this.getBufferUntil(line => line.startsWith('bestmove '));
  }
}

export type SearchProgressState = { nodes: number; nps: number; depth: number };

const millions = (nodes: number) => `${(nodes / 1_000_000).toFixed(1)}M`;
const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * TGL: the live line shown while Stockfish searches. Stockfish reports nodes only when a depth
 * ends, so between reports the count is estimated from its last speed, marked with `~`.
 */
export function formatSearchProgress(state: SearchProgressState, limit: number, elapsedMs: number): string {
  const estimated = Math.min(limit, Math.max(state.nodes, Math.round(state.nps * elapsedMs / 1000)));
  const share = Math.floor(100 * estimated / limit);
  const depth = state.depth > 0 ? `  depth ${state.depth}` : '';
  const speed = state.nps > 0 ? `  ${millions(state.nps)} nodes/s` : '';
  return `Stockfish: ~${millions(estimated)} / ${millions(limit)} nodes (${share}%)${depth}  ${clock(elapsedMs)}${speed}`;
}

/** TGL: the log line after each search. */
export function formatSearchSummary(state: SearchProgressState, elapsedMs: number): string {
  return `[STOCKFISH] ${millions(state.nodes)} nodes; depth ${state.depth}; ${clock(elapsedMs)}; ${millions(state.nps)} nodes/s`;
}

/** Reads Stockfish's info lines as they arrive. The live line goes to the terminal only, never the log file. */
class SearchProgress {
  private readonly startedAt = Date.now();
  private readonly state: SearchProgressState = { nodes: 0, nps: 0, depth: 0 };
  private backlog = '';
  private drawn = false;

  constructor(private readonly limit: number) {}

  read(chunk: string): void {
    this.backlog += chunk;
    const lines = this.backlog.split('\n');
    this.backlog = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('info ')) continue;
      const depth = /\bdepth (\d+)/.exec(line);
      const nodes = /\bnodes (\d+)/.exec(line);
      const nps = /\bnps (\d+)/.exec(line);
      if (depth) this.state.depth = Number(depth[1]);
      if (nodes) this.state.nodes = Number(nodes[1]);
      if (nps) this.state.nps = Number(nps[1]);
    }
  }

  draw(): void {
    if (!process.stdout.isTTY) return;
    process.stdout.write(`\r${formatSearchProgress(this.state, this.limit, Date.now() - this.startedAt).padEnd(100)}`);
    this.drawn = true;
  }

  finish(): void {
    if (this.drawn) process.stdout.write(`\r${' '.repeat(100)}\r`);
    if (this.state.nodes > 0) console.log(formatSearchSummary(this.state, Date.now() - this.startedAt));
  }
}

/** One `info` line in the shape node-uci gives: depth, score { unit, value }, pv, and nodes when given. Bound scores are skipped. */
export function parseInfoLine(line: string): { depth: number; score: { unit: string; value: number }; pv: string; nodes?: number } | null {
  if (!line.startsWith('info ') || /\b(?:lowerbound|upperbound)\b/.test(line)) return null;
  const depth = /\bdepth (\d+)/.exec(line);
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  const pv = / pv (.+)$/.exec(line);
  const nodes = /\bnodes (\d+)/.exec(line);
  if (!depth || !score || !pv) return null;
  return {
    depth: Number(depth[1]),
    score: { unit: score[1], value: Number(score[2]) },
    pv: pv[1].trim(),
    ...(nodes ? { nodes: Number(nodes[1]) } : {})
  };
}

export type TrustedLocalEvaluation = LocalEngineEvaluation & {
  san: string;
  /** DB.32: the deepest completed depth (EW.09); null if Stockfish gave none or the cached eval predates it. */
  depth: number | null;
};

export type LocalSearchSettings = {
  nodes: number;
  threads: number;
  hashMb: number;
  multiPv: number;
};

export type LocalSearchRunner = (
  fullFen: string,
  settings: LocalSearchSettings
) => Promise<TrustedLocalEvaluation>;

function assertSearchSettings(settings: LocalSearchSettings): void {
  for (const [name, value] of [['nodes', settings.nodes], ['threads', settings.threads], ['hash', settings.hashMb]] as const) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid Local Engine ${name}`);
  }
  if (settings.multiPv !== 1) {
    throw new Error('Trusted Local Deep searches require MultiPV 1');
  }
}

function assertLegalRoot(fullFen: string, uci: string): string {
  if (!isValidUciMove(uci)) throw new Error(`Invalid Local Engine root UCI: ${uci}`);
  const chess = new Chess(fullFen);
  let move;
  try {
    move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined
    });
  } catch {
    throw new Error(`Illegal or unsearchable Local Engine root move ${uci}`);
  }
  if (!move || move.lan !== uci) throw new Error(`Illegal or unsearchable Local Engine root move ${uci}`);
  return move.san;
}

type CollectedEvaluation = TrustedLocalEvaluation & {
  sequence: number;
};

export function collectLocalSearchUpdates(
  fullFenInput: string,
  rawInfo: unknown
): CollectedEvaluation[] {
  const fullFen = parseFullFen(fullFenInput);
  if (fullFen !== fullFenInput) throw new Error('Local Engine search requires canonical FullFen');
  if (!Array.isArray(rawInfo)) throw new Error('Local Engine returned malformed search information');

  const multiplier = fullFen.split(' ')[1] === 'b' ? -1 : 1;
  const updates = new Map<string, CollectedEvaluation>();

  rawInfo.forEach((raw, sequence) => {
    if (!raw || typeof raw !== 'object') return;
    const info = raw as Record<string, any>;
    const hasPv = typeof info.pv === 'string' && info.pv.trim() !== '';
    const hasScore = info.score !== undefined && info.score !== null;
    if (!hasPv && !hasScore) return;
    if (!hasPv || !hasScore || typeof info.score !== 'object') {
      throw new Error('Local Engine returned an incomplete evaluation update');
    }

    const uci = info.pv.trim().split(/\s+/)[0];
    const san = assertLegalRoot(fullFen, uci);
    const value = info.score.value;
    let cp: number | null = null;
    let mate: number | null = null;
    if (info.score.unit === 'mate') {
      // DB.12: mate = 0 is invalid — there is always at least one ply to the mate itself.
      if (typeof value !== 'number' || !Number.isInteger(value) || value === 0) {
        throw new Error(`Invalid Local Engine mate evaluation for ${uci}`);
      }
      mate = value * multiplier;
    } else if (info.score.unit === 'cp') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Invalid Local Engine cp evaluation for ${uci}`);
      }
      cp = value === 0 ? 0 : value * multiplier;
    } else {
      throw new Error(`Invalid Local Engine score unit for ${uci}`);
    }

    const depth = typeof info.depth === 'number' && Number.isInteger(info.depth) && info.depth >= 0
      ? info.depth
      : null;
    const evaluation: CollectedEvaluation = { uci, san, cp, mate, depth, sequence };
    const previous = updates.get(uci);
    if (!previous ||
        (depth !== null && previous.depth !== null ? depth >= previous.depth : sequence > previous.sequence)) {
      updates.set(uci, evaluation);
    }
  });

  if (updates.size === 0) throw new Error('Local Engine returned zero usable root evaluations');
  return [...updates.values()];
}

/**
 * EW.09: when the node limit stops the search part-way through a depth, Stockfish prints one last
 * line for that unfinished depth, with no bound mark. It is the only line at or past the limit.
 */
function dropStopLine(rawInfo: unknown, nodeLimit: number): unknown {
  if (!Array.isArray(rawInfo)) return rawInfo;
  return rawInfo.filter(info => !(typeof info?.nodes === 'number' && info.nodes >= nodeLimit));
}

/**
 * EW.09: bound scores and the stop line are already dropped, so the deepest exact score left is
 * the deepest completed depth's.
 */
function selectFinalUnrestrictedUpdate(evaluations: CollectedEvaluation[]): CollectedEvaluation {
  const hasReliableDepths = evaluations.every(evaluation => evaluation.depth !== null);
  if (!hasReliableDepths) {
    return [...evaluations].sort((a, b) => b.sequence - a.sequence)[0];
  }

  const greatestDepth = Math.max(...evaluations.map(evaluation => evaluation.depth!));
  return evaluations
    .filter(evaluation => evaluation.depth === greatestDepth)
    .sort((a, b) => b.sequence - a.sequence)[0];
}

export async function runTrustedLocalSearch(
  fullFenInput: string,
  settings: LocalSearchSettings,
  engineFactory: LocalEngineFactory = enginePath => new ConsoleDetachedEngine(enginePath) as StockfishEngine
): Promise<TrustedLocalEvaluation> {
  const fullFen = parseFullFen(fullFenInput);
  if (fullFen !== fullFenInput) throw new Error('Local Engine search requires canonical FullFen');
  assertSearchSettings(settings);

  const enginePath = path.resolve(process.cwd(), 'bin', 'stockfish.exe');
  const engine = engineFactory(enginePath);
  let primaryError: unknown = null;
  try {
    await engine.init();
    // EW.09: a new process per search, so the hash starts empty and earlier searches never matter.
    await engine.setoption('Threads', settings.threads.toString());
    await engine.setoption('Hash', settings.hashMb.toString());
    await engine.setoption('MultiPV', settings.multiPv.toString());
    await engine.position(fullFen);
    const result = await engine.go({ nodes: settings.nodes });
    const best = selectFinalUnrestrictedUpdate(
      collectLocalSearchUpdates(fullFen, dropStopLine(result?.info, settings.nodes))
    );
    return { uci: best.uci, san: best.san, cp: best.cp, mate: best.mate, depth: best.depth };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await engine.quit();
    } catch (cleanupError) {
      if (primaryError === null) throw cleanupError;
    }
  }
}

function deepLocalSettings(config: Config): LocalSearchSettings {
  return {
    nodes: config.localStockfishNodes,
    threads: config.localStockfishThreads,
    hashMb: config.localStockfishHashMb,
    multiPv: config.localStockfishMultiPv
  };
}

// --- HEG.21: the selector's prior evals, searched and read as HE's were ---

export type SelectorEvaluation = { cp: number | null; mate: number | null; depth: number | null };
export type SelectorSearchSettings = { nodes: number; hashMb: number };
export type SelectorSearchRunner = (fullFen: string, uci: string, settings: SelectorSearchSettings) => Promise<SelectorEvaluation>;

/**
 * HE's read (`experiments/he/engine.ts`): the last exact, unbounded score whose first move is the
 * searched one. Unlike EW.09 it keeps the stop line, because the curve was fitted on evals read
 * this way. White's point of view, as DB.15.
 */
export function parseSelectorSearch(lines: readonly string[], fullFen: string, uci: string): SelectorEvaluation {
  const best = /^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)(?:\s|$)/.exec(lines.at(-1) ?? '')?.[1];
  if (best !== uci) throw new Error(`Selector search did not return the requested root move ${uci} at ${fullFen}`);
  const multiplier = fullFen.split(' ')[1] === 'b' ? -1 : 1;
  for (const line of [...lines].reverse()) {
    if (!line.startsWith('info ') || /\b(?:lowerbound|upperbound)\b/.test(line)) continue;
    const depth = Number(/\bdepth (\d+)\b/.exec(line)?.[1]);
    const score = /\bscore (cp|mate) (-?\d+)\b/.exec(line);
    const pv = /\bpv (\S+)/.exec(line)?.[1];
    const multiPv = Number(/\bmultipv (\d+)\b/.exec(line)?.[1] ?? '1');
    if (!depth || !score || !pv || multiPv !== 1) continue;
    if (pv !== uci) break;
    const value = Number(score[2]) * multiplier;
    if (score[1] === 'mate' && value === 0) throw new Error(`Invalid selector mate score at ${fullFen}`);
    return { cp: score[1] === 'cp' ? (value === 0 ? 0 : value) : null, mate: score[1] === 'mate' ? value : null, depth };
  }
  throw new Error(`Selector search gave no exact score for ${uci} at ${fullFen}`);
}

type SelectorEngine = {
  init(): Promise<void>;
  setoption(name: string, value: string): Promise<void>;
  position(fen: string): Promise<void>;
  goSearchmoves(nodes: number, uci: string): Promise<string[]>;
  quit(): Promise<void>;
};

export async function runSelectorSearch(
  fullFenInput: string,
  uci: string,
  settings: SelectorSearchSettings,
  engineFactory: (enginePath: string) => SelectorEngine = enginePath => new ConsoleDetachedEngine(enginePath) as unknown as SelectorEngine
): Promise<SelectorEvaluation> {
  const fullFen = parseFullFen(fullFenInput);
  if (fullFen !== fullFenInput) throw new Error('Selector search requires canonical FullFen');
  assertLegalRoot(fullFen, uci);
  const engine = engineFactory(path.resolve(process.cwd(), 'bin', 'stockfish.exe'));
  let primaryError: unknown = null;
  try {
    await engine.init();
    // A new process per search, so the hash starts empty, as HE's ucinewgame and Clear Hash did.
    await engine.setoption('Threads', '1');
    await engine.setoption('Hash', settings.hashMb.toString());
    await engine.setoption('MultiPV', '1');
    await engine.position(fullFen);
    return parseSelectorSearch(await engine.goSearchmoves(settings.nodes, uci), fullFen, uci);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await engine.quit();
    } catch (cleanupError) {
      if (primaryError === null) throw cleanupError;
    }
  }
}

/** HEG.21: a move's 2M eval, from EngineCache under the selector's profile, or searched once. */
export async function getOrCreateSelectorEval(
  fullFen: string,
  uci: string,
  config: Config = defaultConfig,
  runner: SelectorSearchRunner = runSelectorSearch
): Promise<SelectorEvaluation & { reused: boolean }> {
  const profile = computeSelectorEngineProfile(config);
  const cached = await readLocalEngineCandidate(fullFen, uci, profile);
  if (cached) return { cp: cached.cp, mate: cached.mate, depth: cached.depth ?? null, reused: true };
  const evaluation = await runner(fullFen, uci, { nodes: config.selectorNodes, hashMb: config.selectorHashMb });
  await saveLocalEngineCandidate(fullFen, uci, profile, { uci, cp: evaluation.cp, mate: evaluation.mate, depth: evaluation.depth });
  return { ...evaluation, reused: false };
}

export async function getOrCreateLocalBaseline(
  fullFen: string,
  config: Config = defaultConfig,
  runner: LocalSearchRunner = runTrustedLocalSearch
): Promise<{ evaluationProfile: string; evaluation: TrustedLocalEvaluation; reused: boolean }> {
  const evaluationProfile = computeLocalEngineEvaluationProfile(config);
  const cached = await readLocalEngineBaseline(fullFen, evaluationProfile);
  if (cached) {
    return {
      evaluationProfile,
      evaluation: { uci: cached.uci, san: cached.san, cp: cached.cp, mate: cached.mate, depth: cached.depth },
      reused: true
    };
  }

  const evaluation = await runner(fullFen, deepLocalSettings(config));
  const saved = await saveLocalEngineBaseline(fullFen, evaluationProfile, evaluation);
  return {
    evaluationProfile,
    evaluation: { uci: saved.bestUci, san: saved.san!, cp: saved.cp, mate: saved.mate, depth: saved.depth },
    reused: false
  };
}
