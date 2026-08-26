import { test } from 'node:test';
import * as assert from 'node:assert';
import { analyseLichessMateSnapshot, verifyCandidateAgainstLichessMate } from './lichess-mate';
import type { RemoteEngineEvaluation } from '../db/operations';

test('B3 Lichess Mate tests', async (t) => {
  await t.test('1. no mate in Lichess -> NO_MATE', () => {
    const evals: RemoteEngineEvaluation[] = [
      { uci: 'e2e4', cp: 100, mate: null },
      { uci: 'd2d4', cp: 50, mate: null }
    ];
    const res = analyseLichessMateSnapshot(evals);
    assert.strictEqual(res.kind, 'NO_MATE');
  });

  await t.test('2. one Black forced mate -> FORCED_MATE', () => {
    const evals: RemoteEngineEvaluation[] = [
      { uci: 'e2e4', cp: null, mate: -3 }
    ];
    const res = analyseLichessMateSnapshot(evals);
    assert.strictEqual(res.kind, 'FORCED_MATE');
    if (res.kind === 'FORCED_MATE') {
      assert.strictEqual(res.shortestMateDistance, 3);
      assert.strictEqual(res.shortestMateMoves.has('e2e4'), true);
    }
  });

  await t.test('3. several Black mating moves -> shortest distance identified', () => {
    const evals: RemoteEngineEvaluation[] = [
      { uci: 'a', cp: null, mate: -5 },
      { uci: 'b', cp: null, mate: -2 },
      { uci: 'c', cp: null, mate: -8 }
    ];
    const res = analyseLichessMateSnapshot(evals);
    assert.strictEqual(res.kind, 'FORCED_MATE');
    if (res.kind === 'FORCED_MATE') {
      assert.strictEqual(res.shortestMateDistance, 2);
      assert.strictEqual(res.shortestMateMoves.has('b'), true);
      assert.strictEqual(res.shortestMateMoves.size, 1);
    }
  });

  await t.test('4. two moves with equal shortest mate -> both acceptable', () => {
    const evals: RemoteEngineEvaluation[] = [
      { uci: 'a', cp: null, mate: -3 },
      { uci: 'b', cp: null, mate: -5 },
      { uci: 'c', cp: null, mate: -3 }
    ];
    const res = analyseLichessMateSnapshot(evals);
    assert.strictEqual(res.kind, 'FORCED_MATE');
    if (res.kind === 'FORCED_MATE') {
      assert.strictEqual(res.shortestMateDistance, 3);
      assert.strictEqual(res.shortestMateMoves.has('a'), true);
      assert.strictEqual(res.shortestMateMoves.has('c'), true);
    }
  });

  await t.test('5,6,7,8. HCM verification rules', () => {
    const evals: RemoteEngineEvaluation[] = [
      { uci: 'best', cp: null, mate: -2 },
      { uci: 'longer', cp: null, mate: -5 },
      { uci: 'cp_move', cp: 100, mate: null }
    ];
    const res = analyseLichessMateSnapshot(evals);
    assert.strictEqual(res.kind, 'FORCED_MATE');
    if (res.kind === 'FORCED_MATE') {
      assert.strictEqual(verifyCandidateAgainstLichessMate('best', res), 'ACCEPT');
      assert.strictEqual(verifyCandidateAgainstLichessMate('longer', res), 'REJECT');
      assert.strictEqual(verifyCandidateAgainstLichessMate('cp_move', res), 'REJECT');
      assert.strictEqual(verifyCandidateAgainstLichessMate('absent', res), 'REJECT');
    }
  });

  await t.test('13. equal shortest mates -> fallback respects original Lichess ordering', () => {
    const evals: RemoteEngineEvaluation[] = [
      { uci: 'first_longer', cp: null, mate: -4 },
      { uci: 'first_short', cp: null, mate: -2 },
      { uci: 'second_short', cp: null, mate: -2 }
    ];
    const res = analyseLichessMateSnapshot(evals);
    assert.strictEqual(res.kind, 'FORCED_MATE');
    if (res.kind === 'FORCED_MATE') {
      assert.strictEqual(res.fallbackUci, 'first_short');
      assert.strictEqual(res.fallbackMate, -2);
    }
  });

  await t.test('14,15. provider order does not change which distances are acceptable', () => {
    const evals: RemoteEngineEvaluation[] = [
      { uci: 'long', cp: null, mate: -5 },
      { uci: 'short', cp: null, mate: -1 }
    ];
    const res = analyseLichessMateSnapshot(evals);
    assert.strictEqual(res.kind, 'FORCED_MATE');
    if (res.kind === 'FORCED_MATE') {
      assert.strictEqual(res.shortestMateDistance, 1);
      assert.strictEqual(verifyCandidateAgainstLichessMate('short', res), 'ACCEPT');
      assert.strictEqual(verifyCandidateAgainstLichessMate('long', res), 'REJECT');
    }
  });

  await t.test('22. malformed mate state: hard error', () => {
    assert.throws(() => analyseLichessMateSnapshot([{ uci: 'a', cp: null, mate: 0 }]), /Invalid mate data/);
    assert.throws(() => analyseLichessMateSnapshot([{ uci: 'a', cp: null, mate: 1.5 }]), /Invalid mate data/);
    assert.throws(() => analyseLichessMateSnapshot([{ uci: 'a', cp: 100, mate: -3 }]), /Invalid mate data: cannot have both cp and mate/);
    assert.throws(() => analyseLichessMateSnapshot([{ uci: 'a', cp: null, mate: null }]), /Invalid evaluation/);
    assert.throws(() => analyseLichessMateSnapshot([{ uci: 'a', cp: null, mate: -3 }, { uci: 'a', cp: 10, mate: null }]), /Duplicate UCI/);
  });

  await t.test('23. forced mate for White does not get mistaken for forced mate for Black', () => {
    const evals: RemoteEngineEvaluation[] = [
      { uci: 'a', cp: null, mate: +3 }
    ];
    const res = analyseLichessMateSnapshot(evals);
    assert.strictEqual(res.kind, 'NO_MATE');
  });

  await t.test('24. mixture of cp and Black-mate entries: correct best-category logic', () => {
    const evals: RemoteEngineEvaluation[] = [
      { uci: 'a', cp: -9000, mate: null },
      { uci: 'b', cp: null, mate: -2 },
      { uci: 'c', cp: null, mate: +5 }
    ];
    const res = analyseLichessMateSnapshot(evals);
    assert.strictEqual(res.kind, 'FORCED_MATE');
    if (res.kind === 'FORCED_MATE') {
      assert.strictEqual(res.shortestMateDistance, 2);
    }
  });
});
