import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import * as path from 'path';

import { defaultConfig, computeLocalEngineEvaluationProfile, type Config } from './config';
import {
  ConsoleDetachedEngine,
  assertStockfishVersion,
  collectLocalSearchUpdates,
  parseInfoLine,
  getOrCreateLocalBaseline,
  getOrCreateLocalCandidate,
  runTrustedLocalSearch,
  type LocalEngineFactory,
  type LocalSearchRunner,
  type TrustedLocalEvaluation
} from './local-engine';
import { readLocalEngineBaseline, readLocalEngineCandidate, saveLocalEngineBaseline, saveLocalEngineCandidate } from '../db/operations';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const blackFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const blackFenCounters = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 7 9';
const profile = computeLocalEngineEvaluationProfile(defaultConfig);
const cpEval = (uci: string, san: string, cp: number): TrustedLocalEvaluation => ({ uci, san, cp, mate: null });
const mateEval = (uci: string, san: string, mate: number): TrustedLocalEvaluation => ({ uci, san, cp: null, mate });

function configWithDepth(depth: number): Config {
  const config = JSON.parse(JSON.stringify(defaultConfig)) as Config;
  config.localStockfishDepth = depth;
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
  await prisma.engineCache.deleteMany({ where: { engine: "LOCAL" } });

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
    await prisma.engineCache.deleteMany({ where: { engine: "LOCAL" } });
    const invalidStreams = [
      [{ depth: 24, score: { value: 20 }, pv: 'e7e5' }],
      [{ depth: 24, score: { unit: 'wdl', value: 20 }, pv: 'e7e5' }]
    ];

    for (const info of invalidStreams) {
      assert.throws(() => collectLocalSearchUpdates(blackFen, info), /score unit/);
      const runner: LocalSearchRunner = async (fen, settings) =>
        runTrustedLocalSearch(fen, settings, undefined, engineFactory(info, []));
      await assert.rejects(getOrCreateLocalBaseline(blackFen, defaultConfig, runner), /score unit/);
      assert.equal(await prisma.engineCacheEvaluation.count({ where: { rank: 1, cache: { engine: "LOCAL" } } }), 0);
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

  await t.test('DB.32 favourable shallow history cannot replace the deepest local baseline', async () => {
    await prisma.engineCache.deleteMany({ where: { engine: "LOCAL" } });
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
    const stored = await readLocalEngineBaseline(blackFen, profile);
    assert.equal(result.evaluation.uci, 'e7e5');
    assert.equal(result.evaluation.cp, -25);
    assert.equal(stored?.bestUci, 'e7e5');
    assert.equal(stored?.cp, -25);
    await prisma.engineCache.deleteMany({ where: { engine: "LOCAL" } });
  });

  await t.test('mixed depth metadata falls back to the final sequential LocalEngineBaseline update', async () => {
    await prisma.engineCache.deleteMany({ where: { engine: "LOCAL" } });
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
    const stored = await readLocalEngineBaseline(blackFen, profile);
    assert.equal(result.evaluation.uci, 'e7e5');
    assert.equal(result.evaluation.cp, -25);
    assert.equal(stored?.bestUci, 'e7e5');
    assert.equal(stored?.cp, -25);
    await prisma.engineCache.deleteMany({ where: { engine: "LOCAL" } });
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
    assert.deepEqual(calls.find(call => call.kind === 'go')?.value, { depth: 24, searchmoves: ['c7c6'] });
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
    // DB.32: one EngineCache row per fullFen + profile, so the baseline's own move is already there.
    const baselineMove = await getOrCreateLocalCandidate(blackFen, 'e7e5', defaultConfig, runner);
    await getOrCreateLocalCandidate(blackFen, 'c7c6', configWithDepth(25), runner);
    assert.equal(candidate1.reused, false);
    assert.equal(candidate2.reused, true);
    assert.equal(baselineMove.reused, true);
    assert.equal(calls, 5);
  });

  await t.test('invalid replacement preserves trusted evidence and malformed evidence is not persisted', async () => {
    await prisma.engineCache.deleteMany({ where: { engine: "LOCAL" } });
    await saveLocalEngineBaseline(blackFen, profile, cpEval('e7e5', 'e5', -20));
    const before = await readLocalEngineBaseline(blackFen, profile);
    await assert.rejects(saveLocalEngineBaseline(blackFen, profile, { uci: 'e7e5', cp: Number.NaN, mate: null }));
    await assert.rejects(saveLocalEngineBaseline(blackFen, profile, { uci: 'e7e5', cp: 0, mate: 2 }));
    assert.deepEqual(await readLocalEngineBaseline(blackFen, profile), before);
    await saveLocalEngineCandidate(blackFen, 'c7c6', profile, cpEval('c7c6', 'c6', 12));
    const candidateBefore = await readLocalEngineCandidate(blackFen, 'c7c6', profile);
    await assert.rejects(saveLocalEngineCandidate(blackFen, 'c7c6', profile, { uci: 'e7e5', cp: 0, mate: null }));
    const candidateAfter = await readLocalEngineCandidate(blackFen, 'c7c6', profile);
    assert.deepEqual(candidateAfter, candidateBefore);
  });

  await prisma.$disconnect();
});

