import test from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { parseFullFen, positionKeyFromFen } from './fen';
import type { HumanDatabaseType } from '../db/operations';

// Test DB path is expected to be managed externally via scripts/run_db_tests.ts
const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL
});

test('Slice 3 Database Architecture Tests', async (t) => {
    // Dynamic import ensures the module's PrismaClient evaluates process.env.DATABASE_URL *after* we've set it to test.db.
    const { getOrCreatePosition, createRepertoireNode, getOrCreatePositionCache, prisma: opsPrisma } = await import('../db/operations');

    // 10. freshly pushed schema is usable
    await t.test('10. freshly pushed schema is usable', async () => {
        // The fresh creation of the disposable db is verified externally via the setup shell commands.
        // Here we just verify the resulting schema is usable and responds.
        const count = await prisma.user.count();
        assert.ok(typeof count === 'number');
    });

    // Clean test database safely
    await prisma.repertoirePositionStat.deleteMany();
    await prisma.repertoireMove.deleteMany();
    await prisma.repertoireNode.deleteMany();
    await prisma.positionCache.deleteMany();
    await prisma.repertoire.deleteMany();
    await prisma.position.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({ data: { username: "test_db_user" } });

    await t.test('1. same PositionKey creates/reuses one Position', async () => {
        const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const pos1 = await getOrCreatePosition(fen);
        const pos2 = await getOrCreatePosition(fen);
        assert.strictEqual(pos1.positionKey, pos2.positionKey);
        const count = await prisma.position.count();
        assert.strictEqual(count, 1);
    });

    await t.test('2. two FullFens differing only in counters reuse the same Position', async () => {
        const fen1 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 5 10";
        const fen2 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const pos1 = await getOrCreatePosition(fen1);
        const pos2 = await getOrCreatePosition(fen2);
        assert.strictEqual(pos1.positionKey, pos2.positionKey);
        const count = await prisma.position.count();
        assert.strictEqual(count, 1); // Still 1 because they share positionKey
    });

    await t.test('3. RepertoireNode stores canonical fullFen and derived positionKey', async () => {
        const rep = await prisma.repertoire.create({
            data: { title: "Test Rep", color: "white", userId: user.id }
        });
        const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const node = await createRepertoireNode(rep.id, fen, "", 1.0);
        const fullFen = parseFullFen(fen);
        const positionKey = positionKeyFromFen(fullFen);
        assert.strictEqual(node.fullFen, fullFen);
        assert.strictEqual(node.positionKey, positionKey);
        const pos = await prisma.position.findUnique({ where: { positionKey } });
        assert.ok(pos);
    });

    await t.test('4. FullFen/PositionKey consistency cannot be violated through the node-creation API', async () => {
        const rep = await prisma.repertoire.create({
            data: { title: "API Test Rep", color: "white", userId: user.id }
        });

        const rawFen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
        const expectedFullFen = parseFullFen(rawFen);
        const expectedPosKey = positionKeyFromFen(expectedFullFen);

        const node = await createRepertoireNode(rep.id, rawFen, "", 1.0);

        // Assert that the node correctly stored the derived keys
        assert.strictEqual(node.fullFen, expectedFullFen);
        assert.strictEqual(node.positionKey, expectedPosKey);

        // Assert that the global Position row actually exists and uses that exact key
        const pos = await prisma.position.findUnique({
            where: { positionKey: expectedPosKey }
        });
        assert.ok(pos, "Position row should exist with the derived positionKey");
        assert.strictEqual(pos.positionKey, expectedPosKey);
    });

    await t.test('5. two repertoires can independently reference the same global Position', async () => {
        const rep1 = await prisma.repertoire.create({ data: { title: "Rep1", color: "white", userId: user.id } });
        const rep2 = await prisma.repertoire.create({ data: { title: "Rep2", color: "black", userId: user.id } });
        const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
        const node1 = await createRepertoireNode(rep1.id, fen, "1. e4", 1.0);
        const node2 = await createRepertoireNode(rep2.id, fen, "1. e4", 1.0);
        assert.strictEqual(node1.positionKey, node2.positionKey);
        const posCount = await prisma.position.count({ where: { positionKey: node1.positionKey } });
        assert.strictEqual(posCount, 1);
    });

    await t.test('6. deleting one repertoire deletes its nodes but leaves Position intact', async () => {
        const rep1 = await prisma.repertoire.create({ data: { title: "Rep to Delete", color: "white", userId: user.id } });
        const fen = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2";
        const node = await createRepertoireNode(rep1.id, fen, "1. e4 c5", 1.0);
        const positionKey = node.positionKey;
        const posBefore = await prisma.position.findUnique({ where: { positionKey } });
        assert.ok(posBefore);
        await prisma.repertoire.delete({ where: { id: rep1.id } });
        const nodeAfter = await prisma.repertoireNode.findUnique({ where: { id: node.id } });
        assert.ok(!nodeAfter); // Node is deleted
        const posAfter = await prisma.position.findUnique({ where: { positionKey } });
        assert.ok(posAfter); // Position is NOT deleted
    });

    await t.test('7. deleting PositionCache does not affect RepertoireNode', async () => {
        const rep = await prisma.repertoire.create({ data: { title: "Cache Test Rep", color: "white", userId: user.id } });
        const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
        const cache = await getOrCreatePositionCache(fen);
        assert.ok(cache);
        const node = await createRepertoireNode(rep.id, fen, "1. e4 e5", 1.0);
        assert.ok(node);
        await prisma.positionCache.delete({ where: { fen: cache.fen } });
        const nodeAfter = await prisma.repertoireNode.findUnique({ where: { id: node.id } });
        assert.ok(nodeAfter); // Node survives cache deletion
        const posAfter = await prisma.position.findUnique({ where: { positionKey: node.positionKey } });
        assert.ok(posAfter); // Permanent position survives cache deletion
    });

    await t.test('8. Position model contains no ECO/openingName/wikiText ownership', async () => {
        const positionKeys = Object.keys(prisma.position.fields);
        assert.ok(!positionKeys.includes('eco'));
        assert.ok(!positionKeys.includes('openingName'));
        assert.ok(!positionKeys.includes('wikiText'));
        // As a sanity check, these should be on PositionCache
        const cacheKeys = Object.keys(prisma.positionCache.fields);
        assert.ok(cacheKeys.includes('eco'));
        assert.ok(cacheKeys.includes('openingName'));
    });

    await t.test('9. new Repertoire defaults to generationStatus = IDLE and completedConfigHash = null', async () => {
        const rep = await prisma.repertoire.create({
            data: { title: "Default Rep", color: "white", userId: user.id }
        });
        assert.strictEqual(rep.generationStatus, "IDLE");
        assert.strictEqual(rep.completedConfigHash, null);
    });

    await t.test('11. snapshot belongs to one repertoire (and reusing works)', async () => {
        const { getCompatibleHumanDataSnapshot, createHumanDataSnapshot, getOrCreateHumanDataSnapshot } = await import('../db/operations');
        const rep1 = await prisma.repertoire.create({ data: { title: "S1", color: "white", userId: user.id } });
        const rep2 = await prisma.repertoire.create({ data: { title: "S2", color: "black", userId: user.id } });
        const profile = "test_profile_A";

        // normal get-or-create API
        const snap1 = await getOrCreateHumanDataSnapshot(rep1.id, profile);
        const snap2 = await getOrCreateHumanDataSnapshot(rep1.id, profile);
        assert.strictEqual(snap1.id, snap2.id, "Two ordinary get-or-create calls return the same snapshot");

        // different repertoire + same profile does not share snapshot
        const fetched2 = await getCompatibleHumanDataSnapshot(rep2.id, profile);
        assert.ok(!fetched2);

        // different request profile is incompatible
        const fetched3 = await getCompatibleHumanDataSnapshot(rep1.id, "test_profile_B");
        assert.ok(!fetched3);
    });

    await t.test('12. snapshot age behavior (younger/older than 7 days)', async () => {
        const { getCompatibleHumanDataSnapshot, createHumanDataSnapshot } = await import('../db/operations');
        const rep = await prisma.repertoire.create({ data: { title: "Age Test", color: "white", userId: user.id } });
        const profile = "age_profile";

        // Create a snapshot and manually backdate it to 8 days ago
        const snap = await createHumanDataSnapshot(rep.id, profile);
        const eightDaysAgo = new Date();
        eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
        await prisma.humanDataSnapshot.update({
            where: { id: snap.id },
            data: { startedAt: eightDaysAgo }
        });

        // younger and older than 7 days are both still reused automatically
        const fetched = await getCompatibleHumanDataSnapshot(rep.id, profile);
        assert.strictEqual(fetched?.id, snap.id);
    });

    await t.test('13. HumanExplorerFetch uniqueness and independent markers', async () => {
        const { createHumanDataSnapshot, recordHumanExplorerFetch, checkHumanExplorerFetch, getOrCreatePosition } = await import('../db/operations');
        const rep = await prisma.repertoire.create({ data: { title: "Fetch Test", color: "white", userId: user.id } });
        const snap = await createHumanDataSnapshot(rep.id, "fetch_profile");
        const fullFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const pos = await getOrCreatePosition(fullFen);
        const posKey = pos.positionKey;

        // one Position can have independent MASTERS / ELITE / AMATEUR markers
        await recordHumanExplorerFetch(snap.id, posKey, "MASTERS");
        await recordHumanExplorerFetch(snap.id, posKey, "ELITE");

        const mFetch = await checkHumanExplorerFetch(snap.id, posKey, "MASTERS");
        const eFetch = await checkHumanExplorerFetch(snap.id, posKey, "ELITE");
        const aFetch = await checkHumanExplorerFetch(snap.id, posKey, "AMATEUR");

        assert.ok(mFetch);
        assert.ok(eFetch);
        assert.ok(!aFetch);

        // HumanExplorerFetch uniqueness: snapshot + Position + databaseType
        // Upserting the same one shouldn't duplicate
        await recordHumanExplorerFetch(snap.id, posKey, "MASTERS");
        const count = await prisma.humanExplorerFetch.count({
            where: { snapshotId: snap.id, positionKey: posKey, databaseType: "MASTERS" }
        });
        assert.strictEqual(count, 1);
        // Ensure invalid databaseType throws hard error
        let rejected = false;
        try {
            await recordHumanExplorerFetch(snap.id, posKey, "INVALID" as unknown as HumanDatabaseType);
        } catch (e) {
            rejected = true;
        }
        assert.ok(rejected, "INVALID database type must be rejected");
    });

    await t.test('14. successful-empty state is represented by fetch marker with zero rows', async () => {
        const { createHumanDataSnapshot, recordHumanExplorerFetch, getOrCreatePosition } = await import('../db/operations');
        const rep = await prisma.repertoire.create({ data: { title: "Empty Test", color: "white", userId: user.id } });
        const snap = await createHumanDataSnapshot(rep.id, "empty_profile");
        const fullFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const pos = await getOrCreatePosition(fullFen);
        const posKey = pos.positionKey;

        const beforeCount = await prisma.explorerMoveCache.count({
            where: { snapshotId: snap.id, positionKey: posKey, databaseType: "MASTERS" }
        });

        // We just record the fetch. We do not insert any _EMPTY_ ExplorerMoveCache.
        const fetch = await recordHumanExplorerFetch(snap.id, posKey, "MASTERS");
        assert.ok(fetch);

        const afterCount = await prisma.explorerMoveCache.count({
            where: { snapshotId: snap.id, positionKey: posKey, databaseType: "MASTERS" }
        });
        assert.strictEqual(beforeCount, afterCount, "Recording successful fetch marker must not implicitly insert move cache rows");

        const emptyRow = await prisma.explorerMoveCache.findFirst({
            where: { snapshotId: snap.id, positionKey: posKey, databaseType: "MASTERS", san: "_EMPTY_" }
        });
        assert.ok(!emptyRow, "Recording successful fetch marker must not insert _EMPTY_ string markers");
    });

    await t.test('15. deleting snapshot deletes its fetch markers but not Position or RepertoireNode', async () => {
        const { createHumanDataSnapshot, recordHumanExplorerFetch, createRepertoireNode } = await import('../db/operations');
        const rep = await prisma.repertoire.create({ data: { title: "Delete Test", color: "white", userId: user.id } });
        const snap = await createHumanDataSnapshot(rep.id, "del_profile");
        const rawFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const node = await createRepertoireNode(rep.id, rawFen, "", 1.0);

        await recordHumanExplorerFetch(snap.id, node.positionKey, "MASTERS");
        // Delete snapshot
        await prisma.humanDataSnapshot.delete({ where: { id: snap.id } });
        // deleting snapshot deletes its fetch markers
        const fetchCount = await prisma.humanExplorerFetch.count({ where: { snapshotId: snap.id } });
        assert.strictEqual(fetchCount, 0);

        // deleting snapshot does not delete Position or RepertoireNode
        const nodeAfter = await prisma.repertoireNode.findUnique({ where: { id: node.id } });
        assert.ok(nodeAfter);
        const posAfter = await prisma.position.findUnique({ where: { positionKey: node.positionKey } });
        assert.ok(posAfter);
    });

    await t.test('16. fetch marker relates to permanent Position, not PositionCache', async () => {
        const { createHumanDataSnapshot, recordHumanExplorerFetch, getOrCreatePosition } = await import('../db/operations');
        const rep = await prisma.repertoire.create({ data: { title: "Rel Test", color: "white", userId: user.id } });
        const snap = await createHumanDataSnapshot(rep.id, "rel_profile");
        const fullFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const pos = await getOrCreatePosition(fullFen);
        const posKey = pos.positionKey;

        const fetch = await recordHumanExplorerFetch(snap.id, posKey, "MASTERS");
        assert.ok(fetch);
        // Verify it relates to that Position
        const fetchRow = await prisma.humanExplorerFetch.findUnique({
            where: { id: fetch.id },
            include: { position: true }
        });
        assert.strictEqual(fetchRow?.position.positionKey, posKey);

        // Verify no PositionCache is required (we didn't create one)
        const cacheRow = await prisma.positionCache.findUnique({ where: { fen: posKey } });
        assert.ok(!cacheRow);
        // Deleting Position while referenced should be restricted
        let restricted = false;
        try {
            await prisma.position.delete({ where: { positionKey: posKey } });
        } catch (e) {
            restricted = true; // Should throw because of Restrict relation
        }
        assert.ok(restricted, "Deleting Position while referenced by fetch marker must be restricted");
    });

    // Cleanup and disconnect both connections
    await prisma.$disconnect();
    await opsPrisma.$disconnect();
});
