import { test } from 'node:test';
import * as assert from 'node:assert';
import { Chess } from 'chess.js';
import { evaluateBlackMove } from './evaluator';
import * as verifier from './verifier';
import { PrismaClient } from '@prisma/client';
import { createHumanDataSnapshot, getOrCreatePosition, getOrCreatePositionCache } from '../db/operations';
import { defaultConfig } from './config';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

test('Slice 11 Evaluator Waterfall Tests', async (t) => {
  await t.test('1. Lichess ACCEPT (mate) -> selects move, no ChessDB fetch, source is Lichess', async () => {
    const originalFetch = global.fetch;

    const user = await prisma.user.create({ data: { username: `evaltest11-1-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    const fen = "rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3";
    
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    let chessDbFetched = false;

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        // Masters has the move e5
        if (urlStr.includes('explorer.lichess.ovh/masters')) {
          return new Response(JSON.stringify({ moves: [{ san: 'Nbd7', uci: 'b8d7', white: 100, draws: 100, black: 100 }] }));
        }
        if (urlStr.includes('explorer.lichess.ovh/lichess')) {
          return new Response(JSON.stringify({ moves: [] }));
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
      const res = await evaluateBlackMove(fen, chess, 3, ["d4", "Nf6", "Nf3", "d5"], snapshot.id);
      
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
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    const fen = "rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3";
    
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    let chessDbFetched = false;

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh/masters')) {
          return new Response(JSON.stringify({ moves: [{ san: 'Nbd7', uci: 'b8d7', white: 100, draws: 100, black: 100 }] }));
        }
        if (urlStr.includes('explorer.lichess.ovh/lichess')) {
          return new Response(JSON.stringify({ moves: [] }));
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
      const res = await evaluateBlackMove(fen, chess, 3, ["d4", "Nf6", "Nf3", "d5"], snapshot.id);
      
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
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    const fen = "rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3";
    
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh/masters')) {
          return new Response(JSON.stringify({ moves: [{ san: 'Nbd7', uci: 'b8d7', white: 100, draws: 100, black: 100 }] }));
        }
        if (urlStr.includes('explorer.lichess.ovh/lichess')) {
          return new Response(JSON.stringify({ moves: [] }));
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
          await evaluateBlackMove(fen, chess, 3, ["d4", "Nf6", "Nf3", "d5"], snapshot.id);
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
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh')) {
          return new Response(JSON.stringify({ moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          return new Response(JSON.stringify({ pvs: [{ moves: 'c7c6', cp: 42 }] }));
        }
        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      const res = await evaluateBlackMove(fen, chess, 1, ["e4"], snapshot.id);
      
      assert.strictEqual(res.selectedMoveSan, "c6");
      assert.strictEqual(res.evalSource, "Lichess Cloud Evaluation");
      assert.strictEqual(res.selectedEngineCp, 42);
      assert.strictEqual(res.selectedUci, "c7c6");
      assert.strictEqual(res.selectionMethod, "Hardcoded Opening");
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
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    const fen = "rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3";
    
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh/masters')) {
          return new Response(JSON.stringify({ moves: [{ san: 'Nbd7', uci: 'b8d7', white: 100, draws: 100, black: 100 }] }));
        }
        if (urlStr.includes('explorer.lichess.ovh/lichess')) {
          return new Response(JSON.stringify({ moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          return new Response(JSON.stringify({ pvs: [{ moves: 'invalid_move_format', cp: 100 }] }));
        }
        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      await assert.rejects(
        async () => {
          await evaluateBlackMove(fen, chess, 3, ["d4", "Nf6", "Nf3", "d5"], snapshot.id);
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
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh')) {
          return new Response(JSON.stringify({ moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          // Lichess returns terrible evaluation for c6 (+500) while e5 is good (0)
          // This ensures c6 fails the CP tolerance check and gets explicitly REJECTED by Lichess.
          return new Response(JSON.stringify({ pvs: [{ moves: 'e7e5', cp: 0 }, { moves: 'c7c6', cp: 500 }] }));
        }
        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      const res = await evaluateBlackMove(fen, chess, 1, ["e4"], snapshot.id);
      assert.strictEqual(res.selectedMoveSan, "c6");
      assert.strictEqual(res.evalSource, "Lichess Cloud Evaluation");
      assert.strictEqual(res.selectedEngineCp, 500);
    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  
  await t.test('6c. Hardcoded move throws error if completely missing from all engines', async () => {
    const originalFetch = global.fetch;
    const user = await prisma.user.create({ data: { username: `evaltest11-6c-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh')) {
          return new Response(JSON.stringify({ moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          return new Response(JSON.stringify({ pvs: [{ moves: 'e7e5', cp: 0 }] })); // c6 is missing
        }
        if (urlStr.includes('chessdb.cn')) {
          return new Response("move:e7e5,score:0"); // c6 is missing
        }
        return new Response(JSON.stringify({}));
      };

      const nodeUci = require('node-uci');
      const OriginalEngine = nodeUci.Engine;
      nodeUci.Engine = class FakeEngine {
        async init() {}
        async setoption() {}
        async position() {}
        async go() { return { info: [] }; } // Exact searchmoves evaluation fails (returns empty info)
        async quit() {}
      };

      const chess = new Chess(fen);
      try {
        await assert.rejects(
          async () => {
            await evaluateBlackMove(fen, chess, 1, ["e4"], snapshot.id);
          },
          (err: Error) => err.message.includes("Local Engine returned no usable result for expected root c7c6"),
          "Must throw a descriptive hard generation error when a hardcoded move is completely missing"
        );
      } finally {
        nodeUci.Engine = OriginalEngine;
      }
    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  await t.test('6d. Hardcoded move absent from remote sources gets exact Local evaluation', async () => {
    const originalFetch = global.fetch;
    const user = await prisma.user.create({ data: { username: `evaltest11-6d-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh')) {
          return new Response(JSON.stringify({ moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          return new Response(JSON.stringify({ pvs: [{ moves: 'e7e5', cp: 0 }] })); // c6 is missing
        }
        if (urlStr.includes('chessdb.cn')) {
          return new Response("move:e7e5,score:0"); // c6 is missing
        }
        return new Response(JSON.stringify({}));
      };

      const nodeUci = require('node-uci');
      const OriginalEngine = nodeUci.Engine;
      nodeUci.Engine = class FakeEngine {
        async init() {}
        async setoption() {}
        async position() {}
        async go() { return { info: [{ depth: 1, multipv: 1, score: { unit: "cp", value: 777 }, pv: "c7c6" }] }; } // Exact searchmoves returns exactly c6
        async quit() {}
      };

      const chess = new Chess(fen);
      try {
        const res = await evaluateBlackMove(fen, chess, 1, ["e4"], snapshot.id);
        assert.strictEqual(res.selectedMoveSan, "c6");
        assert.strictEqual(res.evalSource, "Local Deep Stockfish");
        assert.strictEqual(res.selectedEngineCp, -777);
      } finally {
        nodeUci.Engine = OriginalEngine;
      }
    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });


  
  await t.test('6e. Hardcoded move Local searchmoves invariant violation', async () => {
    const originalFetch = global.fetch;
    const user = await prisma.user.create({ data: { username: `evaltest11-6e-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    await prisma.localEngineCandidate.deleteMany({ where: { fullFen: fen } });
    
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh')) return new Response(JSON.stringify({ moves: [] }));
        if (urlStr.includes('lichess.org/api/cloud-eval')) return new Response(JSON.stringify({ pvs: [{ moves: 'e7e5', cp: 0 }] }));
        if (urlStr.includes('chessdb.cn')) return new Response("move:e7e5,score:0");
        return new Response(JSON.stringify({}));
      };

      const nodeUci = require('node-uci');
      const OriginalEngine = nodeUci.Engine;
      nodeUci.Engine = class FakeEngine {
        async init() {}
        async setoption() {}
        async position() {}
        // Returns the wrong move despite searchmoves being provided!
        async go() { return { info: [{ cp: 0, depth: 1, multipv: 1, score: { value: 0 }, pv: "e7e5" }] }; }
        async quit() {}
      };

      const chess = new Chess(fen);
      try {
        await assert.rejects(
          async () => {
            await evaluateBlackMove(fen, chess, 1, ["e4"], snapshot.id);
          },
          (err: Error) => err.message.includes("Invariant violation: Local Stockfish searchmoves requested c7c6 but returned e7e5"),
          "Must throw an invariant error if Local Stockfish returns a different move than the forced searchmoves"
        );
      } finally {
        nodeUci.Engine = OriginalEngine;
      }
    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  await t.test('7. Empty shortlist falls back to Local Deep Stockfish', async () => {
    const originalFetch = global.fetch;
    const user = await prisma.user.create({ data: { username: `evaltest11-7-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    const fen = "rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3";
    
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        // Return 0 moves for human shortlist
        if (urlStr.includes('explorer.lichess.ovh/masters') || urlStr.includes('explorer.lichess.ovh/lichess')) {
          return new Response(JSON.stringify({ moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          return new Response(JSON.stringify({ pvs: [] }));
        }
        if (urlStr.includes('chessdb.cn')) {
          return new Response("");
        }
        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      
      // To prevent it actually taking 5 seconds running depth 24 Stockfish during tests,
      // we can temporarily override defaultConfig inside the test:
      const oldDepth = defaultConfig.engine.deepVerification.depth;
      defaultConfig.engine.deepVerification.depth = 1;
      
      try {
        await assert.rejects(
          async () => {
            await evaluateBlackMove(fen, chess, 3, ["d4", "Nf6", "Nf3", "d5"], snapshot.id);
          },
          (err: any) => {
            return err.code === 'ENOENT' && err.syscall.includes('spawn');
          },
          "Must branch to Local Deep Stockfish (which throws ENOENT on missing binary)"
        );
      } finally {
        defaultConfig.engine.deepVerification.depth = oldDepth;
      }
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
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    const fen = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";
    
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    try {
      global.fetch = async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('explorer.lichess.ovh')) {
          return new Response(JSON.stringify({ moves: [] }));
        }
        if (urlStr.includes('lichess.org/api/cloud-eval')) {
          return new Response(JSON.stringify({ pvs: [{ moves: 'g8f6', cp: 0 }, { moves: 'd7d5', cp: 500 }] }));
        }
        return new Response(JSON.stringify({}));
      };

      const chess = new Chess(fen);
      const res = await evaluateBlackMove(fen, chess, 1, ["d4"], snapshot.id);
      assert.strictEqual(res.selectedMoveSan, "d5");
      assert.strictEqual(res.evalSource, "Lichess Cloud Evaluation");
      assert.strictEqual(res.selectedEngineCp, 500);
    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  await t.test('8. Local Deep Stockfish returning zero PVs throws hard error', async () => {
    const originalFetch = global.fetch;
    const user = await prisma.user.create({ data: { username: `evaltest11-8-${Date.now()}` } });
    const repertoire = await prisma.repertoire.create({ data: { title: 'Eval Test', color: 'black', userId: user.id } });
    const snapshot = await createHumanDataSnapshot(repertoire.id, `snapshot-${Date.now()}`);
    const fen = "rn1qkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RN1QKB1R b KQkq - 0 3";
    
    await prisma.remoteEngineFetch.deleteMany({ where: { fullFen: fen } });
    await prisma.humanExplorerFetch.deleteMany({ where: { positionKey: fen.split(" ")[0] } });
    await getOrCreatePosition(fen);
    await getOrCreatePositionCache(fen, undefined, []);

    try {
      global.fetch = async (url: any) => {
        return new Response(JSON.stringify({ moves: [], pvs: [] }));
      };
      
      const nodeUci = require('node-uci');
      const OriginalEngine = nodeUci.Engine;
      nodeUci.Engine = class FakeEngine {
        async init() {}
        async setoption() {}
        async position() {}
        async go() { return { info: [] }; } // returns no PVs
        async quit() {}
      };

      const chess = new Chess(fen);
      try {
        await assert.rejects(
          async () => {
            await evaluateBlackMove(fen, chess, 3, ["d4", "Nf6", "Nf3", "d5"], snapshot.id);
          },
          (err: Error) => err.message.includes("Local Engine returned zero usable root evaluations"),
          "Must throw descriptive error when deep fallback returns no PVs"
        );
      } finally {
        nodeUci.Engine = OriginalEngine;
      }
    } finally {
      global.fetch = originalFetch;
      await prisma.repertoire.delete({ where: { id: repertoire.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
