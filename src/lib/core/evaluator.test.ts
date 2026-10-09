import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { PrismaClient } from '@prisma/client';

import { evaluateBlackMove, findHardcodedResponse } from './evaluator';
import { computeExplorerCacheProfile, computeLocalEngineEvaluationProfile, defaultConfig } from './config';
import { parseFullFen, positionKeyFromFen } from './fen';
import type { LocalSearchRunner, TrustedLocalEvaluation } from './local-engine';
import { readLocalEngineBaseline, readLocalEngineCandidate, saveExplorerCache } from '../db/operations';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const ordinaryFen = 'rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3';
const e4Fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const sf = (uci: string, san: string, cp: number | null, mate: number | null = null): TrustedLocalEvaluation => ({ uci, san, cp, mate });

/** A fake Stockfish: `best` for an open search, `moves[uci]` for a searchmoves search. Records every search. */
function stockfish(best: TrustedLocalEvaluation, moves: Record<string, TrustedLocalEvaluation> = {}) {
  const searches: Array<string | undefined> = [];
  const runner: LocalSearchRunner = async (_fen, settings, expected) => {
    searches.push(expected);
    assert.equal(settings.depth, defaultConfig.localStockfishDepth);
    assert.equal(settings.multiPv, 1);
    if (expected === undefined) return best;
    const evaluation = moves[expected];
    if (!evaluation) throw new Error(`no fake evaluation for ${expected}`);
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

  await t.test('EW.09 Black plays Stockfish\'s top move, whatever the human games say', async () => {
    // Human games favour Nbd7; they play no part.
    await saveExplorerCache(positionKeyFromFen(parseFullFen(ordinaryFen)), computeExplorerCacheProfile(defaultConfig), {
      positionTotalGames: 300, eco: null, openingName: null,
      moves: [{ uci: 'b8d7', san: 'Nbd7', games: 300, whiteWins: 50, draws: 50, blackWins: 200 }]
    });
    const engine = stockfish(sf('e7e6', 'e6', -20));
    const result = await withNoFetch(() => evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), [], { localSearchRunner: engine.runner }));
    assert.deepEqual(result, {
      selectedUci: 'e7e6', selectedMoveSan: 'e6', cp: -20, mate: null,
      source: 'Local Stockfish 19', selectionMethod: 'Baseline', moveOrigin: 'Engine Move', engineRank: 1
    });
    assert.deepEqual(engine.searches, [undefined], 'one open search, no searchmoves');
  });

  await t.test('EW.09 DB.32 the baseline is cached under the local Stockfish profile and reused', async () => {
    const first = stockfish(sf('e7e6', 'e6', -20));
    await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), [], { localSearchRunner: first.runner });
    const profile = computeLocalEngineEvaluationProfile(defaultConfig);
    assert.equal((await readLocalEngineBaseline(parseFullFen(ordinaryFen), profile))?.bestUci, 'e7e6');

    const second = stockfish(sf('a7a6', 'a6', 0));
    const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), [], { localSearchRunner: second.runner });
    assert.equal(result.selectedUci, 'e7e6');
    assert.deepEqual(second.searches, [], 'a cache hit is used as-is');
  });

  await t.test('EW.09 a mate is recorded as mate, not cp', async () => {
    const engine = stockfish(sf('e7e6', 'e6', null, -3));
    const result = await evaluateBlackMove(ordinaryFen, new Chess(ordinaryFen), [], { localSearchRunner: engine.runner });
    assert.equal(result.cp, null);
    assert.equal(result.mate, -3);
  });

  await t.test('EW.13 a hardcoded move keeps Stockfish\'s eval of it and is never rejected', async () => {
    const engine = stockfish(sf('e7e5', 'e5', 10), { c7c6: sf('c7c6', 'c6', 400) });
    const result = await withNoFetch(() => evaluateBlackMove(e4Fen, new Chess(e4Fen), ['e4'], { localSearchRunner: engine.runner }));
    assert.deepEqual(result, {
      selectedUci: 'c7c6', selectedMoveSan: 'c6', cp: 400, mate: null,
      source: 'Local Stockfish 19', selectionMethod: 'Hardcoded', moveOrigin: 'Hardcoded Move', engineRank: null
    });
    assert.deepEqual(engine.searches, [undefined, 'c7c6'], 'Stockfish evaluates the baseline and the hardcoded move');
    const profile = computeLocalEngineEvaluationProfile(defaultConfig);
    assert.equal((await readLocalEngineBaseline(parseFullFen(e4Fen), profile))?.bestUci, 'e7e5');
    assert.equal((await readLocalEngineCandidate(parseFullFen(e4Fen), 'c7c6', profile))?.cp, 400);
  });

  await t.test('EW.13 DB.14 a hardcoded move that is also the baseline gets engineRank 1 and one search', async () => {
    const engine = stockfish(sf('c7c6', 'c6', 30));
    const result = await evaluateBlackMove(e4Fen, new Chess(e4Fen), ['e4'], { localSearchRunner: engine.runner });
    assert.equal(result.selectionMethod, 'Hardcoded');
    assert.equal(result.engineRank, 1);
    assert.equal(result.cp, 30);
    assert.deepEqual(engine.searches, [undefined]);
  });

  await t.test('EW.13 an illegal hardcoded move is a hard error', async () => {
    const engine = stockfish(sf('e7e6', 'e6', -20));
    // The route says 1.d4, so the line asks for d5, but this board has no Black d-pawn.
    const blocked = 'rnbqkbnr/ppp1pppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 2';
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
