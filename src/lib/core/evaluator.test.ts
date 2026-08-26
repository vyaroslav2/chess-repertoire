import test from 'node:test';
import assert from 'node:assert';
import { Chess } from 'chess.js';
import { evaluateBlackMove } from './evaluator';
import { PrismaClient } from '@prisma/client';
import { createHumanDataSnapshot, getOrCreatePosition, getOrCreatePositionCache } from '../db/operations';
import { GlobalState } from '../api/retry';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

test('Slice 10 Evaluator Tests', async (t) => {
  await t.test('Fallback move failure stops generation and does not fall through', async () => {
    const originalFetch = global.fetch;
    const oldCloudEvals = GlobalState.lichessCloudEvals;
    GlobalState.lichessCloudEvals = true;

    // Database setup to avoid FK errors during fetch caching
    const user = await prisma.user.create({ data: { username: `evaltest-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    
    // Random position to avoid dev db cache hits
    const fen = "rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3";
    
    // Clear any existing cache for this FEN
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        // 1. Mock Human Explorer (Empty list so it falls back to Lichess fallback, but returns pvs)
        if (urlStr.includes('explorer.lichess.ovh/masters') || urlStr.includes('explorer.lichess.ovh/lichess')) {
          return new Response(JSON.stringify({ moves: [] }));
        }
        
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          return new Response(JSON.stringify({ 
            pvs: [
              { moves: 'e7e5', mate: -3 }
            ]
          }));
        }

        // 3. Mock ChessDB (Should NEVER be reached because generation should stop)
        if (urlStr.includes('chessdb.cn')) {
          return new Response(JSON.stringify({ status: "ok" }));
        }

        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      
      // Override chess.move to simulate a failure applying the fallback move
      (chess as any).move = (moveArg: any) => {
        return null;
      };
      
      // We expect evaluateBlackMove to throw when it tries to apply 'e7e5'
      await assert.rejects(
        async () => {
          await evaluateBlackMove(fen, chess, 2, ["e4", "e5"], snapshot.id);
        },
        (err: Error) => {
          return err.message.includes("illegal in this position");
        },
        "Must throw a descriptive hard generation error when Lichess mate fallback cannot be applied"
      );

    } finally {
      global.fetch = originalFetch;
      GlobalState.lichessCloudEvals = oldCloudEvals;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.$disconnect();
    }
  });
});
