import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';

import { evaluateBlackMove } from './evaluator';
import { computeRemoteEngineEvaluationProfile, defaultConfig } from './config';
import { parseFullFen, positionKeyFromFen } from './fen';
import type { LocalSearchRunner, TrustedLocalEvaluation } from './local-engine';
import {
  createHumanDataSnapshot,
  getOrCreatePosition,
  saveHumanExplorerBucket,
  saveRemoteEngineResult
} from '../db/operations';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const ordinaryFen = 'rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3';
const e4Fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const cpEval = (uci: string, san: string, cp: number): TrustedLocalEvaluation => ({ uci, san, cp, mate: null });
const mateEval = (uci: string, san: string, mate: number): TrustedLocalEvaluation => ({ uci, san, cp: null, mate });

async function setupPosition(fen: string, mastersMoves: Array<{ uci: string; san: string; games: number; whiteWins: number; draws: number; blackWins: number }>) {
  const user = await prisma.user.create({ data: { username: `slice12-${Date.now()}-${Math.random()}` } });
  const repertoire = await prisma.repertoire.create({ data: { title: 'Slice 12', color: 'black', userId: user.id } });
  const snapshot = await createHumanDataSnapshot(repertoire.id, `slice12-${Date.now()}-${Math.random()}`);
  const positionKey = positionKeyFromFen(parseFullFen(fen));
  await getOrCreatePosition(fen);
  await saveHumanExplorerBucket(snapshot.id, positionKey, 'MASTERS', mastersMoves);
  await saveHumanExplorerBucket(snapshot.id, positionKey, 'ELITE', []);
  await saveHumanExplorerBucket(snapshot.id, positionKey, 'AMATEUR', []);
  await saveRemoteEngineResult(fen, 'LICHESS', computeRemoteEngineEvaluationProfile('LICHESS', defaultConfig), []);
  await saveRemoteEngineResult(fen, 'CHESSDB', computeRemoteEngineEvaluationProfile('CHESSDB', defaultConfig), []);
  return { user, repertoire, snapshot };
}

async function cleanup(userId: string, repertoireId: string) {
  await prisma.repertoire.delete({ where: { id: repertoireId } });
  await prisma.user.delete({ where: { id: userId } });
}

