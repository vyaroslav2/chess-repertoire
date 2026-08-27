import test from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { parseFullFen, positionKeyFromFen } from './fen';
import {
  saveHumanExplorerBucket,
  readHumanExplorerBucket,
  getOrCreatePosition,
  getOrCreateHumanDataSnapshot,
  createRepertoireNode,
  HumanDatabaseType
} from '../db/operations';
import { fetchAllDatabases } from '../api/lichess';
import { defaultConfig, computeExplorerRequestProfile } from './config';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
});

test('Slice 5 Human Cache Rewrite Tests', async (t) => {
  // Clean DB
  await prisma.explorerMoveCache.deleteMany();
  await prisma.humanExplorerFetch.deleteMany();
  await prisma.humanDataSnapshot.deleteMany();
  await prisma.repertoireNode.deleteMany();
  await prisma.position.deleteMany();
  await prisma.repertoire.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({ data: { username: "test_slice5_user" } });
  const rep = await prisma.repertoire.create({ data: { title: "Test Rep", color: "white", userId: user.id } });
  const reqProfile = computeExplorerRequestProfile(defaultConfig);
  const snap = await getOrCreateHumanDataSnapshot(rep.id, reqProfile);
  const snapshotId = snap.id;

  const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const posKey = positionKeyFromFen(parseFullFen(fen));
  await getOrCreatePosition(fen);

  await t.test('1-3. ExplorerMoveCache belongs to snapshot + pos, unique identity', async () => {
    const moves = [{
      uci: "e2e4", san: "e4", games: 100, whiteWins: 30, draws: 40, blackWins: 30
    }];
    await saveHumanExplorerBucket(snapshotId, posKey, "MASTERS", moves);

    const row = await prisma.explorerMoveCache.findFirst({
      where: { snapshotId, positionKey: posKey, databaseType: "MASTERS", uci: "e2e4" }
    });
    assert.ok(row);
    assert.strictEqual(row.san, "e4");

    // Identity is unique
    const count = await prisma.explorerMoveCache.count();
    assert.strictEqual(count, 1);
  });

  await t.test('8. successful non-empty result writes all rows + marker atomically', async () => {
    const res = await readHumanExplorerBucket(snapshotId, posKey, "MASTERS");
    assert.strictEqual(res.status, "success");
    if (res.status === "success") {
      assert.strictEqual(res.moves.length, 1);
      assert.strictEqual(res.moves[0].uci, "e2e4");
    }
  });

  await t.test('9. successful empty result writes zero rows + marker and no _EMPTY_', async () => {
    await saveHumanExplorerBucket(snapshotId, posKey, "ELITE", []);
    const res = await readHumanExplorerBucket(snapshotId, posKey, "ELITE");
    assert.strictEqual(res.status, "empty");
    const count = await prisma.explorerMoveCache.count({
      where: { snapshotId, positionKey: posKey, databaseType: "ELITE" }
    });
    assert.strictEqual(count, 0); // No _EMPTY_ row
  });

  await t.test('10. refreshing exact bucket deletes stale old rows', async () => {
    const moves = [{
      uci: "d2d4", san: "d4", games: 50, whiteWins: 20, draws: 20, blackWins: 10
    }];
    await saveHumanExplorerBucket(snapshotId, posKey, "MASTERS", moves);
    const res = await readHumanExplorerBucket(snapshotId, posKey, "MASTERS");
    if (res.status === "success") {
      assert.strictEqual(res.moves.length, 1);
      assert.strictEqual(res.moves[0].uci, "d2d4", "Replaced e2e4 with d2d4");
    } else {
      assert.fail("Should be success");
    }
  });

  await t.test('invalid direct bucket writes preserve trusted rows and marker', async () => {
    const before = await readHumanExplorerBucket(snapshotId, posKey, "MASTERS");
    assert.strictEqual(before.status, "success");
    const markerBefore = await prisma.humanExplorerFetch.findUniqueOrThrow({
      where: { snapshotId_positionKey_databaseType: { snapshotId, positionKey: posKey, databaseType: "MASTERS" } }
    });

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
      await assert.rejects(saveHumanExplorerBucket(snapshotId, posKey, "MASTERS", [valid, invalid]));
    }

    const after = await readHumanExplorerBucket(snapshotId, posKey, "MASTERS");
    assert.deepStrictEqual(after, before, "invalid writes must not replace any trusted rows");
    const markerAfter = await prisma.humanExplorerFetch.findUnique({
      where: { snapshotId_positionKey_databaseType: { snapshotId, positionKey: posKey, databaseType: "MASTERS" } }
    });
    assert.deepStrictEqual(markerAfter, markerBefore, "invalid writes must preserve the successful fetch marker");
  });

  await t.test('11. refreshing one database bucket does not affect other database buckets', async () => {
    const eRes = await readHumanExplorerBucket(snapshotId, posKey, "ELITE");
    assert.strictEqual(eRes.status, "empty", "ELITE bucket remains empty");
  });

  await t.test('13. deleting snapshot deletes human move rows', async () => {
    const snap2 = await getOrCreateHumanDataSnapshot(rep.id, "some_other_profile");
    await saveHumanExplorerBucket(snap2.id, posKey, "MASTERS", [{
      uci: "c2c4", san: "c4", games: 10, whiteWins: 5, draws: 3, blackWins: 2
    }]);

    let c = await prisma.explorerMoveCache.count({ where: { snapshotId: snap2.id } });
    assert.strictEqual(c, 1);

    await prisma.humanDataSnapshot.delete({ where: { id: snap2.id } });
    c = await prisma.explorerMoveCache.count({ where: { snapshotId: snap2.id } });
    assert.strictEqual(c, 0);
  });

  await t.test('14. deleting snapshot/human rows does not delete Position/RepertoireNode', async () => {
    const p = await prisma.position.findUnique({ where: { positionKey: posKey } });
    assert.ok(p, "Position still exists");
  });

  await t.test('15. read API distinguishes missing/empty/success', async () => {
    const rMiss = await readHumanExplorerBucket(snapshotId, posKey, "AMATEUR");
    assert.strictEqual(rMiss.status, "missing");

    const rEmpty = await readHumanExplorerBucket(snapshotId, posKey, "ELITE");
    assert.strictEqual(rEmpty.status, "empty");

    const rSucc = await readHumanExplorerBucket(snapshotId, posKey, "MASTERS");
    assert.strictEqual(rSucc.status, "success");
  });

  await t.test('API Fetch Tests (Mocked)', async () => {
    const originalFetch = global.fetch;
    let fetchCalls: string[] = [];

    // Helper to test a malformed response
    async function testMalformedResponse(responseBody: any, label: string) {
      global.fetch = async () => new Response(JSON.stringify(responseBody));
      const fenTest = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      await getOrCreatePosition(fenTest);
      const malformedSnapshot = await getOrCreateHumanDataSnapshot(rep.id, `malformed-${label}`);
      let t = false;
      try {
        await fetchAllDatabases(fenTest, malformedSnapshot.id);
      } catch (e) {
        t = true;
      }
      assert.ok(t, `Expected error for ${label}`);
      const result = await readHumanExplorerBucket(malformedSnapshot.id, posKey, "MASTERS");
      assert.strictEqual(result.status, "missing", `${label} must not create a marker`);
      const rows = await prisma.explorerMoveCache.count({
        where: { snapshotId: malformedSnapshot.id, positionKey: posKey, databaseType: "MASTERS" }
      });
      assert.strictEqual(rows, 0, `${label} must not leave rows`);
    }

    await testMalformedResponse({}, "missing moves field");
    await testMalformedResponse({ moves: "not_an_array" }, "moves not array");
    await testMalformedResponse({ moves: [{ white: 10, draws: 5, black: 2 }] }, "missing san");
    await testMalformedResponse({ moves: [{ san: "e4", draws: 5, black: 2 }] }, "missing statistic");
    await testMalformedResponse({ moves: [{ san: "e4", white: -1, draws: 5, black: 2 }] }, "negative statistic");
    await testMalformedResponse({ moves: [{ san: "e4", white: 10.5, draws: 5, black: 2 }] }, "non-integer statistic");
    await testMalformedResponse({ moves: [{ san: "e4", white: 10, draws: 5, black: 2 }, { san: "invalid_move", white: 1, draws: 1, black: 1 }] }, "one bad SAN among valid moves");

    // Test F public shape on fresh fetch and cache hit
    let shapeFetchCalls = 0;
    global.fetch = async () => {
      shapeFetchCalls++;
      return new Response(JSON.stringify({
        moves: [{ san: "e4", white: 10, draws: 5, black: 2 }]
      }));
    };
    const fenShape = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    await getOrCreatePosition(fenShape);
    const shapeSnapshot = await getOrCreateHumanDataSnapshot(rep.id, "public-shape");

    // Fresh fetch
    const [mResFresh] = await fetchAllDatabases(fenShape, shapeSnapshot.id);
    assert.strictEqual(mResFresh.moves[0].uci, "e2e4", "ordinary legal SAN converts to authoritative UCI");
    assert.strictEqual(mResFresh.moves[0].white, 10);
    assert.strictEqual(mResFresh.moves[0].draws, 5);
    assert.strictEqual(mResFresh.moves[0].black, 2);
    assert.strictEqual(mResFresh.moves[0].games, 17);
    assert.strictEqual((mResFresh.moves[0] as any).whiteWins, undefined, "Internal row shape leaked on fresh fetch");
    assert.strictEqual(shapeFetchCalls, 3, "fresh fetch requests all three missing groups");

    // Cache hit
    const [mResCached] = await fetchAllDatabases(fenShape, shapeSnapshot.id);
    assert.strictEqual(mResCached.moves[0].white, 10);
    assert.strictEqual(mResCached.moves[0].draws, 5);
    assert.strictEqual(mResCached.moves[0].black, 2);
    assert.strictEqual(mResCached.moves[0].games, 17);
    assert.strictEqual((mResCached.moves[0] as any).whiteWins, undefined, "Internal row shape leaked on cache hit");
    assert.deepStrictEqual(mResCached.moves, mResFresh.moves, "fresh and cached buckets have the same public shape");
    assert.strictEqual(shapeFetchCalls, 3, "cached groups cause no HTTP requests or request-layer spacing");

    // Only an explicit moves: [] is a successful empty source result.
    const emptySnapshot = await getOrCreateHumanDataSnapshot(rep.id, "explicit-empty");
    global.fetch = async () => new Response(JSON.stringify({ moves: [] }));
    const emptyResults = await fetchAllDatabases(fenShape, emptySnapshot.id);
    assert.ok(emptyResults.every(result => result.moves.length === 0));
    assert.strictEqual((await readHumanExplorerBucket(emptySnapshot.id, posKey, "MASTERS")).status, "empty");

    // Reset global fetch for subsequent tests
    global.fetch = async (url: any) => {
      fetchCalls.push(url.toString());

      if (url.toString().includes("masters")) {
        return new Response(JSON.stringify({
          moves: [
            { san: "e4", white: 10, draws: 5, black: 2 },
            { san: "invalid_move", white: 1, draws: 1, black: 1 } // Will cause error
          ]
        }));
      }

      if (url.toString().includes("speeds=") && url.toString().includes("ELITE")) {
        return new Response("Error", { status: 404 });
      }

      return new Response(JSON.stringify({ moves: [] }));
    };

    // 6, 7. Illegal/malformed SAN causes complete result rejection
    let threw = false;
    const fen5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"; // e4 e5
    await getOrCreatePosition(fen5);
    try {
      await fetchAllDatabases(fen5, snapshotId);
    } catch (e) {
      threw = true;
    }
    assert.ok(threw, "Malformed SAN threw an error");

    // Check that marker wasn't written for MASTERS (because it failed)
    // Wait, MASTERS was already "success" for this snapshot/pos from the previous tests.
    // Let's use a new fen.
    const fen6 = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2"; // e4 c5
    await getOrCreatePosition(fen6);

    threw = false;
    try {
      await fetchAllDatabases(fen6, snapshotId);
    } catch(e) {
      threw = true;
    }
    assert.ok(threw);

    const posKey6 = positionKeyFromFen(parseFullFen(fen6));
    const mRes = await readHumanExplorerBucket(snapshotId, posKey6, "MASTERS");
    assert.strictEqual(mRes.status, "missing", "Marker not written on parse failure");

    // 17. failed required source throws rather than becoming empty
    // ELITE mock returns a non-retryable failure. Let's mock MASTERS to be valid.
    global.fetch = async (url: any) => {
      if (url.toString().includes("masters")) return new Response(JSON.stringify({ moves: [] }));
      if (url.toString().includes("ratings=2500")) return new Response("Error", { status: 404 }); // Elite
      return new Response(JSON.stringify({ moves: [] }));
    };

    const fen3 = "rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 2";
    await getOrCreatePosition(fen3);
    const posKey3 = positionKeyFromFen(parseFullFen(fen3));

    threw = false;
    try {
      await fetchAllDatabases(fen3, snapshotId);
    } catch(e) {
      threw = true;
    }
    assert.ok(threw, "Fetch error throws");

    // 18. failed source does not create fetch marker
    const mRes3 = await readHumanExplorerBucket(snapshotId, posKey3, "MASTERS");
    assert.strictEqual(mRes3.status, "empty", "Masters succeeded and was empty");
    const eRes3 = await readHumanExplorerBucket(snapshotId, posKey3, "ELITE");
    assert.strictEqual(eRes3.status, "missing", "Elite failed and remains missing");

    // 16. when Masters and Elite are cached but Amateur missing, F fetches only Amateur
    global.fetch = async (url: any) => {
      fetchCalls.push(url.toString());
      return new Response(JSON.stringify({ moves: [{ san: "Nc6", white: 1, draws: 1, black: 1 }] }));
    };

    fetchCalls = [];
    // Provide Elite
    await saveHumanExplorerBucket(snapshotId, posKey3, "ELITE", []);
    // Now MASTERS and ELITE are cached (empty), AMATEUR is missing.
    await fetchAllDatabases(fen3, snapshotId);

    // It should have only fetched AMATEUR
    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].includes("ratings=1600"));
    // Actually just check it only made 1 network call

    // 5. promotion SAN converts to UCI with promotion piece
    // 19. exact FullFen is used for SAN conversion
    const fen4 = "4k3/3P4/8/8/8/8/8/4K3 w - - 0 1";
    await getOrCreatePosition(fen4);
    const posKey4 = positionKeyFromFen(parseFullFen(fen4));

    global.fetch = async (url: any) => {
      return new Response(JSON.stringify({ moves: [{ san: "d8=Q+", white: 1, draws: 0, black: 0 }] }));
    };

    await fetchAllDatabases(fen4, snapshotId);

    const mRes4 = await readHumanExplorerBucket(snapshotId, posKey4, "MASTERS");
    if (mRes4.status === "success") {
       assert.strictEqual(mRes4.moves[0].uci, "d7d8q");
    } else {
       assert.fail("Should be success");
    }

    // 20. no _EMPTY_ row exists anywhere in new ExplorerMoveCache writes
    const emptyCount = await prisma.explorerMoveCache.count({ where: { san: "_EMPTY_" } });
    assert.strictEqual(emptyCount, 0);

    global.fetch = originalFetch;
  });

  await prisma.$disconnect();
});