test('EW.09: only the configured Stockfish version is accepted', () => {
  const handshake = (name: string) => ['Stockfish by the Stockfish developers', `id name ${name}`, 'id author the Stockfish developers', 'uciok'];
  assert.doesNotThrow(() => assertStockfishVersion(handshake('Stockfish 19')));
  assert.doesNotThrow(() => assertStockfishVersion(handshake('Stockfish 19 (dev build)')));
  assert.throws(() => assertStockfishVersion(handshake('Stockfish 18')), /requires Stockfish 19 at bin\/stockfish\.exe; found Stockfish 18/);
  assert.throws(() => assertStockfishVersion(handshake('Stockfish 190')), /found Stockfish 190/);
  assert.throws(() => assertStockfishVersion(['uciok']), /found \(no name\)/);
});

test('EW.13: a searchmoves info line is read in the shape node-uci gives', () => {
  assert.deepEqual(
    parseInfoLine('info depth 12 seldepth 18 multipv 1 score cp -41 nodes 90000 nps 900000 time 100 pv c7c6 d2d4 d7d5'),
    { depth: 12, score: { unit: 'cp', value: -41 }, pv: 'c7c6 d2d4 d7d5' }
  );
  assert.deepEqual(parseInfoLine('info depth 30 score mate -3 pv h4e1'), { depth: 30, score: { unit: 'mate', value: -3 }, pv: 'h4e1' });
  assert.equal(parseInfoLine('info depth 12 score cp -41 lowerbound pv c7c6'), null, 'a bound is not an exact score');
  assert.equal(parseInfoLine('info string NNUE evaluation using nn.nnue'), null);
  assert.equal(parseInfoLine('bestmove c7c6 ponder d2d4'), null);
});

// Needs bin/stockfish.exe to be Stockfish 19.
test('S0.04 EW.13: Stockfish started off the console still searches, with and without searchmoves, and quits', async () => {
  const engine = new ConsoleDetachedEngine(path.resolve(process.cwd(), 'bin', 'stockfish.exe'));
  await engine.init();
  await engine.position(blackFen);
  const result = await engine.go({ depth: 1 });
  assert.ok(Array.isArray(result.info) && result.info.length > 0);
  // searchmoves must come last in the go command, or the depth is lost and the search never ends.
  const restricted = await engine.go({ depth: 6, searchmoves: ['c7c6'] });
  const updates = collectLocalSearchUpdates(blackFen, restricted.info, 'c7c6');
  assert.deepEqual(updates.map(update => update.uci), ['c7c6']);
  const proc = engine.proc!;
  await engine.quit();
  assert.notEqual(proc.exitCode, null);
});
