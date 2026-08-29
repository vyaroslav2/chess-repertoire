import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

import { defaultConfig, computeLocalEngineEvaluationProfile, type Config } from './config';
import {
  collectLocalSearchUpdates,
  getOrCreateLocalBaseline,
  getOrCreateLocalCandidate,
  runTrustedLocalSearch,
  verifyLocalCandidate,
  type LocalEngineFactory,
  type LocalSearchRunner,
  type TrustedLocalEvaluation
} from './local-engine';
import { verifyLocalOrdinaryCp } from './verifier';
import { readLocalEngineBaseline, saveLocalEngineBaseline, saveLocalEngineCandidate } from '../db/operations';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const blackFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const blackFenCounters = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 7 9';
const profile = computeLocalEngineEvaluationProfile(defaultConfig);
const cpEval = (uci: string, san: string, cp: number): TrustedLocalEvaluation => ({ uci, san, cp, mate: null });
const mateEval = (uci: string, san: string, mate: number): TrustedLocalEvaluation => ({ uci, san, cp: null, mate });

function configWithDepth(depth: number): Config {
  const config = JSON.parse(JSON.stringify(defaultConfig)) as Config;
  config.engine.deepVerification.depth = depth;
  return config;
}

function engineFactory(
  info: unknown[],
  calls: Array<{ kind: string; value?: unknown }>,
  goError?: Error
): LocalEngineFactory {
  return () => ({
    async init() { calls.push({ kind: 'init' }); },
    async setoption(name, value) { calls.push({ kind: 'setoption', value: [name, value] }); },
    async position(fen) { calls.push({ kind: 'position', value: fen }); },
    async go(params) {
      calls.push({ kind: 'go', value: params });
      if (goError) throw goError;
      return { info };
    },
    async quit() { calls.push({ kind: 'quit' }); }
  });
}

