import { Engine } from 'node-uci';
import { Chess } from 'chess.js';
import { spawn } from 'child_process';
import * as path from 'path';

import { defaultConfig, computeLocalEngineEvaluationProfile, type Config } from './config';
import { parseFullFen } from './fen';
import { isValidUciMove } from './uci';
import {
  readLocalEngineBaseline,
  saveLocalEngineBaseline,
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
    this.write(`go nodes ${params.nodes}`);
    const lines = await this.getBufferUntil(line => line.startsWith('bestmove '));
    return { info: lines.map(parseInfoLine).filter(info => info !== null) };
  }
}

/** One `info` line in the shape node-uci gives: depth, score { unit, value }, pv. Bound scores are skipped. */
export function parseInfoLine(line: string): { depth: number; score: { unit: string; value: number }; pv: string } | null {
  if (!line.startsWith('info ') || /\b(?:lowerbound|upperbound)\b/.test(line)) return null;
  const depth = /\bdepth (\d+)/.exec(line);
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  const pv = / pv (.+)$/.exec(line);
  if (!depth || !score || !pv) return null;
  return { depth: Number(depth[1]), score: { unit: score[1], value: Number(score[2]) }, pv: pv[1].trim() };
}

export type TrustedLocalEvaluation = LocalEngineEvaluation & {
  san: string;
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
  depth: number | null;
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
 * EW.09: the node limit nearly always stops the search part-way through a depth. Bound scores
 * are already dropped, so the deepest exact score left is the deepest completed depth's. As in HE.
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
    const best = selectFinalUnrestrictedUpdate(collectLocalSearchUpdates(fullFen, result?.info));
    return { uci: best.uci, san: best.san, cp: best.cp, mate: best.mate };
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
      evaluation: { uci: cached.uci, san: cached.san, cp: cached.cp, mate: cached.mate },
      reused: true
    };
  }

  const evaluation = await runner(fullFen, deepLocalSettings(config));
  const saved = await saveLocalEngineBaseline(fullFen, evaluationProfile, evaluation);
  return {
    evaluationProfile,
    evaluation: { uci: saved.bestUci, san: saved.san!, cp: saved.cp, mate: saved.mate },
    reused: false
  };
}
