import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';

import { evaluateBlackMove, findHardcodedResponse } from './evaluator';
import { computeExplorerCacheProfile, computeLocalEngineEvaluationProfile, defaultConfig } from './config';
import { parseFullFen, positionKeyFromFen } from './fen';
import type { LocalSearchRunner, TrustedLocalEvaluation } from './local-engine';
import { readLocalEngineBaseline, saveExplorerCache } from '../db/operations';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const ordinaryFen = 'rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3';
const e4Fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const sf = (uci: string, san: string, cp: number | null, mate: number | null = null): TrustedLocalEvaluation => ({ uci, san, cp, mate });
const after = (fen: string, ...sans: string[]) => { const chess = new Chess(fen); for (const san of sans) chess.move(san); return parseFullFen(chess.fen()); };

/** A fake Stockfish: `positions[fullFen]` for each search. Records every position searched. */
function stockfish(positions: Record<string, TrustedLocalEvaluation>) {
  const searches: string[] = [];
  const runner: LocalSearchRunner = async (fen, settings) => {
    searches.push(fen);
    assert.deepEqual(settings, {
      nodes: defaultConfig.localStockfishNodes, threads: defaultConfig.localStockfishThreads,
      hashMb: defaultConfig.localStockfishHashMb, multiPv: 1
    });
    const evaluation = positions[fen];
    if (!evaluation) throw new Error(`no fake evaluation for ${fen}`);
    return evaluation;
  };
  return { runner, searches };
}

/** EW makes no outside request: any fetch is a failure. */
async function withNoFetch<T>(run: () => Promise<T>): Promise<T> {
  const original = global.fetch;
  global.fetch = (async (url: string) => { throw new Error(`EW must not fetch ${url}`); }) as typeof fetch;
  try { return await run(); } finally { global.fetch = original; }
}

