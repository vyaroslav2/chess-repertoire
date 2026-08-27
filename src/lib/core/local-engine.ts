import { Engine } from 'node-uci';
import { Chess } from 'chess.js';
import * as path from 'path';

import { defaultConfig, computeLocalEngineEvaluationProfile, type Config } from './config';
import { parseFullFen } from './fen';
import { isValidUciMove } from './uci';
import { verifyLocalOrdinaryCp, type PvDecision } from './verifier';
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
  go(params: { depth: number; searchmoves?: string }): Promise<{ info?: unknown[] }>;
  quit(): Promise<void>;
};

export type LocalEngineFactory = (enginePath: string) => StockfishEngine;

export type TrustedLocalEvaluation = LocalEngineEvaluation & {
  san: string;
};

export type LocalSearchSettings = {
  depth: number;
  multiPv: number;
};

export type LocalSearchRunner = (
  fullFen: string,
  settings: LocalSearchSettings,
  expectedUci?: string
) => Promise<TrustedLocalEvaluation>;

function assertSearchSettings(settings: LocalSearchSettings): void {
  if (!Number.isInteger(settings.depth) || settings.depth < 1) {
    throw new Error('Invalid Local Engine depth');
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
  rawInfo: unknown,
  expectedUci?: string
): CollectedEvaluation[] {
  const fullFen = parseFullFen(fullFenInput);
  if (fullFen !== fullFenInput) throw new Error('Local Engine search requires canonical FullFen');
  if (expectedUci !== undefined) assertLegalRoot(fullFen, expectedUci);
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
    if (expectedUci !== undefined && uci !== expectedUci) {
      throw new Error(`Invariant violation: Local Stockfish searchmoves requested ${expectedUci} but returned ${uci}`);
    }
    const san = assertLegalRoot(fullFen, uci);
    const value = info.score.value;
    let cp: number | null = null;
    let mate: number | null = null;
    if (info.score.unit === 'mate') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error(`Invalid Local Engine mate evaluation for ${uci}`);
      }
      mate = value === 0 ? 0 : value * multiplier;
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

  if (expectedUci !== undefined && !updates.has(expectedUci)) {
    throw new Error(`Local Engine returned no usable result for expected root ${expectedUci}`);
  }
  if (updates.size === 0) throw new Error('Local Engine returned zero usable root evaluations');
  return [...updates.values()];
}

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
  expectedUci?: string,
  engineFactory: LocalEngineFactory = enginePath => new Engine(enginePath) as StockfishEngine
): Promise<TrustedLocalEvaluation> {
  const fullFen = parseFullFen(fullFenInput);
  if (fullFen !== fullFenInput) throw new Error('Local Engine search requires canonical FullFen');
  assertSearchSettings(settings);
  if (expectedUci !== undefined) assertLegalRoot(fullFen, expectedUci);

  const enginePath = path.resolve(process.cwd(), 'bin', 'stockfish.exe');
  const engine = engineFactory(enginePath);
  let primaryError: unknown = null;
  try {
    await engine.init();
    await engine.setoption('MultiPV', settings.multiPv.toString());
    await engine.position(fullFen);
    const goParams: { depth: number; searchmoves?: string } = { depth: settings.depth };
    if (expectedUci !== undefined) goParams.searchmoves = expectedUci;
    const result = await engine.go(goParams);
    const evaluations = collectLocalSearchUpdates(fullFen, result?.info, expectedUci);
    const trusted = (evaluation: CollectedEvaluation): TrustedLocalEvaluation => ({
      uci: evaluation.uci,
      san: evaluation.san,
      cp: evaluation.cp,
      mate: evaluation.mate
    });
    if (expectedUci !== undefined) return trusted(evaluations.find(item => item.uci === expectedUci)!);
    return trusted(selectFinalUnrestrictedUpdate(evaluations));
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
    depth: config.engine.deepVerification.depth,
    multiPv: config.engine.deepVerification.multiPv
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

export async function getOrCreateLocalCandidate(
  fullFen: string,
  candidateUci: string,
  config: Config = defaultConfig,
  runner: LocalSearchRunner = runTrustedLocalSearch
): Promise<{ evaluationProfile: string; evaluation: TrustedLocalEvaluation; reused: boolean }> {
  assertLegalRoot(parseFullFen(fullFen), candidateUci);
  const evaluationProfile = computeLocalEngineEvaluationProfile(config);
  const cached = await readLocalEngineCandidate(fullFen, candidateUci, evaluationProfile);
  if (cached) {
    return {
      evaluationProfile,
      evaluation: { uci: cached.uci, san: cached.san, cp: cached.cp, mate: cached.mate },
      reused: true
    };
  }

  const evaluation = await runner(fullFen, deepLocalSettings(config), candidateUci);
  if (evaluation.uci !== candidateUci) {
    throw new Error(`Invariant violation: Local Stockfish searchmoves requested ${candidateUci} but returned ${evaluation.uci}`);
  }
  const saved = await saveLocalEngineCandidate(fullFen, candidateUci, evaluationProfile, evaluation);
  return {
    evaluationProfile,
    evaluation: { uci: saved.candidateUci, san: saved.san!, cp: saved.cp, mate: saved.mate },
    reused: false
  };
}

export type LocalCandidateVerification = {
  decision: Exclude<PvDecision, 'INCONCLUSIVE'>;
  baseline: TrustedLocalEvaluation;
  candidate: TrustedLocalEvaluation;
  evaluationProfile: string;
  candidateWasBaselineBest: boolean;
};

export async function verifyLocalCandidate(
  fullFen: string,
  candidateUci: string,
  toleranceCp: number,
  config: Config = defaultConfig,
  runner: LocalSearchRunner = runTrustedLocalSearch
): Promise<LocalCandidateVerification> {
  const baselineResult = await getOrCreateLocalBaseline(fullFen, config, runner);
  if (baselineResult.evaluation.uci === candidateUci) {
    return {
      decision: 'ACCEPT',
      baseline: baselineResult.evaluation,
      candidate: baselineResult.evaluation,
      evaluationProfile: baselineResult.evaluationProfile,
      candidateWasBaselineBest: true
    };
  }

  const candidateResult = await getOrCreateLocalCandidate(fullFen, candidateUci, config, runner);
  const baseline = baselineResult.evaluation;
  const candidate = candidateResult.evaluation;
  if (baseline.cp === null || candidate.cp === null || baseline.mate !== null || candidate.mate !== null) {
    throw new Error('Local mate comparison is outside the ordinary cp verifier');
  }
  return {
    decision: verifyLocalOrdinaryCp(baseline.cp, candidate.cp, toleranceCp),
    baseline,
    candidate,
    evaluationProfile: baselineResult.evaluationProfile,
    candidateWasBaselineBest: false
  };
}

// Compatibility surface for old diagnostic scripts only. The B4/LS path does
// not use broad MultiPV or artificial mate-to-cp values.
export async function runLocalStockfish(fen: string, multiPv: number, depth: number, searchmoves?: string): Promise<any[]> {
  const settings = { depth, multiPv };
  if (multiPv === 1) {
    const evaluation = await runTrustedLocalSearch(parseFullFen(fen), settings, searchmoves);
    return [{ cp: evaluation.cp, mate: evaluation.mate, moves: evaluation.uci }];
  }
  throw new Error('Legacy broad MultiPV Local Stockfish searches are no longer supported');
}