test('Slice 12 trusted Local Deep Stockfish evidence', async (t) => {
  await prisma.localEngineCandidate.deleteMany();
  await prisma.localEngineBaseline.deleteMany();

  await t.test('baseline uses exact FullFen, configured deep depth, MultiPV 1, and cleans up', async () => {
    const calls: Array<{ kind: string; value?: unknown }> = [];
    const result = await runTrustedLocalSearch(
      blackFen,
      { depth: 24, multiPv: 1 },
      undefined,
      engineFactory([{ depth: 24, score: { unit: 'cp', value: 42 }, pv: 'e7e5' }], calls)
    );
    assert.deepEqual(result, cpEval('e7e5', 'e5', -42));
    assert.deepEqual(calls.find(call => call.kind === 'position')?.value, blackFen);
    assert.deepEqual(calls.find(call => call.kind === 'setoption')?.value, ['MultiPV', '1']);
    assert.deepEqual(calls.find(call => call.kind === 'go')?.value, { depth: 24 });
    assert.equal(calls.at(-1)?.kind, 'quit');
  });

  await t.test('mate remains explicit and zero cp remains valid', async () => {
    const mate = await runTrustedLocalSearch(
      blackFen,
      { depth: 24, multiPv: 1 },
      undefined,
      engineFactory([{ depth: 24, score: { unit: 'mate', value: 3 }, pv: 'e7e5' }], [])
    );
    assert.deepEqual(mate, mateEval('e7e5', 'e5', -3));
    const zero = collectLocalSearchUpdates(blackFen, [{ depth: 24, score: { unit: 'cp', value: 0 }, pv: 'e7e5' }]);
    assert.equal(zero[0].cp, 0);
    assert.equal(zero[0].mate, null);
    // DB.12: mate = 0 is invalid, unlike cp = 0 — reject it rather than silently accepting it.
    assert.throws(
      () => collectLocalSearchUpdates(blackFen, [{ depth: 24, score: { unit: 'mate', value: 0 }, pv: 'e7e5' }]),
      /Invalid Local Engine mate evaluation/
    );
  });

  await t.test('malformed evaluation shapes and roots hard-error', () => {
    const invalidInfo = [
      [{ pv: 'e7e5', score: {} }],
      [{ pv: 'e7e5', score: { unit: 'cp', value: Number.NaN } }],
      [{ pv: 'e7e5', score: { unit: 'cp', value: Number.POSITIVE_INFINITY } }],
      [{ pv: 'e7e5', score: { unit: 'mate', value: 1.5 } }],
      [{ pv: 'e7e5', score: { unit: 'mate', value: 0 } }],
      [{ pv: 'bad', score: { unit: 'cp', value: 0 } }],
      [{ pv: 'e7e5' }],
      [{ score: { unit: 'cp', value: 0 } }]
    ];
    for (const info of invalidInfo) assert.throws(() => collectLocalSearchUpdates(blackFen, info));
    assert.throws(() => collectLocalSearchUpdates(blackFen, []), /zero usable/);
  });

  await t.test('missing and unknown score units hard-error and are never persisted', async () => {
    await prisma.localEngineBaseline.deleteMany();
    const invalidStreams = [
      [{ depth: 24, score: { value: 20 }, pv: 'e7e5' }],
      [{ depth: 24, score: { unit: 'wdl', value: 20 }, pv: 'e7e5' }]
    ];

    for (const info of invalidStreams) {
      assert.throws(() => collectLocalSearchUpdates(blackFen, info), /score unit/);
      const runner: LocalSearchRunner = async (fen, settings) =>
        runTrustedLocalSearch(fen, settings, undefined, engineFactory(info, []));
      await assert.rejects(getOrCreateLocalBaseline(blackFen, defaultConfig, runner), /score unit/);
      assert.equal(await prisma.localEngineBaseline.count(), 0);
    }
  });

  await t.test('repeated root updates collapse and deepest/final usable update wins', () => {
    const repeated = collectLocalSearchUpdates(blackFen, [
      { depth: 10, score: { unit: 'cp', value: 20 }, pv: 'e7e5' },
      { depth: 24, score: { unit: 'cp', value: 40 }, pv: 'e7e5' },
      { depth: 18, score: { unit: 'cp', value: 30 }, pv: 'e7e5' }
    ]);
    assert.equal(repeated.length, 1);
    assert.equal(repeated[0].cp, -40);
    assert.equal(repeated[0].depth, 24);

    const withoutDepth = collectLocalSearchUpdates(blackFen, [
      { score: { unit: 'cp', value: 10 }, pv: 'e7e5' },
      { score: { unit: 'cp', value: 25 }, pv: 'e7e5' }
    ]);
    assert.equal(withoutDepth[0].cp, -25);
  });

  await t.test('unrestricted baseline uses the final update at the greatest reported depth', async () => {
    const result = await runTrustedLocalSearch(
      blackFen,
      { depth: 24, multiPv: 1 },
      undefined,
      engineFactory([
        { depth: 10, score: { unit: 'cp', value: 900 }, pv: 'c7c6' },
        { depth: 24, score: { unit: 'cp', value: 30 }, pv: 'e7e5' }
      ], [])
    );
    assert.equal(result.uci, 'e7e5');
    assert.equal(result.cp, -30);

    const withoutDepth = await runTrustedLocalSearch(
      blackFen,
      { depth: 24, multiPv: 1 },
      undefined,
      engineFactory([
        { score: { unit: 'cp', value: 900 }, pv: 'c7c6' },
        { score: { unit: 'cp', value: 30 }, pv: 'e7e5' }
      ], [])
    );
    assert.equal(withoutDepth.uci, 'e7e5');
    assert.equal(withoutDepth.cp, -30);
  });

  await t.test('favourable shallow history cannot replace the deepest LocalEngineBaseline', async () => {
    await prisma.localEngineBaseline.deleteMany();
    const runner: LocalSearchRunner = async (fen, settings) => runTrustedLocalSearch(
      fen,
      settings,
      undefined,
      engineFactory([
        { depth: 8, score: { unit: 'cp', value: 1200 }, pv: 'c7c6' },
        { depth: 16, score: { unit: 'cp', value: 400 }, pv: 'c7c6' },
        { depth: 24, score: { unit: 'cp', value: 25 }, pv: 'e7e5' }
      ], [])
    );

    const result = await getOrCreateLocalBaseline(blackFen, defaultConfig, runner);
    const stored = await prisma.localEngineBaseline.findUnique({
      where: { fullFen_evaluationProfile: { fullFen: blackFen, evaluationProfile: profile } }
    });
    assert.equal(result.evaluation.uci, 'e7e5');
    assert.equal(result.evaluation.cp, -25);
    assert.equal(stored?.bestUci, 'e7e5');
    assert.equal(stored?.cp, -25);
    await prisma.localEngineBaseline.delete({ where: { id: stored!.id } });
  });

  await t.test('mixed depth metadata falls back to the final sequential LocalEngineBaseline update', async () => {
    await prisma.localEngineBaseline.deleteMany();
    const runner: LocalSearchRunner = async (fen, settings) => runTrustedLocalSearch(
      fen,
      settings,
      undefined,
      engineFactory([
        { depth: 24, score: { unit: 'cp', value: 30 }, pv: 'e7e5' },
        { depth: 10, score: { unit: 'cp', value: 900 }, pv: 'c7c6' },
        { score: { unit: 'cp', value: 25 }, pv: 'e7e5' }
      ], [])
    );

    const result = await getOrCreateLocalBaseline(blackFen, defaultConfig, runner);
    const stored = await prisma.localEngineBaseline.findUnique({
      where: { fullFen_evaluationProfile: { fullFen: blackFen, evaluationProfile: profile } }
    });
    assert.equal(result.evaluation.uci, 'e7e5');
    assert.equal(result.evaluation.cp, -25);
    assert.equal(stored?.bestUci, 'e7e5');
    assert.equal(stored?.cp, -25);
    await prisma.localEngineBaseline.delete({ where: { id: stored!.id } });
  });

  await t.test('constrained search uses identical settings and enforces expected root', async () => {
    const calls: Array<{ kind: string; value?: unknown }> = [];
    const result = await runTrustedLocalSearch(
      blackFen,
      { depth: 24, multiPv: 1 },
      'c7c6',
      engineFactory([{ depth: 24, score: { unit: 'cp', value: -15 }, pv: 'c7c6' }], calls)
    );
    assert.equal(result.uci, 'c7c6');
    assert.deepEqual(calls.find(call => call.kind === 'go')?.value, { depth: 24, searchmoves: 'c7c6' });
    await assert.rejects(
      runTrustedLocalSearch(blackFen, { depth: 24, multiPv: 1 }, 'c7c6', engineFactory([{ score: { unit: 'cp', value: 0 }, pv: 'e7e5' }], [])),
      /requested c7c6 but returned e7e5/
    );
    await assert.rejects(
      runTrustedLocalSearch(blackFen, { depth: 24, multiPv: 1 }, 'c7c6', engineFactory([], [])),
      /no usable result|zero usable/
    );
    await assert.rejects(
      runTrustedLocalSearch(blackFen, { depth: 24, multiPv: 1 }, 'c7c4', engineFactory([], [])),
      /Illegal or unsearchable/
    );
  });

  await t.test('process failure hard-errors and still quits', async () => {
    const calls: Array<{ kind: string; value?: unknown }> = [];
    await assert.rejects(
      runTrustedLocalSearch(blackFen, { depth: 24, multiPv: 1 }, undefined, engineFactory([], calls, new Error('go failed'))),
      /go failed/
    );
    assert.equal(calls.at(-1)?.kind, 'quit');
  });

  await t.test('baseline and candidate caches reuse exact FullFen/UCI/profile only', async () => {
    let calls = 0;
    const runner: LocalSearchRunner = async (_fen, settings, expected) => {
      calls += 1;
      assert.ok(settings.depth === 24 || settings.depth === 25);
      assert.equal(settings.multiPv, 1);
      return expected ? cpEval(expected, expected === 'c7c6' ? 'c6' : 'e5', -10) : cpEval('e7e5', 'e5', -20);
    };
    const first = await getOrCreateLocalBaseline(blackFen, defaultConfig, runner);
    const second = await getOrCreateLocalBaseline(blackFen, defaultConfig, runner);
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(calls, 1);

    await getOrCreateLocalBaseline(blackFenCounters, defaultConfig, runner);
    await getOrCreateLocalBaseline(blackFen, configWithDepth(25), runner);
    assert.equal(calls, 3);

    const candidate1 = await getOrCreateLocalCandidate(blackFen, 'c7c6', defaultConfig, runner);
    const candidate2 = await getOrCreateLocalCandidate(blackFen, 'c7c6', defaultConfig, runner);
    await getOrCreateLocalCandidate(blackFen, 'e7e5', defaultConfig, runner);
    await getOrCreateLocalCandidate(blackFen, 'c7c6', configWithDepth(25), runner);
    assert.equal(candidate1.reused, false);
    assert.equal(candidate2.reused, true);
    assert.equal(calls, 6);
  });

  await t.test('baseline-best candidate skips constrained search', async () => {
    await prisma.localEngineCandidate.deleteMany();
    await prisma.localEngineBaseline.deleteMany();
    const requested: Array<string | undefined> = [];
    const runner: LocalSearchRunner = async (_fen, _settings, expected) => {
      requested.push(expected);
      return cpEval('e7e5', 'e5', -30);
    };
    const result = await verifyLocalCandidate(blackFen, 'e7e5', 0, defaultConfig, runner);
    assert.equal(result.decision, 'ACCEPT');
    assert.equal(result.candidateWasBaselineBest, true);
    assert.deepEqual(requested, [undefined]);
    assert.equal(await prisma.localEngineCandidate.count(), 0);
  });

  await t.test('different target runs comparable constrained search and strict cp maths', async () => {
    await prisma.localEngineCandidate.deleteMany();
    await prisma.localEngineBaseline.deleteMany();
    const calls: Array<{ expected: string | undefined; depth: number; multiPv: number }> = [];
    const runner: LocalSearchRunner = async (_fen, settings, expected) => {
      calls.push({ expected, ...settings });
      return expected ? cpEval(expected, 'c6', 65) : cpEval('e7e5', 'e5', -30);
    };
    const accepted = await verifyLocalCandidate(blackFen, 'c7c6', 95, defaultConfig, runner);
    assert.equal(accepted.decision, 'ACCEPT');
    assert.deepEqual(calls, [
      { expected: undefined, depth: 24, multiPv: 1 },
      { expected: 'c7c6', depth: 24, multiPv: 1 }
    ]);
    assert.equal(verifyLocalOrdinaryCp(-30, 65, 95), 'ACCEPT');
    assert.equal(verifyLocalOrdinaryCp(-30, 66, 95), 'REJECT');
    assert.throws(() => verifyLocalOrdinaryCp(-20, -30, 95), /better than baseline/);
  });

  await t.test('mate never enters ordinary local cp verification', async () => {
    await prisma.localEngineCandidate.deleteMany();
    await prisma.localEngineBaseline.deleteMany();
    const runner: LocalSearchRunner = async (_fen, _settings, expected) =>
      expected ? cpEval(expected, 'c6', 0) : mateEval('e7e5', 'e5', -3);
    await assert.rejects(verifyLocalCandidate(blackFen, 'c7c6', 95, defaultConfig, runner), /mate comparison/);
  });

  await t.test('invalid replacement preserves trusted evidence and malformed evidence is not persisted', async () => {
    await prisma.localEngineBaseline.deleteMany();
    await prisma.localEngineCandidate.deleteMany();
    await saveLocalEngineBaseline(blackFen, profile, cpEval('e7e5', 'e5', -20));
    const before = await readLocalEngineBaseline(blackFen, profile);
    await assert.rejects(saveLocalEngineBaseline(blackFen, profile, { uci: 'e7e5', cp: Number.NaN, mate: null }));
    await assert.rejects(saveLocalEngineBaseline(blackFen, profile, { uci: 'e7e5', cp: 0, mate: 2 }));
    assert.deepEqual(await readLocalEngineBaseline(blackFen, profile), before);
    await saveLocalEngineCandidate(blackFen, 'c7c6', profile, cpEval('c7c6', 'c6', 12));
    const candidateBefore = await prisma.localEngineCandidate.findUnique({
      where: { fullFen_candidateUci_evaluationProfile: { fullFen: blackFen, candidateUci: 'c7c6', evaluationProfile: profile } }
    });
    await assert.rejects(saveLocalEngineCandidate(blackFen, 'c7c6', profile, { uci: 'e7e5', cp: 0, mate: null }));
    const candidateAfter = await prisma.localEngineCandidate.findUnique({
      where: { fullFen_candidateUci_evaluationProfile: { fullFen: blackFen, candidateUci: 'c7c6', evaluationProfile: profile } }
    });
    assert.deepEqual(candidateAfter, candidateBefore);
  });

  await prisma.$disconnect();
});
