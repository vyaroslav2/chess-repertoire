import test from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { parseFullFen, positionKeyFromFen } from './fen';

// Test DB path is expected to be managed externally via scripts/run_db_tests.ts
const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL
});

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

test('DB record shapes', async (t) => {
    // Dynamic import ensures the module's PrismaClient evaluates process.env.DATABASE_URL *after* we've set it to test.db.
    const ops = await import('../db/operations');
    const { createRepertoireNode, prisma: opsPrisma } = ops;

    await t.test('freshly pushed schema is usable', async () => {
        const count = await prisma.user.count();
        assert.ok(typeof count === 'number');
    });

    // Clean test database safely
    await prisma.repertoirePositionStat.deleteMany();
    await prisma.repertoireMove.deleteMany();
    await prisma.position.deleteMany();
    await prisma.repertoireNode.deleteMany();
    await prisma.positionCache.deleteMany();
    await prisma.engineCache.deleteMany();
    await prisma.openingMetadataHistoryCache.deleteMany();
    await prisma.wikibooksHistoryCache.deleteMany();
    await prisma.repertoire.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({ data: { username: "test_db_user" } });
    const newRepertoire = (title: string) => prisma.repertoire.create({ data: { title, color: "black", userId: user.id } });

    await t.test('DB.01 the tree is built from two record types, nodes and moves', () => {
        const nodeKeys = Object.keys(prisma.repertoireNode.fields);
        for (const field of ['positionKey', 'fullFen', 'history', 'displayPgn', 'routeProb', 'cumProb', 'rareDropped',
            'unaccountedDropped', 'transposesTo', 'eco', 'openingName', 'openingMetadataStatus', 'wikiText', 'wikibooksChecked', 'siblingIndex']) {
            assert.ok(nodeKeys.includes(field), `node is missing ${field}`);
        }
        for (const legacy of ['cumulativeProb', 'isTransposition', 'pgn', 'openingMetadataSource', 'humanDataSnapshotId']) {
            assert.ok(!nodeKeys.includes(legacy), `node still has ${legacy}`);
        }
        const moveKeys = Object.keys(prisma.repertoireMove.fields);
        for (const field of ['fromNodeId', 'toNodeId', 'san', 'uci', 'playerTurn', 'moveProb', 'stopReason',
            'mastersGames', 'eliteGames', 'weightedGames', 'totalMastersGames', 'mastersMoveShare', 'totalEliteGames', 'eliteMoveShare',
            'cp', 'mate', 'source', 'selectionMethod', 'moveOrigin', 'engineRank', 'deepVerified']) {
            assert.ok(moveKeys.includes(field), `move is missing ${field}`);
        }
        for (const legacy of ['prob', 'routeProbability', 'trueProbability', 'routeHistory', 'humanDataSnapshotId',
            'weightedCount', 'totalRelevantGames', 'moveShare', 'localEvaluationProfile']) {
            assert.ok(!moveKeys.includes(legacy), `move still has ${legacy}`);
        }
    });

    await t.test('DB.03 a node stores the exact fullFen and the positionKey derived from it', async () => {
        const rep = await newRepertoire("DB.03");
        const rawFen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
        const node = await createRepertoireNode(rep.id, rawFen, "e2e4 e7e5", 1.0, { displayPgn: "e4 e5" });
        assert.strictEqual(node.fullFen, parseFullFen(rawFen));
        assert.strictEqual(node.positionKey, positionKeyFromFen(parseFullFen(rawFen)));
        assert.strictEqual(node.history, "e2e4 e7e5");
        assert.strictEqual(node.displayPgn, "e4 e5");
    });

    await t.test('DB.04 a new node has routeProb equal to cumProb and nothing dropped', async () => {
        const rep = await newRepertoire("DB.04");
        const node = await createRepertoireNode(rep.id, AFTER_E4, "e2e4", 0.4, { displayPgn: "e4" });
        assert.strictEqual(node.routeProb, 0.4);
        assert.strictEqual(node.cumProb, 0.4);
        assert.strictEqual(node.rareDropped, 0);
        assert.strictEqual(node.unaccountedDropped, 0);
    });

    await t.test('DB.05 transposesTo points a pointer at its owner; the owner keeps null', async () => {
        const rep = await newRepertoire("DB.05");
        const owner = await createRepertoireNode(rep.id, AFTER_E4_E5, "e2e4 e7e5", 0.5);
        const pointer = await createRepertoireNode(rep.id, AFTER_E4_E5, "e2e3 e7e5 e3e4", 0.1);
        await prisma.repertoireNode.update({ where: { id: pointer.id }, data: { transposesTo: owner.id } });
        const [ownerAfter, pointerAfter] = await Promise.all([
            prisma.repertoireNode.findUniqueOrThrow({ where: { id: owner.id }, include: { pointers: true } }),
            prisma.repertoireNode.findUniqueOrThrow({ where: { id: pointer.id } })
        ]);
        assert.strictEqual(ownerAfter.transposesTo, null);
        assert.deepStrictEqual(ownerAfter.pointers.map(node => node.id), [pointer.id]);
        assert.strictEqual(pointerAfter.transposesTo, owner.id);
    });

    await t.test('DB.06 a node never holds a half-filled opening pair', async () => {
        const rep = await newRepertoire("DB.06");
        await assert.rejects(createRepertoireNode(rep.id, START, "", 1, { openingMetadataStatus: "PRESENT", eco: "B00", openingName: null }), /PRESENT/);
        await assert.rejects(createRepertoireNode(rep.id, START, "", 1, { openingMetadataStatus: "VALID_ABSENCE", eco: "B00", openingName: "King's Pawn" }), /VALID_ABSENCE/);
        await assert.rejects(createRepertoireNode(rep.id, START, "", 1, { eco: "B00", openingName: "King's Pawn" }), /status is missing/);
        const node = await createRepertoireNode(rep.id, START, "", 1, { openingMetadataStatus: "VALID_ABSENCE" });
        assert.strictEqual(node.openingMetadataStatus, "VALID_ABSENCE");
    });

    await t.test('DB.06 later opening metadata replaces metadata on the same route', async () => {
        const rep = await newRepertoire("DB.06 replace");
        const original = await createRepertoireNode(rep.id, AFTER_E4, "e2e4", 1, { displayPgn: "e4", openingMetadataStatus: "PRESENT", eco: "A00", openingName: "Old opening" });
        const updated = await createRepertoireNode(rep.id, AFTER_E4, "e2e4", 1, { displayPgn: "e4", openingMetadataStatus: "PRESENT", eco: "B00", openingName: "King's Pawn Opening" });
        assert.strictEqual(updated.id, original.id);
        assert.strictEqual(updated.eco, "B00");
        assert.strictEqual(updated.openingName, "King's Pawn Opening");
    });

    await t.test('DB.07 Wikibooks text lives on the node, with a looked-up flag', () => {
        const nodeKeys = Object.keys(prisma.repertoireNode.fields);
        assert.ok(nodeKeys.includes('wikibooksChecked'));
        assert.ok(nodeKeys.includes('wikiText'));
    });

    await t.test('DB.16 a node stores its siblingIndex', async () => {
        const rep = await newRepertoire("DB.16");
        const node = await createRepertoireNode(rep.id, AFTER_E4, "e2e4", 0.6, { siblingIndex: 2 });
        assert.strictEqual(node.siblingIndex, 2);
    });

    await t.test('DB.36 Position maps a positionKey to the first node that reaches it', async () => {
        const rep = await newRepertoire("DB.36");
        const first = await createRepertoireNode(rep.id, AFTER_E4_E5, "e2e4 e7e5", 0.5);
        // Same position, different clocks: a separate node, but the same positionKey.
        const second = await createRepertoireNode(rep.id, "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 2 4", "g1f3 g8f6 f3g1 f6g8 e2e4 e7e5", 0.1);
        assert.notStrictEqual(first.id, second.id);
        assert.strictEqual(first.positionKey, second.positionKey);
        const row = await prisma.position.findUniqueOrThrow({ where: { repertoireId_positionKey: { repertoireId: rep.id, positionKey: first.positionKey } } });
        assert.strictEqual(row.nodeId, first.id);
        assert.strictEqual(await ops.claimPosition(prisma, rep.id, first.positionKey, second.id), first.id);
    });

    await t.test('DB.36 each repertoire has its own Position table', async () => {
        const rep1 = await newRepertoire("DB.36 a");
        const rep2 = await newRepertoire("DB.36 b");
        const node1 = await createRepertoireNode(rep1.id, AFTER_E4, "e2e4", 1.0);
        const node2 = await createRepertoireNode(rep2.id, AFTER_E4, "e2e4", 1.0);
        const rows = await prisma.position.findMany({ where: { positionKey: node1.positionKey, repertoireId: { in: [rep1.id, rep2.id] } } });
        assert.deepStrictEqual(rows.map(row => row.nodeId).sort(), [node1.id, node2.id].sort());
    });

    await t.test('DB.02 DB.30 DB.36 wiping the tree removes nodes, moves and Position; caches survive', async () => {
        const rep = await newRepertoire("DB.02");
        const root = await createRepertoireNode(rep.id, START, "", 1.0);
        const child = await createRepertoireNode(rep.id, AFTER_E4, "e2e4", 1.0, { displayPgn: "e4" });
        await ops.createOpponentMove({ repertoireId: rep.id, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", moveProb: 1 });
        await ops.saveExplorerCache(root.positionKey, "db02-profile", { positionTotalGames: 0, eco: null, openingName: null, moves: [] });
        await ops.saveRemoteEngineResult(parseFullFen(AFTER_E4), "LICHESS", "db02-engine", []);
        await prisma.openingMetadataHistoryCache.create({ data: { repertoireId: rep.id, history: "e2e4", status: "VALID_ABSENCE" } });
        await prisma.wikibooksHistoryCache.create({ data: { repertoireId: rep.id, history: "e2e4", wikiText: null } });

        await prisma.repertoireNode.deleteMany({ where: { repertoireId: rep.id } });

        assert.strictEqual(await prisma.repertoireNode.count({ where: { repertoireId: rep.id } }), 0);
        assert.strictEqual(await prisma.repertoireMove.count({ where: { repertoireId: rep.id } }), 0);
        assert.strictEqual(await prisma.position.count({ where: { repertoireId: rep.id } }), 0);
        assert.ok(await prisma.positionCache.findUnique({ where: { positionKey_cacheProfile: { positionKey: root.positionKey, cacheProfile: "db02-profile" } } }));
        assert.ok(await prisma.engineCache.findUnique({ where: { fullFen_engine_engineProfile: { fullFen: parseFullFen(AFTER_E4), engine: "LICHESS", engineProfile: "db02-engine" } } }));
        assert.strictEqual(await prisma.openingMetadataHistoryCache.count({ where: { repertoireId: rep.id } }), 1);
        assert.strictEqual(await prisma.wikibooksHistoryCache.count({ where: { repertoireId: rep.id } }), 1);
    });

    await t.test('DB.31 Explorer data is keyed by positionKey + cache profile and keeps eco and openingName', async () => {
        const positionKey = positionKeyFromFen(parseFullFen(START));
        await ops.saveExplorerCache(positionKey, "masters-profile", {
            positionTotalGames: 10, eco: "A00", openingName: "Start",
            moves: [{ uci: "e2e4", san: "e4", games: 10, whiteWins: 4, draws: 3, blackWins: 3 }]
        });
        const masters = await ops.readExplorerCache(positionKey, "masters-profile");
        assert.strictEqual(masters.status, "success");
        if (masters.status !== "success") return;
        assert.strictEqual(masters.positionTotalGames, 10);
        assert.strictEqual(masters.eco, "A00");
        assert.strictEqual(masters.openingName, "Start");
        assert.deepStrictEqual(masters.moves.map(move => move.uci), ["e2e4"]);
        assert.deepStrictEqual(await ops.readExplorerCache(positionKey, "elite-profile"), { status: "missing" });
    });

    await t.test('DB.31 a position fetched with no games is stored as an empty result', async () => {
        const positionKey = positionKeyFromFen(parseFullFen(AFTER_E4));
        await ops.saveExplorerCache(positionKey, "empty-profile", { positionTotalGames: 0, eco: null, openingName: null, moves: [] });
        assert.deepStrictEqual(await ops.readExplorerCache(positionKey, "empty-profile"),
            { status: "empty", positionTotalGames: 0, eco: null, openingName: null });
    });

    await t.test('DB.31 an Explorer row never holds half an opening name', async () => {
        const positionKey = positionKeyFromFen(parseFullFen(AFTER_E4));
        await assert.rejects(ops.saveExplorerCache(positionKey, "half-profile", { positionTotalGames: 0, eco: "B00", openingName: null, moves: [] }), /both be set/);
    });

    await t.test('DB.32 engine evaluations are keyed by the exact fullFen, not positionKey', async () => {
        const fenA = parseFullFen(AFTER_E4);
        const fenB = parseFullFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 4 3");
        assert.strictEqual(positionKeyFromFen(fenA), positionKeyFromFen(fenB));
        await ops.saveRemoteEngineResult(fenA, "LICHESS", "db32-profile", [{ uci: "e7e5", cp: 20, mate: null }]);
        assert.strictEqual((await ops.readRemoteEngineResult(fenA, "LICHESS", "db32-profile")).status, "success");
        assert.strictEqual((await ops.readRemoteEngineResult(fenB, "LICHESS", "db32-profile")).status, "missing");
    });

    await t.test('DB.32 each engine keeps its own rows', async () => {
        const fen = parseFullFen(AFTER_E4);
        await ops.saveRemoteEngineResult(fen, "CHESSDB", "db32-chessdb", [{ uci: "c7c5", cp: 30, mate: null }]);
        await ops.saveLocalEngineBaseline(fen, "db32-local", { uci: "e7e5", cp: 25, mate: null });
        const rows = await prisma.engineCache.findMany({ where: { fullFen: fen, engineProfile: { in: ["db32-chessdb", "db32-local"] } } });
        assert.deepStrictEqual(rows.map(row => row.engine).sort(), ["CHESSDB", "LOCAL"]);
        assert.strictEqual((await ops.readLocalEngineBaseline(fen, "db32-local"))?.bestUci, "e7e5");
        assert.strictEqual((await ops.readRemoteEngineResult(fen, "LICHESS", "db32-local")).status, "missing");
    });

    await t.test('DB.33 opening metadata is stored per route: repertoire + history', async () => {
        const rep = await newRepertoire("DB.33");
        await prisma.openingMetadataHistoryCache.create({ data: { repertoireId: rep.id, history: "e2e4", status: "PRESENT", eco: "B00", openingName: "King's Pawn" } });
        await assert.rejects(prisma.openingMetadataHistoryCache.create({ data: { repertoireId: rep.id, history: "e2e4", status: "VALID_ABSENCE" } }));
        await prisma.openingMetadataHistoryCache.create({ data: { repertoireId: rep.id, history: "d2d4", status: "VALID_ABSENCE" } });
        assert.strictEqual(await prisma.openingMetadataHistoryCache.count({ where: { repertoireId: rep.id } }), 2);
    });

    const responseInput = (fromNodeId: string, toNodeId: string) => ({
        fromNodeId, toNodeId, uci: "e7e5", cp: 20 as number | null, mate: null as number | null,
        source: "Lichess Cloud Evaluation" as const, selectionMethod: "Ordinary API" as const, moveOrigin: "Human Move" as const,
        deepVerified: false, localEvaluationProfile: null
    });

    await t.test('DB.08 DB.09 a Black position carries exactly one RESPONSE', async () => {
        const rep = await newRepertoire("DB.09");
        const from = await createRepertoireNode(rep.id, AFTER_E4, "e2e4", 1.0);
        const to = await createRepertoireNode(rep.id, AFTER_E4_E5, "e2e4 e7e5", 1.0);
        await ops.createResponseMove(responseInput(from.id, to.id));
        await ops.createResponseMove({ ...responseInput(from.id, to.id), cp: 15 });
        const responses = await prisma.repertoireMove.findMany({ where: { fromNodeId: from.id, playerTurn: "RESPONSE" } });
        assert.strictEqual(responses.length, 1);
        assert.strictEqual(responses[0].cp, 15);
        assert.strictEqual(responses[0].san, "e5");
    });

    await t.test('DB.10 a White move stores its moveProb', async () => {
        const rep = await newRepertoire("DB.10");
        const root = await createRepertoireNode(rep.id, START, "", 1.0);
        const child = await createRepertoireNode(rep.id, AFTER_E4, "e2e4", 0.45);
        const move = await ops.createOpponentMove({ repertoireId: rep.id, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", moveProb: 0.45 });
        assert.strictEqual(move.playerTurn, "OPPONENT");
        assert.strictEqual(move.moveProb, 0.45);
    });

    await t.test('DB.12 mate = 0 is invalid', () => {
        assert.throws(() => ops.validateResponsePersistence({ ...responseInput("a", "b"), cp: null, mate: 0 }), /non-zero integer mate/);
        assert.doesNotThrow(() => ops.validateResponsePersistence({ ...responseInput("a", "b"), cp: null, mate: -3 }));
    });

    await t.test('DB.14 a Black move has exactly one of cp or mate', () => {
        assert.throws(() => ops.validateResponsePersistence({ ...responseInput("a", "b"), cp: 10, mate: 2 }), /exactly one/);
        assert.throws(() => ops.validateResponsePersistence({ ...responseInput("a", "b"), cp: null, mate: null }), /exactly one/);
    });

    await t.test('DB.13 the move shares are games over their totals', () => {
        const evidence = ops.responseHumanEvidence({ mastersGames: 30, eliteGames: 5, weightedGames: 155, totalMastersGames: 120, totalEliteGames: 0 });
        assert.strictEqual(evidence.mastersMoveShare, 0.25);
        assert.strictEqual(evidence.eliteMoveShare, null);
        assert.strictEqual(evidence.weightedGames, 155);
    });

    await t.test('DB.13 DB.14 a RESPONSE stores the human and engine evidence', async () => {
        const rep = await newRepertoire("DB.13");
        const from = await createRepertoireNode(rep.id, AFTER_E4, "e2e4", 1.0);
        const to = await createRepertoireNode(rep.id, AFTER_E4_E5, "e2e4 e7e5", 1.0);
        const evidence = ops.responseHumanEvidence({ mastersGames: 40, eliteGames: 60, weightedGames: 260, totalMastersGames: 100, totalEliteGames: 200 });
        const move = await ops.createResponseMove({ ...responseInput(from.id, to.id), ...evidence, engineRank: 1 });
        assert.strictEqual(move.mastersGames, 40);
        assert.strictEqual(move.eliteGames, 60);
        assert.strictEqual(move.weightedGames, 260);
        assert.strictEqual(move.totalMastersGames, 100);
        assert.strictEqual(move.mastersMoveShare, 0.4);
        assert.strictEqual(move.totalEliteGames, 200);
        assert.strictEqual(move.eliteMoveShare, 0.3);
        assert.strictEqual(move.source, "Lichess Cloud Evaluation");
        assert.strictEqual(move.moveOrigin, "Human Move");
        assert.strictEqual(move.engineRank, 1);
        assert.strictEqual(move.deepVerified, false);
    });

    await t.test('new Repertoire defaults to generationStatus = IDLE and completedConfigHash = null', async () => {
        const rep = await newRepertoire("Default Rep");
        assert.strictEqual(rep.generationStatus, "IDLE");
        assert.strictEqual(rep.completedConfigHash, null);
    });

    // Cleanup and disconnect both connections
    await prisma.$disconnect();
    await opsPrisma.$disconnect();
});
