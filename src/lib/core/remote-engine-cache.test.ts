import test from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { computeRemoteEngineEvaluationProfile, defaultConfig } from './config';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const fen1 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const fen2 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 5 10';
const lichessProfile = computeRemoteEngineEvaluationProfile('LICHESS', defaultConfig);
const chessDbProfile = computeRemoteEngineEvaluationProfile('CHESSDB', defaultConfig);
const cpMove = (uci: string, cp: number, san: string | null = null) => ({ uci, san, cp, mate: null });
const mateMove = (uci: string, mate: number, san: string | null = null) => ({ uci, san, cp: null, mate });

test('Slice 7 coherent remote engine cache', async (t) => {
  const { saveRemoteEngineResult, readRemoteEngineResult, readRemoteEngineCandidate, createHumanDataSnapshot } = await import('../db/operations');
  await prisma.remoteEngineEvalCache.deleteMany();
  await prisma.remoteEngineFetch.deleteMany();

  await t.test('exact identity creates one marker and atomically replaces all children', async () => {
    await saveRemoteEngineResult(fen1, 'LICHESS', lichessProfile, [cpMove('e2e4', 20), cpMove('d2d4', 20), mateMove('g1f3', 4)]);
    const initial = await readRemoteEngineResult(fen1, 'LICHESS', lichessProfile);
    assert.strictEqual(initial.status, 'success');
    if (initial.status === 'success') assert.strictEqual(initial.evaluations.length, 3);
    await saveRemoteEngineResult(fen1, 'LICHESS', lichessProfile, [cpMove('e2e4', 20)]);
    assert.strictEqual(await prisma.remoteEngineFetch.count({ where: { fullFen: fen1, source: 'LICHESS', evaluationProfile: lichessProfile } }), 1);
    const result = await readRemoteEngineResult(fen1, 'LICHESS', lichessProfile);
    assert.strictEqual(result.status, 'success');
    if (result.status === 'success') assert.deepStrictEqual(result.evaluations.map(row => row.uci), ['e2e4']);
  });

  await t.test('FullFen, source, and profile are independent identity dimensions', async () => {
    assert.strictEqual((await readRemoteEngineResult(fen2, 'LICHESS', lichessProfile)).status, 'missing');
    assert.strictEqual((await readRemoteEngineResult(fen1, 'CHESSDB', chessDbProfile)).status, 'missing');
    assert.strictEqual((await readRemoteEngineResult(fen1, 'LICHESS', `${lichessProfile}-other`)).status, 'missing');
    await saveRemoteEngineResult(fen2, 'LICHESS', lichessProfile, [cpMove('e2e4', 30)]);
    await saveRemoteEngineResult(fen1, 'CHESSDB', chessDbProfile, [cpMove('d2d4', 10)]);
    await saveRemoteEngineResult(fen1, 'LICHESS', `${lichessProfile}-other`, [cpMove('c2c4', 15)]);
    assert.strictEqual((await readRemoteEngineResult(fen2, 'LICHESS', lichessProfile)).status, 'success');
    assert.strictEqual((await readRemoteEngineResult(fen1, 'CHESSDB', chessDbProfile)).status, 'success');
    assert.strictEqual((await readRemoteEngineResult(fen1, 'LICHESS', `${lichessProfile}-other`)).status, 'success');
  });

  await t.test('read distinguishes missing, successful empty, and success', async () => {
    const profile = `${lichessProfile}-empty`;
    assert.strictEqual((await readRemoteEngineResult(fen1, 'LICHESS', profile)).status, 'missing');
    await saveRemoteEngineResult(fen1, 'LICHESS', profile, []);
    assert.strictEqual((await readRemoteEngineResult(fen1, 'LICHESS', profile)).status, 'empty');
    assert.strictEqual(await prisma.remoteEngineEvalCache.count({ where: { fetch: { fullFen: fen1, source: 'LICHESS', evaluationProfile: profile } } }), 0);
    assert.strictEqual((await readRemoteEngineResult(fen1, 'LICHESS', lichessProfile)).status, 'success');
  });

  await t.test('refresh removes stale moves and successful empty removes every old child', async () => {
    const profile = `${lichessProfile}-refresh`;
    await saveRemoteEngineResult(fen1, 'LICHESS', profile, [cpMove('e2e4', 1), cpMove('d2d4', 2), cpMove('c2c4', 3), cpMove('g1f3', 4)]);
    await saveRemoteEngineResult(fen1, 'LICHESS', profile, [cpMove('e2e4', 1), cpMove('d2d4', 2), cpMove('c2c4', 3)]);
    const refreshed = await readRemoteEngineResult(fen1, 'LICHESS', profile);
    if (refreshed.status !== 'success') assert.fail('expected refreshed result');
    assert.deepStrictEqual(refreshed.evaluations.map(row => row.uci), ['c2c4', 'd2d4', 'e2e4']);
    await saveRemoteEngineResult(fen1, 'LICHESS', profile, []);
    assert.strictEqual((await readRemoteEngineResult(fen1, 'LICHESS', profile)).status, 'empty');
  });

  await t.test('refreshing one source/profile leaves another unchanged', async () => {
    const before = await readRemoteEngineResult(fen1, 'CHESSDB', chessDbProfile);
    await saveRemoteEngineResult(fen1, 'LICHESS', lichessProfile, [cpMove('e2e4', 99)]);
    assert.deepStrictEqual(await readRemoteEngineResult(fen1, 'CHESSDB', chessDbProfile), before);
  });

  await t.test('all malformed replacements preserve the trusted marker and rows', async () => {
    const before = await readRemoteEngineResult(fen1, 'LICHESS', lichessProfile);
    const invalidResults: any[][] = [
      [cpMove('e2e4', 1), cpMove('e2e4', 2)],
      [{ uci: 'e2e4', san: null, cp: Number.NaN, mate: null }],
      [{ uci: 'e2e4', san: null, cp: Number.POSITIVE_INFINITY, mate: null }],
      [{ uci: 'e2e4', san: null, cp: null, mate: 1.5 }],
      [{ uci: 'e2e4', san: null, cp: null, mate: null }],
      [{ uci: 'e2e4', san: null, cp: 10, mate: 2 }],
      [{ uci: 'e2e5', san: null, cp: 10, mate: null }]
    ];
    for (const invalid of invalidResults) await assert.rejects(saveRemoteEngineResult(fen1, 'LICHESS', lichessProfile, invalid));
    await assert.rejects(saveRemoteEngineResult('not a fen', 'LICHESS', lichessProfile, []));
    await assert.rejects(saveRemoteEngineResult(`${fen1} `, 'LICHESS', lichessProfile, []));
    await assert.rejects(saveRemoteEngineResult(fen1, 'INVALID' as any, lichessProfile, []));
    await assert.rejects(saveRemoteEngineResult(fen1, 'LICHESS', ' ', []));
    assert.deepStrictEqual(await readRemoteEngineResult(fen1, 'LICHESS', lichessProfile), before);
  });

  await t.test('UCI is authoritative and candidate absence is not fetch absence', async () => {
    const profile = `${lichessProfile}-uci`;
    await saveRemoteEngineResult(fen1, 'LICHESS', profile, [cpMove('e2e4', 12)]);
    const result = await readRemoteEngineResult(fen1, 'LICHESS', profile);
    if (result.status !== 'success') assert.fail('expected result');
    assert.strictEqual(result.evaluations[0].san, 'e4');
    assert.strictEqual((await readRemoteEngineCandidate(fen1, 'LICHESS', profile, 'e2e4')).status, 'success');
    assert.strictEqual((await readRemoteEngineCandidate(fen1, 'LICHESS', profile, 'd2d4')).status, 'unavailable');
  });

  await t.test('normal reads are deterministic, independent of provider ordering', async () => {
    const profile = `${chessDbProfile}-ordering`;
    await saveRemoteEngineResult(fen1, 'CHESSDB', profile, [cpMove('e2e4', 10), cpMove('c2c4', 5), cpMove('d2d4', 10)]);
    const first = await readRemoteEngineResult(fen1, 'CHESSDB', profile);
    await saveRemoteEngineResult(fen1, 'CHESSDB', profile, [cpMove('d2d4', 10), cpMove('e2e4', 10), cpMove('c2c4', 5)]);
    const second = await readRemoteEngineResult(fen1, 'CHESSDB', profile);
    if (first.status !== 'success' || second.status !== 'success') assert.fail('expected results');
    assert.deepStrictEqual(first.evaluations.map(row => ({ uci: row.uci, cp: row.cp })), second.evaluations.map(row => ({ uci: row.uci, cp: row.cp })));
  });

  await t.test('repertoire and human snapshot deletion preserve remote evidence', async () => {
    const user = await prisma.user.create({ data: { username: `slice7-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Slice 7 lifetime', color: 'black', userId: user.id } });
    const snapshot = await createHumanDataSnapshot(repertoire.id, 'slice7-lifetime');
    const before = await readRemoteEngineResult(fen1, 'LICHESS', lichessProfile);
    await prisma.humanDataSnapshot.delete({ where: { id: snapshot.id } });
    assert.deepStrictEqual(await readRemoteEngineResult(fen1, 'LICHESS', lichessProfile), before);
    await prisma.repertoire.delete({ where: { id: repertoire.id } });
    assert.deepStrictEqual(await readRemoteEngineResult(fen1, 'LICHESS', lichessProfile), before);
  });

  await prisma.$disconnect();
});
