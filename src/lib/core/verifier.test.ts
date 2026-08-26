import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOrdinaryCpSnapshot, type OrdinaryCpSnapshotEntry } from './verifier';

const cp = (uci: string, value: number): OrdinaryCpSnapshotEntry => ({ uci, cp: value });

test('empty successful ordinary snapshot is inconclusive', () => {
  assert.equal(verifyOrdinaryCpSnapshot('e7e5', [], 50), 'INCONCLUSIVE');
});

test('present candidate uses inclusive candidateCp - bestCp loss', () => {
  const snapshot = [cp('g8f6', -40), cp('e7e6', -20), cp('c7c5', 10), cp('d7d5', 11)];
  assert.equal(verifyOrdinaryCpSnapshot('g8f6', snapshot, 0), 'ACCEPT');
  assert.equal(verifyOrdinaryCpSnapshot('e7e6', snapshot, 20), 'ACCEPT');
  assert.equal(verifyOrdinaryCpSnapshot('c7c5', snapshot, 50), 'ACCEPT');
  assert.equal(verifyOrdinaryCpSnapshot('d7d5', snapshot, 50), 'REJECT');
});

test('negative and mixed-sign cp values retain the White-positive convention', () => {
  assert.equal(verifyOrdinaryCpSnapshot('e7e6', [cp('g8f6', -80), cp('e7e6', -20)], 60), 'ACCEPT');
  assert.equal(verifyOrdinaryCpSnapshot('e7e6', [cp('g8f6', -40), cp('e7e6', 10)], 49), 'REJECT');
});

test('absent candidate uses a strict worst-returned boundary', () => {
  assert.equal(verifyOrdinaryCpSnapshot('e7e5', [cp('g8f6', -50), cp('e7e6', 20)], 50), 'REJECT');
  assert.equal(verifyOrdinaryCpSnapshot('e7e5', [cp('g8f6', -50), cp('e7e6', -10)], 50), 'INCONCLUSIVE');
  assert.equal(verifyOrdinaryCpSnapshot('e7e5', [cp('g8f6', -50), cp('e7e6', 0)], 50), 'INCONCLUSIVE');
  assert.equal(verifyOrdinaryCpSnapshot('e7e5', [cp('g8f6', -50)], 0), 'INCONCLUSIVE');
});

test('caller order, reversed order, and SAN metadata do not affect decisions', () => {
  const sorted = [cp('g8f6', -70), cp('e7e6', -45), cp('c7c5', 25)];
  const shuffled = [{ ...sorted[2], san: 'c5' }, { ...sorted[0], san: 'Nf6' }, { ...sorted[1], san: 'e6' }];
  assert.equal(verifyOrdinaryCpSnapshot('e7e5', sorted, 50), 'REJECT');
  assert.equal(verifyOrdinaryCpSnapshot('e7e5', shuffled, 50), 'REJECT');
  assert.equal(verifyOrdinaryCpSnapshot('e7e5', [...sorted].reverse(), 50), 'REJECT');
});

test('duplicate move identity is a hard error', () => {
  assert.throws(() => verifyOrdinaryCpSnapshot('e7e5', [cp('g8f6', -35), cp('e7e6', -20), cp('g8f6', -18)], 50), /Duplicate UCI/);
});

test('missing, null, NaN, infinity, and non-number cp are hard errors', () => {
  const invalid = [
    { uci: 'g8f6' },
    { uci: 'g8f6', cp: null },
    { uci: 'g8f6', cp: Number.NaN },
    { uci: 'g8f6', cp: Number.POSITIVE_INFINITY },
    { uci: 'g8f6', cp: Number.NEGATIVE_INFINITY },
    { uci: 'g8f6', cp: '-20' }
  ];
  for (const entry of invalid) {
    assert.throws(() => verifyOrdinaryCpSnapshot('e7e5', [entry] as any, 50), /Invalid ordinary cp evaluation/);
  }
  assert.equal(verifyOrdinaryCpSnapshot('g8f6', [cp('g8f6', 0)], 0), 'ACCEPT');
});

test('malformed snapshot and candidate UCI identities are hard errors', () => {
  for (const uci of ['Nf6', 'g8g8', 'a6a7q', 'e2e4qq']) {
    assert.throws(() => verifyOrdinaryCpSnapshot('e7e5', [{ uci, cp: -10 }] as any, 50), /snapshot UCI/);
  }
  assert.throws(() => verifyOrdinaryCpSnapshot('e5' as any, [cp('g8f6', -10)], 50), /candidate UCI/);
});

test('invalid tolerance is a hard error', () => {
  assert.throws(() => verifyOrdinaryCpSnapshot('e7e5', [], -1), /Invalid PV tolerance/);
  assert.throws(() => verifyOrdinaryCpSnapshot('e7e5', [], Number.NaN), /Invalid PV tolerance/);
  assert.throws(() => verifyOrdinaryCpSnapshot('e7e5', [], Number.POSITIVE_INFINITY), /Invalid PV tolerance/);
});

test('mate-containing input cannot enter or be converted by ordinary PV', () => {
  assert.throws(
    () => verifyOrdinaryCpSnapshot('e7e5', [{ uci: 'g8f6', cp: -30003, mate: -3 } as any], 50),
    /Wrong evaluation kind/
  );
  assert.throws(
    () => verifyOrdinaryCpSnapshot('e7e5', [{ uci: 'g8f6', cp: null, mate: -3 } as any], 50),
    /Wrong evaluation kind/
  );
});

test('bestCp is derived internally, so no absolute-difference path can hide ordering', () => {
  const candidateBetterThanFirstCallerEntry = [cp('e7e6', -20), cp('g8f6', -80)];
  assert.equal(verifyOrdinaryCpSnapshot('g8f6', candidateBetterThanFirstCallerEntry, 0), 'ACCEPT');
  assert.equal(verifyOrdinaryCpSnapshot('e7e6', candidateBetterThanFirstCallerEntry, 59), 'REJECT');
});
