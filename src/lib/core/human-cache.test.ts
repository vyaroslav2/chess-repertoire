import test from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { parseFullFen, positionKeyFromFen } from './fen';
import {
  saveExplorerCache,
  readExplorerCache,
  type ExplorerMoveRow
} from '../db/operations';
import { fetchExplorer } from '../api/lichess';
import { defaultConfig, computeExplorerCacheProfile } from './config';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
});

const profile = () => computeExplorerCacheProfile(defaultConfig);
const read = (positionKey: string) => readExplorerCache(positionKey, profile());
const save = (positionKey: string, moves: ExplorerMoveRow[]) =>
  saveExplorerCache(positionKey, profile(), {
    positionTotalGames: moves.reduce((sum, move) => sum + move.games, 0), eco: null, openingName: null, moves
  });

test('DB.31 Explorer cache', async (t) => {
  await prisma.positionCache.deleteMany();

  const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const posKey = positionKeyFromFen(parseFullFen(fen));
  const emptyKey = positionKeyFromFen(parseFullFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"));

  await t.test('DB.31 one row per position per cache profile', async () => {
    await save(posKey, [{ uci: "e2e4", san: "e4", games: 100, whiteWins: 30, draws: 40, blackWins: 30 }]);
    const row = await prisma.positionCache.findUniqueOrThrow({
      where: { positionKey_cacheProfile: { positionKey: posKey, cacheProfile: profile() } },
      include: { moves: true }
    });
    assert.deepStrictEqual(row.moves.map(move => move.san), ["e4"]);
    assert.strictEqual(await prisma.positionCache.count(), 1);
  });

  await t.test('DB.31 a successful non-empty result reads back as success', async () => {
    const res = await read(posKey);
    assert.strictEqual(res.status, "success");
    if (res.status === "success") {
      assert.strictEqual(res.moves.length, 1);
      assert.strictEqual(res.moves[0].uci, "e2e4");
    }
  });

  await t.test('DB.31 a fetched position with no games is stored as empty (State B)', async () => {
    await save(emptyKey, []);
    assert.strictEqual((await read(emptyKey)).status, "empty");
  });

  await t.test('DB.31 saving the same position and profile replaces the old row', async () => {
    await save(posKey, [{ uci: "d2d4", san: "d4", games: 50, whiteWins: 20, draws: 20, blackWins: 10 }]);
    const res = await read(posKey);
    if (res.status !== "success") return assert.fail("Should be success");
    assert.deepStrictEqual(res.moves.map(move => move.uci), ["d2d4"]);
  });

  await t.test('DB.31 invalid writes leave the trusted row alone', async () => {
    const before = await read(posKey);
    assert.strictEqual(before.status, "success");

    const valid = { uci: "e2e4", san: "e4", games: 6, whiteWins: 2, draws: 2, blackWins: 2 };
    const invalidRows = [
      { ...valid, uci: "e8e8" },
      { ...valid, uci: "e7e8x" },
      { ...valid, uci: "e2e4q" },
      { ...valid, san: " " },
      { ...valid, games: Number.NaN },
      { ...valid, games: -1 },
      { ...valid, games: 6.5 },
      { ...valid, whiteWins: Number.POSITIVE_INFINITY },
      { ...valid, draws: -1 },
      { ...valid, blackWins: 1.5 },
      { ...valid, games: 7 }
    ];
    for (const invalid of invalidRows) {
      await assert.rejects(save(posKey, [valid, invalid]));
    }
    await assert.rejects(saveExplorerCache(posKey, profile(), { positionTotalGames: -1, eco: null, openingName: null, moves: [] }));

    assert.deepStrictEqual(await read(posKey), before, "invalid writes must not replace any trusted rows");
  });

  await t.test('DB.31 another cache profile is another row', async () => {
    assert.strictEqual((await readExplorerCache(posKey, "other-profile")).status, "missing");
    assert.strictEqual((await read(posKey)).status, "success");
  });

  await t.test('DB.31 fetchExplorer stores the position total, eco and openingName', async () => {
    const originalFetch = global.fetch;
    await prisma.positionCache.deleteMany();
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({
        white: 12, draws: 5, black: 3,
        moves: [{ san: "e4", white: 10, draws: 5, black: 2 }],
        opening: { eco: "A00", name: "Start position" }
      }));
    };
    try {
      const fresh = await fetchExplorer(fen);
      assert.strictEqual(fresh.positionTotalGames, 20);
      assert.strictEqual(fresh.totalGames, 17);
      assert.deepStrictEqual(fresh.opening, { eco: "A00", name: "Start position" });
      const cached = await fetchExplorer(fen);
      assert.strictEqual(calls, 1, "a cached position causes no second request");
      assert.strictEqual(cached.retrieval, "CACHE");
      assert.strictEqual(cached.positionTotalGames, 20);
      assert.deepStrictEqual(cached.opening, { eco: "A00", name: "Start position" });
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test('API Fetch Tests (Mocked)', async () => {
    const originalFetch = global.fetch;

    async function testMalformedResponse(responseBody: any, label: string) {
      await prisma.positionCache.deleteMany();
      global.fetch = async () => new Response(JSON.stringify(responseBody));
      await assert.rejects(fetchExplorer(fen), Error, `Expected error for ${label}`);
      assert.strictEqual((await read(posKey)).status, "missing", `${label} must not create a row`);
    }

    await testMalformedResponse({}, "missing moves field");
    await testMalformedResponse({ moves: "not_an_array" }, "moves not array");
    await testMalformedResponse({ moves: [{ white: 10, draws: 5, black: 2 }] }, "missing san");
    await testMalformedResponse({ moves: [{ san: "e4", draws: 5, black: 2 }] }, "missing statistic");
    await testMalformedResponse({ moves: [{ san: "e4", white: -1, draws: 5, black: 2 }] }, "negative statistic");
    await testMalformedResponse({ moves: [{ san: "e4", white: 10.5, draws: 5, black: 2 }] }, "non-integer statistic");
    await testMalformedResponse({ moves: [{ san: "e4", white: 10, draws: 5, black: 2 }, { san: "invalid_move", white: 1, draws: 1, black: 1 }] }, "one bad SAN among valid moves");
    await testMalformedResponse({ white: 0, draws: 0, black: 0, moves: [], opening: { eco: "A00" } }, "opening without a name");
    await testMalformedResponse({ moves: [] }, "missing position totals");

    // Public shape on fresh fetch and cache hit
    await prisma.positionCache.deleteMany();
    let shapeFetchCalls = 0;
    global.fetch = async () => {
      shapeFetchCalls++;
      return new Response(JSON.stringify({
        white: 10, draws: 5, black: 2,
        moves: [{ san: "e4", white: 10, draws: 5, black: 2 }]
      }));
    };

    const fresh = await fetchExplorer(fen);
    assert.strictEqual(fresh.moves[0].uci, "e2e4", "ordinary legal SAN converts to authoritative UCI");
    assert.strictEqual(fresh.moves[0].white, 10);
    assert.strictEqual(fresh.moves[0].draws, 5);
    assert.strictEqual(fresh.moves[0].black, 2);
    assert.strictEqual(fresh.moves[0].games, 17);
    assert.strictEqual((fresh.moves[0] as any).whiteWins, undefined, "Internal row shape leaked on fresh fetch");
    assert.strictEqual(shapeFetchCalls, 1, "EX: one request, for the Amateur dataset only");

    const cached = await fetchExplorer(fen);
    assert.strictEqual((cached.moves[0] as any).whiteWins, undefined, "Internal row shape leaked on cache hit");
    assert.deepStrictEqual(cached.moves, fresh.moves, "fresh and cached results have the same public shape");
    assert.strictEqual(shapeFetchCalls, 1, "a cache hit causes no HTTP request or request-layer spacing");

    // Only an explicit moves: [] is a successful empty source result.
    await prisma.positionCache.deleteMany();
    global.fetch = async () => new Response(JSON.stringify({ white: 0, draws: 0, black: 0, moves: [] }));
    assert.strictEqual((await fetchExplorer(fen)).moves.length, 0);
    assert.strictEqual((await read(posKey)).status, "empty");

    // Illegal/malformed SAN causes complete result rejection and writes nothing.
    global.fetch = async () => new Response(JSON.stringify({
      white: 11, draws: 6, black: 3,
      moves: [
        { san: "e4", white: 10, draws: 5, black: 2 },
        { san: "invalid_move", white: 1, draws: 1, black: 1 }
      ]
    }));
    const fen6 = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2"; // e4 c5
    await assert.rejects(fetchExplorer(fen6));
    const posKey6 = positionKeyFromFen(parseFullFen(fen6));
    assert.strictEqual((await read(posKey6)).status, "missing", "Nothing written on parse failure");

    // AR.11, AR.12: a failed request throws and must not become a successful empty row.
    const fen3 = "rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 2";
    const posKey3 = positionKeyFromFen(parseFullFen(fen3));
    global.fetch = async () => new Response("Error", { status: 404 });
    await assert.rejects(fetchExplorer(fen3), /Explorer returned HTTP 404\./);
    assert.strictEqual((await read(posKey3)).status, "missing", "A failed request must not create a row");

    // Promotion SAN converts to UCI with the promotion piece, from the exact FullFen.
    const fen4 = "4k3/3P4/8/8/8/8/8/4K3 w - - 0 1";
    const posKey4 = positionKeyFromFen(parseFullFen(fen4));
    global.fetch = async () => new Response(JSON.stringify({ white: 1, draws: 0, black: 0, moves: [{ san: "d8=Q+", white: 1, draws: 0, black: 0 }] }));
    await fetchExplorer(fen4);
    const promoted = await read(posKey4);
    if (promoted.status !== "success") return assert.fail("Should be success");
    assert.strictEqual(promoted.moves[0].uci, "d7d8q");

    global.fetch = originalFetch;
  });

  await prisma.$disconnect();
});
