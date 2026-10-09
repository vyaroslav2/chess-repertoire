import { test } from 'node:test';
import * as assert from 'node:assert';
import { Chess } from 'chess.js';
import { evaluateBlackMove } from './evaluator';
import * as verifier from './verifier';
import { PrismaClient } from '@prisma/client';
import { parseFullFen, positionKeyFromFen } from './fen';
import { defaultConfig } from './config';
import type { LocalSearchRunner } from './local-engine';

// EW.11: every API choice is checked by local Stockfish; this one agrees with the API.
const agreeingStockfish = (uci: string, san: string, cp: number | null, mate: number | null = null): LocalSearchRunner =>
  async () => ({ uci, san, cp, mate });

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

test('Slice 11 Evaluator Waterfall Tests', async (t) => {
  await t.test('1. Lichess ACCEPT (mate) -> selects move, no ChessDB fetch, source is Lichess', async () => {
    const originalFetch = global.fetch;

    const user = await prisma.user.create({ data: { username: `evaltest11-1-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const fen = "rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3";
    
    await prisma.engineCache.deleteMany({ where: { fullFen: fen } });
    await prisma.positionCache.deleteMany({ where: { positionKey: positionKeyFromFen(parseFullFen(fen)) } });

    let chessDbFetched = false;

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        // Masters has the move e5
        if (urlStr.includes('explorer.lichess.ovh/masters')) {
          return new Response(JSON.stringify({ white: 100, draws: 100, black: 100, moves: [{ san: 'Nbd7', uci: 'b8d7', white: 100, draws: 100, black: 100 }] }));
        }
        if (urlStr.includes('explorer.lichess.ovh/lichess')) {
          return new Response(JSON.stringify({ white: 0, draws: 0, black: 0, moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          return new Response(JSON.stringify({ pvs: [{ moves: 'b8d7', mate: -3 }] }));
        }
        if (urlStr.includes('chessdb.cn')) {
          chessDbFetched = true;
          return new Response("move:b8d7,score:-300");
        }
        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      const res = await evaluateBlackMove(fen, chess, 3, ["d4", "Nf6", "Nf3", "d5"], { localSearchRunner: agreeingStockfish("b8d7", "Nbd7", null, -3) });
      
      assert.strictEqual(res.selectedMoveSan, "Nbd7");
      assert.strictEqual(res.evalSource, "Lichess Cloud Evaluation");
      assert.strictEqual(res.selectedMate, -3);
      assert.strictEqual(res.selectedEngineCp, null);
      assert.strictEqual(res.selectedUci, "b8d7");
      assert.strictEqual(res.selectionMethod, "Ordinary API");
      assert.strictEqual(res.moveOrigin, "Human Move");
      assert.strictEqual(res.cp, null);
      assert.strictEqual(res.mate, -3);
      assert.strictEqual(chessDbFetched, false, "Should not fetch ChessDB if Lichess accepts");

    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  await t.test('2. Lichess INCONCLUSIVE -> checks ChessDB', async () => {
    const originalFetch = global.fetch;

    const user = await prisma.user.create({ data: { username: `evaltest11-2-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const fen = "rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3";
    
    await prisma.engineCache.deleteMany({ where: { fullFen: fen } });
    await prisma.positionCache.deleteMany({ where: { positionKey: positionKeyFromFen(parseFullFen(fen)) } });

    let chessDbFetched = false;

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh/masters')) {
          return new Response(JSON.stringify({ white: 100, draws: 100, black: 100, moves: [{ san: 'Nbd7', uci: 'b8d7', white: 100, draws: 100, black: 100 }] }));
        }
        if (urlStr.includes('explorer.lichess.ovh/lichess')) {
          return new Response(JSON.stringify({ white: 0, draws: 0, black: 0, moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          // Lichess gives empty response (inconclusive)
          return new Response(JSON.stringify({ pvs: [] }));
        }
        if (urlStr.includes('chessdb.cn')) {
          chessDbFetched = true;
          return new Response("move:b8d7,score:-100");
        }
        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      const res = await evaluateBlackMove(fen, chess, 3, ["d4", "Nf6", "Nf3", "d5"], { localSearchRunner: agreeingStockfish("b8d7", "Nbd7", 100) });
      
      assert.strictEqual(res.selectedMoveSan, "Nbd7");
      assert.strictEqual(res.evalSource, "ChessDB");
      assert.strictEqual(res.selectedMate, null);
      assert.strictEqual(res.selectedEngineCp, 100);
      assert.strictEqual(res.selectionMethod, "Ordinary API");
      assert.strictEqual(res.moveOrigin, "Human Move");
      assert.strictEqual(res.source, "ChessDB");
      assert.strictEqual(chessDbFetched, true, "Should fetch ChessDB when Lichess is inconclusive");

    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  await t.test('3. Malformed ChessDB throws hard error', async () => {
    const originalFetch = global.fetch;

    const user = await prisma.user.create({ data: { username: `evaltest11-3-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const fen = "rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3";
    
    await prisma.engineCache.deleteMany({ where: { fullFen: fen } });
    await prisma.positionCache.deleteMany({ where: { positionKey: positionKeyFromFen(parseFullFen(fen)) } });

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh/masters')) {
          return new Response(JSON.stringify({ white: 100, draws: 100, black: 100, moves: [{ san: 'Nbd7', uci: 'b8d7', white: 100, draws: 100, black: 100 }] }));
        }
        if (urlStr.includes('explorer.lichess.ovh/lichess')) {
          return new Response(JSON.stringify({ white: 0, draws: 0, black: 0, moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          return new Response(JSON.stringify({ pvs: [] }));
        }
        if (urlStr.includes('chessdb.cn')) {
          return new Response("move:b8d7,score:INVALID_NOT_A_NUMBER");
        }
        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      await assert.rejects(
        async () => {
          await evaluateBlackMove(fen, chess, 3, ["d4", "Nf6", "Nf3", "d5"]);
        },
        (err: Error) => {
          return err.message.includes("Malformed successful ChessDB engine snapshot");
        },
        "Must throw a descriptive hard generation error when ChessDB is malformed"
      );

    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  await t.test('4. 1.e4 -> c6 hardcode gets exact eval from Lichess', async () => {
    const originalFetch = global.fetch;

    const user = await prisma.user.create({ data: { username: `evaltest11-4-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    
    await prisma.engineCache.deleteMany({ where: { fullFen: fen } });
    await prisma.positionCache.deleteMany({ where: { positionKey: positionKeyFromFen(parseFullFen(fen)) } });

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh')) {
          return new Response(JSON.stringify({ white: 0, draws: 0, black: 0, moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          return new Response(JSON.stringify({ pvs: [{ moves: 'c7c6', cp: 42 }] }));
        }
        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      const res = await evaluateBlackMove(fen, chess, 1, ["e4"], { localSearchRunner: agreeingStockfish("c7c6", "c6", 42) });
      
      assert.strictEqual(res.selectedMoveSan, "c6");
      assert.strictEqual(res.evalSource, "Lichess Cloud Evaluation");
      assert.strictEqual(res.selectedEngineCp, 42);
      assert.strictEqual(res.selectedUci, "c7c6");
      assert.strictEqual(res.selectionMethod, "Hardcoded");
      assert.strictEqual(res.moveOrigin, "Hardcoded Move");

    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  await t.test('5. Invalid remote engine result throws hard error (Lichess)', async () => {
    const originalFetch = global.fetch;
    const user = await prisma.user.create({ data: { username: `evaltest11-5-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const fen = "rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3";
    
    await prisma.engineCache.deleteMany({ where: { fullFen: fen } });
    await prisma.positionCache.deleteMany({ where: { positionKey: positionKeyFromFen(parseFullFen(fen)) } });

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh/masters')) {
          return new Response(JSON.stringify({ white: 100, draws: 100, black: 100, moves: [{ san: 'Nbd7', uci: 'b8d7', white: 100, draws: 100, black: 100 }] }));
        }
        if (urlStr.includes('explorer.lichess.ovh/lichess')) {
          return new Response(JSON.stringify({ white: 0, draws: 0, black: 0, moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          return new Response(JSON.stringify({ pvs: [{ moves: 'invalid_move_format', cp: 100 }] }));
        }
        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      await assert.rejects(
        async () => {
          await evaluateBlackMove(fen, chess, 3, ["d4", "Nf6", "Nf3", "d5"]);
        },
        (err: Error) => {
          return err.message.includes("Invalid remote engine result");
        },
        "Must throw a descriptive hard generation error when Lichess returns invalid data triggering db rejection"
      );

    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  await t.test('6. Hardcoded move c6 uses exact Lichess eval even if outside tolerance', async () => {
    const originalFetch = global.fetch;
    const user = await prisma.user.create({ data: { username: `evaltest11-6-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    
    await prisma.engineCache.deleteMany({ where: { fullFen: fen } });
    await prisma.positionCache.deleteMany({ where: { positionKey: positionKeyFromFen(parseFullFen(fen)) } });

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh')) {
          return new Response(JSON.stringify({ white: 0, draws: 0, black: 0, moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          // Lichess returns terrible evaluation for c6 (+500) while e5 is good (0)
          // This ensures c6 fails the CP tolerance check and gets explicitly REJECTED by Lichess.
          return new Response(JSON.stringify({ pvs: [{ moves: 'e7e5', cp: 0 }, { moves: 'c7c6', cp: 500 }] }));
        }
        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      const res = await evaluateBlackMove(fen, chess, 1, ["e4"], { localSearchRunner: agreeingStockfish("c7c6", "c6", 500) });
      assert.strictEqual(res.selectedMoveSan, "c6");
      assert.strictEqual(res.evalSource, "Lichess Cloud Evaluation");
      assert.strictEqual(res.selectedEngineCp, 500);
    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  
  await t.test('6b. Hardcoded move d5 uses exact Lichess eval even if outside tolerance', async () => {
    const originalFetch = global.fetch;
    const user = await prisma.user.create({ data: { username: `evaltest11-6b-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const fen = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";
    
    await prisma.engineCache.deleteMany({ where: { fullFen: fen } });
    await prisma.positionCache.deleteMany({ where: { positionKey: positionKeyFromFen(parseFullFen(fen)) } });

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh')) {
          return new Response(JSON.stringify({ white: 0, draws: 0, black: 0, moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          return new Response(JSON.stringify({ pvs: [{ moves: 'g8f6', cp: 0 }, { moves: 'd7d5', cp: 500 }] }));
        }
        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      const res = await evaluateBlackMove(fen, chess, 1, ["d4"], { localSearchRunner: agreeingStockfish("d7d5", "d5", 500) });
      assert.strictEqual(res.selectedMoveSan, "d5");
      assert.strictEqual(res.evalSource, "Lichess Cloud Evaluation");
      assert.strictEqual(res.selectedEngineCp, 500);
    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

});