test('EW engine response', async (t) => {
  t.beforeEach(async () => { await prisma.engineCache.deleteMany({ where: { engine: 'LOCAL' } }); });

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

  await t.test('EW.09 EW.11 Black plays Stockfish\'s top move, whatever the human games say; its eval is the position it reaches', async () => {
    // Human games favour Nbd7; they play no part.
    await saveExplorerCache(positionKeyFromFen(parseFullFen(ordinaryFen)), computeExplorerCacheProfile(defaultConfig), {
      positionTotalGames: 300, eco: null, openingName: null,
      moves: [{ uci: 'b8d7', san: 'Nbd7', games: 300, whiteWins: 50, draws: 50, blackWins: 200 }]
    });
    const afterE6 = after(ordinaryFen, 'e6');
    const engine = stockfish({ [parseFullFen(ordinaryFen)]: sf('e7e6', 'e6', -20), [afterE6]: sf('c2c4', 'c4', -17) });
    const result = await withNoFetch(() => evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), [], { localSearchRunner: engine.runner }));
    assert.deepEqual(result, {
      selectedUci: 'e7e6', selectedMoveSan: 'e6', cp: -17, mate: null,
      source: 'Local Stockfish 19', selectionMethod: 'Baseline', moveOrigin: 'Engine Move', engineRank: 1,
      baselineCp: -20, baselineMate: null
    });
    assert.deepEqual(engine.searches, [parseFullFen(ordinaryFen), afterE6], 'two searches: before and after Black\'s move');
  });

  await t.test('EW.09 DB.32 each position is cached under the local Stockfish profile and reused', async () => {
    const afterE6 = after(ordinaryFen, 'e6');
    const first = stockfish({ [parseFullFen(ordinaryFen)]: sf('e7e6', 'e6', -20), [afterE6]: sf('c2c4', 'c4', -17) });
    await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), [], { localSearchRunner: first.runner });
    const profile = computeLocalEngineEvaluationProfile(defaultConfig);
    assert.equal((await readLocalEngineBaseline(parseFullFen(ordinaryFen), profile))?.bestUci, 'e7e6');
    assert.equal((await readLocalEngineBaseline(afterE6, profile))?.cp, -17);

    const second = stockfish({});
    const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), [], { localSearchRunner: second.runner });
    assert.equal(result.selectedUci, 'e7e6');
    assert.equal(result.cp, -17);
    assert.deepEqual(second.searches, [], 'a cache hit is used as-is');
  });

  await t.test('EW.11 a mate is recorded as mate, not cp', async () => {
    const afterE6 = after(ordinaryFen, 'e6');
    const engine = stockfish({ [parseFullFen(ordinaryFen)]: sf('e7e6', 'e6', null, -4), [afterE6]: sf('c2c4', 'c4', null, -3) });
    const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), [], { localSearchRunner: engine.runner });
    assert.equal(result.cp, null);
    assert.equal(result.mate, -3);
    assert.equal(result.baselineMate, -4);
  });

  await t.test('EW.11 DB.11 checkmate and stalemate by Black are not searched: mate -1 and cp 0', async () => {
    // Fool's mate: 1.f3 e5 2.g4, and Black plays Qh4#.
    const fools = after(new Chess().fen(), 'f3', 'e5', 'g4');
    const engine = stockfish({ [fools]: sf('d8h4', 'Qh4#', null, -1) });
    const mated = await evaluateBlackMove(fools, new Chess(fools), ['f3', 'e5', 'g4'], { localSearchRunner: engine.runner });
    assert.deepEqual([mated.selectedMoveSan, mated.cp, mated.mate], ['Qh4#', null, -1]);
    assert.deepEqual(engine.searches, [fools], 'no search after checkmate');

    // White has a lone king on a1; Qb3 leaves it no move.
    const stale = parseFullFen('7k/8/8/8/8/2q5/8/K7 b - - 0 1');
    const staleEngine = stockfish({ [stale]: sf('c3b3', 'Qb3', 0) });
    const drawn = await evaluateBlackMove(stale, new Chess(stale), [], { localSearchRunner: staleEngine.runner });
    assert.deepEqual([drawn.selectedMoveSan, drawn.cp, drawn.mate], ['Qb3', 0, null]);
    assert.deepEqual(staleEngine.searches, [stale], 'no search after stalemate');
  });

  await t.test('EW.13 EW.11 HM.09 a hardcoded move is never rejected; it gets the eval of the position it reaches, White\'s move the baseline\'s', async () => {
    const afterC6 = after(e4Fen, 'c6');
    const engine = stockfish({ [parseFullFen(e4Fen)]: sf('e7e5', 'e5', 10), [afterC6]: sf('d2d4', 'd4', 400) });
    const result = await withNoFetch(() => evaluateBlackMove(e4Fen, new Chess(e4Fen), ['e4'], { localSearchRunner: engine.runner }));
    assert.deepEqual(result, {
      selectedUci: 'c7c6', selectedMoveSan: 'c6', cp: 400, mate: null,
      source: 'Local Stockfish 19', selectionMethod: 'Hardcoded', moveOrigin: 'Hardcoded Move', engineRank: null,
      baselineCp: 10, baselineMate: null
    });
    assert.deepEqual(engine.searches, [parseFullFen(e4Fen), afterC6], 'Stockfish searches the position before and after the hardcoded move');
  });

  await t.test('EW.13 DB.14 a hardcoded move that is also the baseline gets engineRank 1', async () => {
    const afterC6 = after(e4Fen, 'c6');
    const engine = stockfish({ [parseFullFen(e4Fen)]: sf('c7c6', 'c6', 30), [afterC6]: sf('d2d4', 'd4', 28) });
    const result = await evaluateBlackMove(e4Fen, new Chess(e4Fen), ['e4'], { localSearchRunner: engine.runner });
    assert.equal(result.selectionMethod, 'Hardcoded');
    assert.equal(result.engineRank, 1);
    assert.equal(result.cp, 28);
    assert.equal(result.baselineCp, 30);
  });

  await t.test('EW.13 an illegal hardcoded move is a hard error', async () => {
    // The route says 1.d4, so the line asks for d5, but this board has no Black d-pawn.
    const blocked = 'rnbqkbnr/ppp1pppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 2';
    const engine = stockfish({ [parseFullFen(blocked)]: sf('e7e6', 'e6', -20) });
    await assert.rejects(
      evaluateBlackMove(blocked, new Chess(blocked), ['d4'], { localSearchRunner: engine.runner }),
      /Hardcoded response d5 is illegal/
    );
  });

  await t.test('EW.12 a Stockfish failure stops the run', async () => {
    const runner: LocalSearchRunner = async () => { throw new Error('Stockfish crashed'); };
    await assert.rejects(evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), [], { localSearchRunner: runner }), /Stockfish crashed/);
  });

  await prisma.$disconnect();
});
