import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';

import { evaluateBlackMove, findHardcodedResponse } from './evaluator';
import { computeExplorerCacheProfile, computeRemoteEngineEvaluationProfile, defaultConfig } from './config';
import { parseFullFen, positionKeyFromFen } from './fen';
import type { LocalSearchRunner, TrustedLocalEvaluation } from './local-engine';
import { readRemoteEngineResult, saveExplorerCache, saveRemoteEngineResult, type RemoteEngineEvaluation } from '../db/operations';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const ordinaryFen = 'rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3';
const e4Fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

type MastersMove = { uci: string; san: string; games: number; whiteWins: number; draws: number; blackWins: number };
const cp = (uci: string, value: number): RemoteEngineEvaluation => ({ uci, cp: value, mate: null });
const mate = (uci: string, value: number): RemoteEngineEvaluation => ({ uci, cp: null, mate: value });
const strong = (uci: string, san: string): MastersMove => ({ uci, san, games: 300, whiteWins: 50, draws: 50, blackWins: 200 });

/** Stockfish answers from a table: `baseline` for the open search, `moves` for searchmoves. */
function stockfish(baseline: TrustedLocalEvaluation, moves: Record<string, TrustedLocalEvaluation> = {}) {
  const requested: Array<string | undefined> = [];
  const runner: LocalSearchRunner = async (_fen, _settings, expected) => {
    requested.push(expected);
    if (expected === undefined) return baseline;
    if (expected === baseline.uci) return baseline;
    const answer = moves[expected];
    if (!answer) throw new Error(`unexpected searchmoves ${expected}`);
    return answer;
  };
  return { runner, requested };
}
const sf = (uci: string, san: string, cpValue: number | null, mateValue: number | null = null): TrustedLocalEvaluation =>
  ({ uci, san, cp: cpValue, mate: mateValue });

async function setup(fen: string, input: { masters?: MastersMove[]; lichess?: RemoteEngineEvaluation[]; chessDb?: RemoteEngineEvaluation[]; explorer?: boolean }) {
  await prisma.engineCache.deleteMany({ where: { fullFen: fen } });
  const positionKey = positionKeyFromFen(parseFullFen(fen));
  await prisma.positionCache.deleteMany({ where: { positionKey } });
  if (input.explorer !== false) {
    const masters = input.masters ?? [];
    const bucket = (moves: MastersMove[]) => ({ positionTotalGames: moves.reduce((sum, move) => sum + move.games, 0), eco: null, openingName: null, moves });
    await saveExplorerCache(positionKey, computeExplorerCacheProfile('MASTERS', defaultConfig), bucket(masters));
    await saveExplorerCache(positionKey, computeExplorerCacheProfile('ELITE', defaultConfig), bucket([]));
    await saveExplorerCache(positionKey, computeExplorerCacheProfile('AMATEUR', defaultConfig), bucket([]));
  }
  await saveRemoteEngineResult(fen, 'LICHESS', computeRemoteEngineEvaluationProfile('LICHESS', defaultConfig), input.lichess ?? []);
  await saveRemoteEngineResult(fen, 'CHESSDB', computeRemoteEngineEvaluationProfile('CHESSDB', defaultConfig), input.chessDb ?? []);
}

async function failureWithWarnings(run: () => Promise<unknown>): Promise<{ warnings: string[]; error: unknown }> {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };
  try {
    return { warnings, error: await run().then(() => null, error => error) };
  } finally {
    console.warn = original;
  }
}

