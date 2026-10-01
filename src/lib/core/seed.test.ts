import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Chess } from "chess.js";
import { prisma, createRepertoireNode, createOpponentMove } from "../db/operations";
import { parseFullFen, positionKeyFromFen } from "./fen";
import { generateRepertoire } from "./generator";

const START_FEN = new Chess().fen();

// The root has no games, so the queue is empty once it is processed.
const noGames = {
  fetchDatabases: (async () => [
    { moves: [], totalGames: 0, opening: undefined },
    { moves: [], totalGames: 0 },
    { moves: [], totalGames: 0 }
  ]) as any,
  fetchOpeningMetadata: async () => null,
  ensureNodeWikibooks: (async () => ({ status: "CACHED", text: null })) as any,
  wait: async () => undefined
};

describe("S2 seed", () => {
  let userId: string;
  let repertoireId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({ data: { username: `s2_seed_${Date.now()}` } });
    userId = user.id;
    const repertoire = await prisma.repertoire.create({ data: { title: "S2 seed", color: "black", userId } });
    repertoireId = repertoire.id;
  });

  afterEach(async () => {
    await prisma.repertoire.deleteMany({ where: { id: repertoireId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("S2.04: wipes nodes, moves and Position rows; the Explorer cache survives", async () => {
    const oldRoot = await createRepertoireNode(repertoireId, START_FEN, "", 1.0);
    const chess = new Chess();
    chess.move("e4");
    const oldChild = await createRepertoireNode(repertoireId, chess.fen(), "e2e4", 0.5, { displayPgn: "e4" });
    await createOpponentMove({ repertoireId, fromNodeId: oldRoot.id, toNodeId: oldChild.id, san: "e4", moveProb: 0.5 });
    const cacheProfile = `s2_seed_${Date.now()}`;
    const cached = await prisma.positionCache.create({
      data: { positionKey: positionKeyFromFen(parseFullFen(START_FEN)), cacheProfile, positionTotalGames: 0 }
    });

    try {
      await generateRepertoire(START_FEN, { repertoireId, ...noGames });

      const nodes = await prisma.repertoireNode.findMany({ where: { repertoireId } });
      assert.equal(nodes.length, 1);
      assert.equal(nodes[0].history, "");
      assert.ok(!nodes.some(node => node.id === oldRoot.id || node.id === oldChild.id));
      assert.equal(await prisma.repertoireMove.count({ where: { repertoireId } }), 0);
      const positions = await prisma.position.findMany({ where: { repertoireId } });
      assert.deepEqual(positions.map(position => position.nodeId), [nodes[0].id]);
      assert.ok(await prisma.positionCache.findUnique({ where: { id: cached.id } }));
    } finally {
      await prisma.positionCache.deleteMany({ where: { id: cached.id } });
    }
  });

  it("S2.01 S2.06 S2.07: tinyDroppedTotal starts at zero; the root is queued at 100% routeProb and cumProb", async () => {
    const summary = await generateRepertoire(START_FEN, { repertoireId, ...noGames });

    assert.equal(summary.tinyDroppedTotal, 0);
    assert.equal(summary.totalPositionsProcessed, 1);
    const root = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, history: "" } });
    assert.equal(root.routeProb, 1);
    assert.equal(root.cumProb, 1);
  });
});

describe("S2.02 S2.03 user and repertoire", () => {
  let createdUserId: string | null = null;
  let createdRepertoireId: string | null = null;

  afterEach(async () => {
    if (createdRepertoireId) await prisma.repertoire.deleteMany({ where: { id: createdRepertoireId } });
    if (createdUserId) await prisma.user.deleteMany({ where: { id: createdUserId } });
  });

  it("S2.02 S2.03: finds or creates Yaroslav and the Black repertoire, and reuses them", async () => {
    const existingUser = await prisma.user.findUnique({ where: { username: "Yaroslav" } });
    const existingRepertoire = existingUser
      ? await prisma.repertoire.findFirst({ where: { userId: existingUser.id, title: "Black Universal Repertoire" } })
      : null;

    await generateRepertoire(START_FEN, noGames);

    const user = await prisma.user.findUniqueOrThrow({ where: { username: "Yaroslav" } });
    const repertoires = await prisma.repertoire.findMany({ where: { userId: user.id, title: "Black Universal Repertoire" } });
    assert.equal(repertoires.length, 1);
    assert.equal(repertoires[0].color, "black");
    if (!existingUser) createdUserId = user.id;
    if (!existingRepertoire) createdRepertoireId = repertoires[0].id;

    await generateRepertoire(START_FEN, noGames);
    assert.equal(await prisma.user.count({ where: { username: "Yaroslav" } }), 1);
    assert.equal(await prisma.repertoire.count({ where: { userId: user.id, title: "Black Universal Repertoire" } }), 1);
  });
});