test('Slice 12 B4 Local Deep integration', async (t) => {
  await prisma.localEngineCandidate.deleteMany();
  await prisma.localEngineBaseline.deleteMany();

  await t.test('remote inconclusive invokes LS for same HCM; ACCEPT keeps exact eval/source/deep metadata', async () => {
    const state = await setupPosition(ordinaryFen, [
      { uci: 'b8d7', san: 'Nbd7', games: 300, whiteWins: 50, draws: 50, blackWins: 200 }
    ]);
    const requested: Array<string | undefined> = [];
    const runner: LocalSearchRunner = async (_fen, settings, expected) => {
      requested.push(expected);
      assert.equal(settings.depth, defaultConfig.engine.deepVerification.depth);
      assert.equal(settings.multiPv, 1);
      return expected ? cpEval(expected, 'Nbd7', -50) : cpEval('e7e5', 'e5', -100);
    };
    try {
      const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], state.snapshot.id, { localSearchRunner: runner });
      assert.equal(result.selectedMoveSan, 'Nbd7');
      assert.equal(result.selectedEngineCp, -50);
      assert.equal(result.selectedMate, null);
      assert.equal(result.evalSource, 'Local Deep Stockfish');
      assert.equal(result.deepVerified, true);
      assert.equal(result.selectedUci, 'b8d7');
      assert.equal(result.selectionMethod, 'Ordinary API');
      assert.equal(result.moveOrigin, 'Human Move');
      assert.ok(result.localEvaluationProfile);
      assert.equal(typeof result.localEvaluationProfile, 'string');
      assert.deepEqual(requested, [undefined, 'b8d7']);
    } finally {
      await cleanup(state.user.id, state.repertoire.id);
    }
  });

  await t.test('valid LS REJECT advances to next HCM and first accepted Local HCM wins', async () => {
    await prisma.localEngineCandidate.deleteMany();
    await prisma.localEngineBaseline.deleteMany();
    const state = await setupPosition(ordinaryFen, [
      { uci: 'b8d7', san: 'Nbd7', games: 300, whiteWins: 50, draws: 50, blackWins: 200 },
      { uci: 'b8c6', san: 'Nc6', games: 250, whiteWins: 60, draws: 50, blackWins: 140 }
    ]);
    const requested: Array<string | undefined> = [];
    const runner: LocalSearchRunner = async (_fen, _settings, expected) => {
      requested.push(expected);
      if (expected === 'b8d7') return cpEval(expected, 'Nbd7', 0);
      if (expected === 'b8c6') return cpEval(expected, 'Nc6', -50);
      return cpEval('e7e5', 'e5', -100);
    };
    try {
      const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], state.snapshot.id, { localSearchRunner: runner });
      assert.equal(result.selectedMoveSan, 'Nc6');
      assert.equal(result.selectedEngineCp, -50);
      assert.deepEqual(requested, [undefined, 'b8d7', 'b8c6']);
    } finally {
      await cleanup(state.user.id, state.repertoire.id);
    }
  });

  await t.test('LS technical failure stops generation instead of rejecting HCM', async () => {
    await prisma.localEngineCandidate.deleteMany();
    await prisma.localEngineBaseline.deleteMany();
    const state = await setupPosition(ordinaryFen, [
      { uci: 'b8d7', san: 'Nbd7', games: 300, whiteWins: 50, draws: 50, blackWins: 200 }
    ]);
    const runner: LocalSearchRunner = async () => { throw new Error('Stockfish crashed'); };
    try {
      await assert.rejects(
        evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], state.snapshot.id, { localSearchRunner: runner }),
        /Stockfish crashed/
      );
    } finally {
      await cleanup(state.user.id, state.repertoire.id);
    }
  });

  await t.test('empty shortlist selects exact Local Deep baseline result', async () => {
    await prisma.localEngineCandidate.deleteMany();
    await prisma.localEngineBaseline.deleteMany();
    const state = await setupPosition(ordinaryFen, []);
    let calls = 0;
    const runner: LocalSearchRunner = async (_fen, _settings, expected) => {
      calls += 1;
      assert.equal(expected, undefined);
      return cpEval('e7e5', 'e5', -25);
    };
    try {
      const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], state.snapshot.id, { localSearchRunner: runner });
      assert.equal(result.selectedMoveSan, 'e5');
      assert.equal(result.selectedEngineCp, -25);
      assert.equal(result.evalSource, 'Local Deep Stockfish');
      assert.equal(result.deepVerified, true);
      assert.equal(result.selectionMethod, 'Local Engine Fallback');
      assert.equal(result.moveOrigin, 'Engine Move');
      assert.ok(result.localEvaluationProfile);
      assert.equal(calls, 1);
    } finally {
      await cleanup(state.user.id, state.repertoire.id);
    }
  });

  await t.test('all HCMs rejected reuse baseline for final fallback and never return unverified human move', async () => {
    await prisma.localEngineCandidate.deleteMany();
    await prisma.localEngineBaseline.deleteMany();
    const state = await setupPosition(ordinaryFen, [
      { uci: 'b8d7', san: 'Nbd7', games: 300, whiteWins: 50, draws: 50, blackWins: 200 }
    ]);
    const requested: Array<string | undefined> = [];
    const runner: LocalSearchRunner = async (_fen, _settings, expected) => {
      requested.push(expected);
      return expected ? cpEval(expected, 'Nbd7', 50) : cpEval('e7e5', 'e5', -100);
    };
    try {
      const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], state.snapshot.id, { localSearchRunner: runner });
      assert.equal(result.selectedMoveSan, 'e5');
      assert.equal(result.selectedEngineCp, -100);
      assert.equal(result.deepVerified, true);
      assert.deepEqual(requested, [undefined, 'b8d7']);
    } finally {
      await cleanup(state.user.id, state.repertoire.id);
    }
  });

  await t.test('hardcoded remote absence uses and reuses shared exact-candidate LS cp evidence', async () => {
    await prisma.localEngineCandidate.deleteMany();
    await prisma.localEngineBaseline.deleteMany();
    const first = await setupPosition(e4Fen, []);
    const requested: Array<string | undefined> = [];
    const runner: LocalSearchRunner = async (_fen, _settings, expected) => {
      requested.push(expected);
      if (expected !== 'c7c6') throw new Error('hardcoded path must request c7c6 only');
      return cpEval('c7c6', 'c6', 42);
    };
    try {
      const result = await evaluateBlackMove(e4Fen, new Chess(e4Fen), 1, ['e4'], first.snapshot.id, { localSearchRunner: runner });
      assert.equal(result.selectedMoveSan, 'c6');
      assert.equal(result.selectedEngineCp, 42);
      assert.equal(result.evalSource, 'Local Deep Stockfish');
      assert.equal(result.deepVerified, false);
      assert.equal(result.selectionMethod, 'Hardcoded Opening');
      assert.equal(result.moveOrigin, 'Hardcoded Move');
      assert.deepEqual(requested, ['c7c6']);

      const second = await setupPosition(e4Fen, []);
      try {
        const cached = await evaluateBlackMove(e4Fen, new Chess(e4Fen), 1, ['e4'], second.snapshot.id, {
          localSearchRunner: async () => { throw new Error('compatible candidate cache was ignored'); }
        });
        assert.equal(cached.selectedEngineCp, 42);
      } finally {
        await cleanup(second.user.id, second.repertoire.id);
      }
    } finally {
      await cleanup(first.user.id, first.repertoire.id);
    }
  });

  await t.test('hardcoded Local mate remains explicit and wrong returned root hard-errors', async () => {
    await prisma.localEngineCandidate.deleteMany();
    const mateState = await setupPosition(e4Fen, []);
    try {
      const mate = await evaluateBlackMove(e4Fen, new Chess(e4Fen), 1, ['e4'], mateState.snapshot.id, {
        localSearchRunner: async () => mateEval('c7c6', 'c6', -4)
      });
      assert.equal(mate.selectedEngineCp, null);
      assert.equal(mate.selectedMate, -4);
      assert.equal(mate.evalSource, 'Local Deep Stockfish');
    } finally {
      await cleanup(mateState.user.id, mateState.repertoire.id);
    }

    await prisma.localEngineCandidate.deleteMany();
    const wrongState = await setupPosition(e4Fen, []);
    try {
      await assert.rejects(
        evaluateBlackMove(e4Fen, new Chess(e4Fen), 1, ['e4'], wrongState.snapshot.id, {
          localSearchRunner: async () => cpEval('e7e5', 'e5', 0)
        }),
        /requested c7c6 but returned e7e5/
      );
    } finally {
      await cleanup(wrongState.user.id, wrongState.repertoire.id);
    }
  });

  await prisma.$disconnect();
});
