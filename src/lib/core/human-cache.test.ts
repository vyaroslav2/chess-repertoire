import test from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { parseFullFen, positionKeyFromFen } from './fen';
import {
  saveExplorerCache,
  readExplorerCache,
  type ExplorerMoveRow,
  type HumanDatabaseType
} from '../db/operations';
import { fetchAllDatabases } from '../api/lichess';
import { defaultConfig, computeExplorerCacheProfile } from './config';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
});

const profile = (dataset: HumanDatabaseType) => computeExplorerCacheProfile(dataset, defaultConfig);
const read = (positionKey: string, dataset: HumanDatabaseType) => readExplorerCache(positionKey, profile(dataset));
const save = (positionKey: string, dataset: HumanDatabaseType, moves: ExplorerMoveRow[]) =>
  saveExplorerCache(positionKey, profile(dataset), {
    positionTotalGames: moves.reduce((sum, move) => sum + move.games, 0), eco: null, openingName: null, moves
  });

test('DB.31 Explorer cache', async (t) => {
  await prisma.positionCache.deleteMany();

  const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const posKey = positionKeyFromFen(parseFullFen(fen));

  await t.test('DB.31 one row per position per dataset profile', async () => {
    await save(posKey, "MASTERS", [{ uci: "e2e4", san: "e4", games: 100, whiteWins: 30, draws: 40, blackWins: 30 }]);
    const row = await prisma.positionCache.findUniqueOrThrow({
      where: { positionKey_cacheProfile: { positionKey: posKey, cacheProfile: profile("MASTERS") } },
      include: { moves: true }
    });
    assert.deepStrictEqual(row.moves.map(move => move.san), ["e4"]);
    assert.strictEqual(await prisma.positionCache.count(), 1);
  });

  await t.test('DB.31 a successful non-empty result reads back as success', async () => {
    const res = await read(posKey, "MASTERS");
    assert.strictEqual(res.status, "success");
    if (res.status === "success") {
      assert.strictEqual(res.moves.length, 1);
      assert.strictEqual(res.moves[0].uci, "e2e4");
    }
  });

  await t.test('DB.31 a fetched position with no games is stored as empty (State B)', async () => {
    await save(posKey, "ELITE", []);
    assert.strictEqual((await read(posKey, "ELITE")).status, "empty");
  });

  await t.test('DB.31 saving the same position and profile replaces the old row', async () => {
    await save(posKey, "MASTERS", [{ uci: "d2d4", san: "d4", games: 50, whiteWins: 20, draws: 20, blackWins: 10 }]);
    const res = await read(posKey, "MASTERS");
    if (res.status !== "success") return assert.fail("Should be success");
    assert.deepStrictEqual(res.moves.map(move => move.uci), ["d2d4"]);
  });

  await t.test('DB.31 invalid writes leave the trusted row alone', async () => {
    const before = await read(posKey, "MASTERS");
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
      await assert.rejects(save(posKey, "MASTERS", [valid, invalid]));
    }
    await assert.rejects(saveExplorerCache(posKey, profile("MASTERS"), { positionTotalGames: -1, eco: null, openingName: null, moves: [] }));

    assert.deepStrictEqual(await read(posKey, "MASTERS"), before, "invalid writes must not replace any trusted rows");
  });

  await t.test('DB.31 each dataset is cached on its own', async () => {
    assert.strictEqual((await read(posKey, "ELITE")).status, "empty");
    assert.strictEqual((await read(posKey, "AMATEUR")).status, "missing");
    assert.strictEqual((await read(posKey, "MASTERS")).status, "success");
  });

  await t.test('DB.31 fetchAllDatabases stores the position total, eco and openingName', async () => {
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
      const [fresh] = await fetchAllDatabases(fen, ["MASTERS"]);
      assert.strictEqual(fresh.positionTotalGames, 20);
      assert.strictEqual(fresh.totalGames, 17);
      assert.deepStrictEqual(fresh.opening, { eco: "A00", name: "Start position" });
      const [cached] = await fetchAllDatabases(fen, ["MASTERS"]);
      assert.strictEqual(calls, 1, "cached dataset causes no second request");
      assert.strictEqual(cached.retrieval, "CACHE");
      assert.strictEqual(cached.positionTotalGames, 20);
      assert.deepStrictEqual(cached.opening, { eco: "A00", name: "Start position" });
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test('API Fetch Tests (Mocked)', async () => {
    const originalFetch = global.fetch;
    let fetchCalls: string[] = [];

    async function testMalformedResponse(responseBody: any, label: string) {
      await prisma.positionCache.deleteMany();
      global.fetch = async () => new Response(JSON.stringify(responseBody));
      await assert.rejects(fetchAllDatabases(fen), Error, `Expected error for ${label}`);
      assert.strictEqual((await read(posKey, "MASTERS")).status, "missing", `${label} must not create a row`);
    }

    await testMalformedResponse({}, "missing moves field");
    await testMalformedResponse({ moves: "not_an_array" }, "moves not array");
    await testMalformedResponse({ moves: [{ white: 10, draws: 5, black: 2 }] }, "missing san");
    await testMalformedResponse({ moves: [{ san: "e4", draws: 5, black: 2 }] }, "missing statistic");
    await testMalformedResponse({ moves: [{ san: "e4", white: -1, draws: 5, black: 2 }] }, "negative statistic");
    await testMalformedResponse({ moves: [{ san: "e4", white: 10.5, draws: 5, black: 2 }] }, "non-integer statistic");
    await testMalformedResponse({ moves: [{ san: "e4", white: 10, draws: 5, black: 2 }, { san: "invalid_move", white: 1, draws: 1, black: 1 }] }, "one bad SAN among valid moves");
    await testMalformedResponse({ moves: [], opening: { eco: "A00" } }, "opening without a name");

    // Public shape on fresh fetch and cache hit
    await prisma.positionCache.deleteMany();
    let shapeFetchCalls = 0;
    global.fetch = async () => {
      shapeFetchCalls++;
      return new Response(JSON.stringify({
        moves: [{ san: "e4", white: 10, draws: 5, black: 2 }]
      }));
    };

    const [mResFresh] = await fetchAllDatabases(fen);
    assert.strictEqual(mResFresh.moves[0].uci, "e2e4", "ordinary legal SAN converts to authoritative UCI");
    assert.strictEqual(mResFresh.moves[0].white, 10);
    assert.strictEqual(mResFresh.moves[0].draws, 5);
    assert.strictEqual(mResFresh.moves[0].black, 2);
    assert.strictEqual(mResFresh.moves[0].games, 17);
    assert.strictEqual((mResFresh.moves[0] as any).whiteWins, undefined, "Internal row shape leaked on fresh fetch");
    assert.strictEqual(shapeFetchCalls, 3, "fresh fetch requests all three missing groups");

    const [mResCached] = await fetchAllDatabases(fen);
    assert.strictEqual((mResCached.moves[0] as any).whiteWins, undefined, "Internal row shape leaked on cache hit");
    assert.deepStrictEqual(mResCached.moves, mResFresh.moves, "fresh and cached buckets have the same public shape");
    assert.strictEqual(shapeFetchCalls, 3, "cached groups cause no HTTP requests or request-layer spacing");

    // White expansion needs Masters and Amateur only; it must not create an Elite row.
    await prisma.positionCache.deleteMany();
    shapeFetchCalls = 0;
    const whiteOnlyResults = await fetchAllDatabases(fen, ["MASTERS", "AMATEUR"]);
    assert.strictEqual(shapeFetchCalls, 2, "White-only retrieval requests Masters and Amateur, not Elite");
    assert.strictEqual(whiteOnlyResults[1].retrieval, "SKIPPED");
    assert.strictEqual((await read(posKey, "ELITE")).status, "missing");

    // Only an explicit moves: [] is a successful empty source result.
    await prisma.positionCache.deleteMany();
    global.fetch = async () => new Response(JSON.stringify({ moves: [] }));
    const emptyResults = await fetchAllDatabases(fen);
    assert.ok(emptyResults.every(result => result.moves.length === 0));
    assert.strictEqual((await read(posKey, "MASTERS")).status, "empty");

    // Illegal/malformed SAN causes complete result rejection and writes nothing.
    global.fetch = async (url: any) => {
      fetchCalls.push(url.toString());
      if (url.toString().includes("masters")) {
        return new Response(JSON.stringify({
          moves: [
            { san: "e4", white: 10, draws: 5, black: 2 },
            { san: "invalid_move", white: 1, draws: 1, black: 1 }
          ]
        }));
      }
      return new Response(JSON.stringify({ moves: [] }));
    };
    const fen6 = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2"; // e4 c5
    await assert.rejects(fetchAllDatabases(fen6));
    const posKey6 = positionKeyFromFen(parseFullFen(fen6));
    assert.strictEqual((await read(posKey6, "MASTERS")).status, "missing", "Nothing written on parse failure");

    // A failed required source throws rather than becoming empty.
    global.fetch = async (url: any) => {
      if (url.toString().includes("masters")) return new Response(JSON.stringify({ moves: [] }));
      if (url.toString().includes("ratings=2500")) return new Response("Error", { status: 404 }); // Elite
      return new Response(JSON.stringify({ moves: [] }));
    };
    const fen3 = "rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 2";
    const posKey3 = positionKeyFromFen(parseFullFen(fen3));
    await assert.rejects(fetchAllDatabases(fen3));
    assert.strictEqual((await read(posKey3, "MASTERS")).status, "empty", "Masters succeeded and was empty");
    assert.strictEqual((await read(posKey3, "ELITE")).status, "missing", "Elite failed and remains missing");

    // A failed Amateur request must not become a successful empty row after Masters and Elite succeed.
    await prisma.positionCache.deleteMany();
    global.fetch = async (url: any) => {
      if (url.toString().includes("ratings=1600")) return new Response("Error", { status: 404 });
      return new Response(JSON.stringify({ moves: [] }));
    };
    await assert.rejects(fetchAllDatabases(fen3), /Required Lichess Explorer AMATEUR request failed/);
    assert.strictEqual((await read(posKey3, "MASTERS")).status, "empty", "Masters successful empty response remains cached");
    assert.strictEqual((await read(posKey3, "ELITE")).status, "empty", "Elite successful empty response remains cached");
    assert.strictEqual((await read(posKey3, "AMATEUR")).status, "missing", "Failed Amateur request must not create a row");

    // When Masters and Elite are cached but Amateur is missing, only Amateur is fetched.
    global.fetch = async (url: any) => {
      fetchCalls.push(url.toString());
      return new Response(JSON.stringify({ moves: [{ san: "Nc6", white: 1, draws: 1, black: 1 }] }));
    };
    fetchCalls = [];
    await fetchAllDatabases(fen3);
    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].includes("ratings=1600"));

    // Promotion SAN converts to UCI with the promotion piece, from the exact FullFen.
    const fen4 = "4k3/3P4/8/8/8/8/8/4K3 w - - 0 1";
    const posKey4 = positionKeyFromFen(parseFullFen(fen4));
    global.fetch = async () => new Response(JSON.stringify({ moves: [{ san: "d8=Q+", white: 1, draws: 0, black: 0 }] }));
    await fetchAllDatabases(fen4);
    const mRes4 = await read(posKey4, "MASTERS");
    if (mRes4.status !== "success") return assert.fail("Should be success");
    assert.strictEqual(mRes4.moves[0].uci, "d7d8q");

    global.fetch = originalFetch;
  });

  await prisma.$disconnect();
});