test('EW engine waterfall', async (t) => {
  const originalFetch = global.fetch;
  // Everything comes from the caches; a request would mean a cache was skipped.
  global.fetch = async (url: any) => { throw new Error(`unexpected request ${url}`); };

  await t.test('EW.13 the route, not the position, matches a hardcoded line', () => {
    assert.equal(findHardcodedResponse(['e4'], defaultConfig.hardcodedBlackResponses), 'c6');
    assert.equal(findHardcodedResponse(['d4'], defaultConfig.hardcodedBlackResponses), 'd5');
    assert.equal(findHardcodedResponse(['Nf3'], defaultConfig.hardcodedBlackResponses), null);
    assert.equal(findHardcodedResponse([], defaultConfig.hardcodedBlackResponses), null, 'White to move has no Black reply');
    const lines = ['1. d4 Nf6 2. Nf3 d5'];
    assert.equal(findHardcodedResponse(['d4', 'Nf6', 'Nf3'], lines), 'd5');
    assert.equal(findHardcodedResponse(['Nf3', 'Nf6', 'd4'], lines), null, 'a transposition does not get the hardcoded move');
    assert.equal(findHardcodedResponse(['d4', 'Nf6', 'Nf3', 'd5', 'c4'], lines), null);
  });

  await t.test('EW.13 hardcoded move: no Explorer, eval for the record only, Stockfish check sets deepVerified', async () => {
    await setup(e4Fen, { explorer: false, lichess: [cp('e7e5', 0), cp('c7c6', 500)] });
    const engine = stockfish(sf('e7e5', 'e5', 10), { c7c6: sf('c7c6', 'c6', 400) });
    const result = await evaluateBlackMove(e4Fen, new Chess(e4Fen), 1, ['e4'], { localSearchRunner: engine.runner });
    assert.equal(result.selectedMoveSan, 'c6');
    assert.equal(result.cp, 500);
    assert.equal(result.source, 'Lichess Cloud Evaluation');
    assert.equal(result.engineRank, 2);
    assert.equal(result.selectionMethod, 'Hardcoded');
    assert.equal(result.moveOrigin, 'Hardcoded Move');
    assert.equal(result.deepVerified, true);
    assert.ok(result.localEvaluationProfile);
    assert.equal(result.openingMetadata, 'NOT_FETCHED');
    assert.equal(result.totalMastersGames, null);
    assert.deepEqual(engine.requested, [undefined, 'c7c6']);
  });

  await t.test('EW.05 moves tied on score and weighted games are ordered by local Stockfish', async () => {
    const same = { games: 300, whiteWins: 50, draws: 50, blackWins: 200 };
    await setup(ordinaryFen, { masters: [{ uci: 'b8d7', san: 'Nbd7', ...same }, { uci: 'b8c6', san: 'Nc6', ...same }] });
    const engine = stockfish(sf('e7e5', 'e5', -40), { b8d7: sf('b8d7', 'Nbd7', 20), b8c6: sf('b8c6', 'Nc6', -30) });
    const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], { localSearchRunner: engine.runner });
    assert.deepEqual(result.candidateMoves.map(candidate => candidate.uci), ['b8c6', 'b8d7']);
    assert.equal(result.selectedMoveSan, 'Nc6');
  });

  await t.test('EW.03 no candidate has enough games: the top Lichess move, deep-verified', async () => {
    await setup(ordinaryFen, { masters: [{ uci: 'b8d7', san: 'Nbd7', games: 1, whiteWins: 0, draws: 0, blackWins: 1 }], lichess: [cp('e7e6', 10), cp('g7g6', 30)] });
    const engine = stockfish(sf('e7e6', 'e6', 15));
    const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], { localSearchRunner: engine.runner });
    assert.equal(result.selectedMoveSan, 'e6');
    assert.equal(result.source, 'Lichess Cloud Evaluation');
    assert.equal(result.cp, 10);
    assert.equal(result.engineRank, 1);
    assert.equal(result.selectionMethod, 'No Qualifying Candidates');
    assert.equal(result.moveOrigin, 'Engine Move');
    assert.equal(result.deepVerified, true);
  });

  await t.test('EW.08 a ChessDB score at chessDbMaxAbsCp skips ChessDB for the position', async () => {
    await setup(ordinaryFen, { masters: [strong('b8d7', 'Nbd7')], chessDb: [cp('e7e5', -defaultConfig.chessDbMaxAbsCp), cp('b8d7', 20)] });
    const engine = stockfish(sf('e7e5', 'e5', -30), { b8d7: sf('b8d7', 'Nbd7', 0) });
    const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], { localSearchRunner: engine.runner });
    assert.equal(result.selectedMoveSan, 'Nbd7');
    assert.equal(result.source, 'Local Deep Stockfish');
    assert.equal(result.engineRank, null);
    const cached = await readRemoteEngineResult(ordinaryFen, 'CHESSDB', computeRemoteEngineEvaluationProfile('CHESSDB', defaultConfig));
    assert.equal(cached.status, 'success', 'the answer stays cached as received');
  });

  await t.test('EW.10 engineRank is the place in the list of the engine that accepted the move', async () => {
    await setup(ordinaryFen, { masters: [strong('b8d7', 'Nbd7')], lichess: [cp('e7e5', 0), cp('b8d7', 30)] });
    const engine = stockfish(sf('e7e5', 'e5', 0), { b8d7: sf('b8d7', 'Nbd7', 40) });
    const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], { localSearchRunner: engine.runner });
    assert.equal(result.selectedMoveSan, 'Nbd7');
    assert.equal(result.engineRank, 2);
    assert.equal(result.selectionMethod, 'Ordinary API');
    assert.equal(result.moveOrigin, 'Human Move');
  });

  await t.test('EW.10 no candidate passes: the top engine move, Engine Fallback', async () => {
    await setup(ordinaryFen, { masters: [strong('b8d7', 'Nbd7')], lichess: [cp('e7e5', 0), cp('b8d7', 200)] });
    const engine = stockfish(sf('e7e5', 'e5', 5));
    const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], { localSearchRunner: engine.runner });
    assert.equal(result.selectedMoveSan, 'e5');
    assert.equal(result.source, 'Lichess Cloud Evaluation');
    assert.equal(result.engineRank, 1);
    assert.equal(result.selectionMethod, 'Engine Fallback');
    assert.equal(result.moveOrigin, 'Engine Move');
    assert.equal(result.selectedStats, null);
    assert.equal(result.deepVerified, true);
  });

  await t.test('EW.10 local Stockfish: a candidate that misses the mate is rejected, and the fallback takes the mate', async () => {
    await setup(ordinaryFen, { masters: [strong('b8d7', 'Nbd7')] });
    const engine = stockfish(sf('e7e5', 'e5', null, -3), { b8d7: sf('b8d7', 'Nbd7', -400) });
    const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], { localSearchRunner: engine.runner });
    assert.equal(result.selectedMoveSan, 'e5');
    assert.equal(result.mate, -3);
    assert.equal(result.selectionMethod, 'Engine Fallback');
    assert.equal(result.moveOrigin, 'Engine Move');
  });

  await t.test('EW.11a Stockfish agrees: the move keeps the API eval and source', async () => {
    await setup(ordinaryFen, { masters: [strong('b8d7', 'Nbd7')], lichess: [cp('e7e5', 0), cp('b8d7', 30)] });
    const engine = stockfish(sf('e7e5', 'e5', -50), { b8d7: sf('b8d7', 'Nbd7', 40) });
    const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], { localSearchRunner: engine.runner });
    assert.equal(result.cp, 30);
    assert.equal(result.source, 'Lichess Cloud Evaluation');
    assert.equal(result.deepVerified, true);
    assert.deepEqual(engine.requested, [undefined, 'b8d7']);
  });

  const vetoCases: Array<{ name: string; lichess: RemoteEngineEvaluation[]; baseline: TrustedLocalEvaluation; chosen?: TrustedLocalEvaluation }> = [
    { name: 'EW.11b cp loss outside localToleranceCp', lichess: [cp('e7e5', 0), cp('b8d7', 30)], baseline: sf('e7e5', 'e5', -100), chosen: sf('b8d7', 'Nbd7', 50) },
    { name: 'EW.11c the API returned a cp, Stockfish found a mate', lichess: [cp('e7e5', 0), cp('b8d7', 30)], baseline: sf('e7e5', 'e5', null, -5), chosen: sf('b8d7', 'Nbd7', 50) },
    { name: 'EW.11d both found a mate, Stockfish\'s is shorter', lichess: [mate('b8d7', -5)], baseline: sf('e7e5', 'e5', null, -4), chosen: sf('b8d7', 'Nbd7', null, -5) },
    { name: 'EW.11 the API returned a mate, Stockfish a cp', lichess: [mate('b8d7', -5)], baseline: sf('e7e5', 'e5', -300), chosen: sf('b8d7', 'Nbd7', -250) },
    { name: 'EW.11 the API returned a mate, Stockfish\'s is longer', lichess: [mate('b8d7', -5)], baseline: sf('e7e5', 'e5', null, -6), chosen: sf('b8d7', 'Nbd7', null, -6) }
  ];
  for (const vetoCase of vetoCases) {
    await t.test(`${vetoCase.name}: logs the veto and stops with a hard error`, async () => {
      await setup(ordinaryFen, { masters: [strong('b8d7', 'Nbd7')], lichess: vetoCase.lichess });
      const engine = stockfish(vetoCase.baseline, vetoCase.chosen ? { b8d7: vetoCase.chosen } : {});
      const { warnings, error } = await failureWithWarnings(() =>
        evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], { localSearchRunner: engine.runner }));
      assert.match(String(error), /Stockfish vetoed the API engine chosen move/);
      assert.equal(warnings[0], '[WARNING] Stockfish vetoed the API engine chosen move.');
      for (const field of ['chosenResponse=Nbd7', 'selectionMethod=Ordinary API', 'moveOrigin=Human Move', 'engineRank=', 'Lichess Cloud Evaluation eval=', 'Stockfish baseline=e7e5']) {
        assert.ok(warnings[1].includes(field), `${field} missing from: ${warnings[1]}`);
      }
    });
  }

  await t.test('EW.11 the same mate as Stockfish\'s baseline is accepted', async () => {
    await setup(ordinaryFen, { masters: [strong('b8d7', 'Nbd7')], lichess: [mate('b8d7', -5)] });
    const engine = stockfish(sf('e7e5', 'e5', null, -5), { b8d7: sf('b8d7', 'Nbd7', null, -5) });
    const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), 3, [], { localSearchRunner: engine.runner });
    assert.equal(result.selectedMoveSan, 'Nbd7');
    assert.equal(result.mate, -5);
    assert.equal(result.deepVerified, true);
  });

  global.fetch = originalFetch;
  await prisma.engineCache.deleteMany({ where: { fullFen: { in: [ordinaryFen, e4Fen] } } });
  await prisma.$disconnect();
});
