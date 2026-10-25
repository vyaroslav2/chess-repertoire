import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Chess } from "chess.js";
import { createRepertoireNode, prisma } from "../db/operations";
import { UserRequestedStopError } from "../api/retry";
import { captureRebuildOpeningMetadataCache, fillMissingOpeningMetadata, generateRepertoire, restoreRebuildOpeningMetadataState } from "./generator";

let userId: string;
let repertoireId: string;

before(async () => {
  await prisma.$connect();
  const user = await prisma.user.create({ data: { username: `opening-metadata-${Date.now()}` } });
  userId = user.id;
  const repertoire = await prisma.repertoire.create({ data: { title: "Opening metadata test", color: "black", userId } });
  repertoireId = repertoire.id;
});

after(async () => {
  await prisma.repertoire.deleteMany({ where: { id: repertoireId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

test("DB.33 opening metadata and valid absence survive rebuild only for the same exact history", async () => {
  const root = await createRepertoireNode(repertoireId, new Chess().fen(), "", 1, {
    displayPgn: "",
    openingMetadataStatus: "VALID_ABSENCE"
  });
  const chess = new Chess();
  chess.move("e4"); chess.move("c6");
  await createRepertoireNode(repertoireId, chess.fen(), "e2e4 c7c6", 0.64, {
    displayPgn: "e4 c6",
    eco: "B10",
    openingName: "Caro-Kann Defense",
    openingMetadataStatus: "PRESENT"
  });

  const cache = await captureRebuildOpeningMetadataCache(repertoireId);
  await prisma.repertoireNode.deleteMany({ where: { repertoireId } });
  const rebuiltRoot = await createRepertoireNode(repertoireId, root.fullFen, "", 1, { displayPgn: "" });
  const rebuiltLine = await createRepertoireNode(repertoireId, chess.fen(), "e2e4 c7c6", 0.64, { displayPgn: "e4 c6" });
  const otherHistory = await createRepertoireNode(repertoireId, chess.fen(), "alternate-history", 0.1, { displayPgn: "alternate" });

  assert.equal(await restoreRebuildOpeningMetadataState(rebuiltRoot.id, cache), true);
  assert.equal(await restoreRebuildOpeningMetadataState(rebuiltLine.id, cache), true);
  assert.equal(await restoreRebuildOpeningMetadataState(otherHistory.id, cache), false);

  const [restoredRoot, restoredLine, untouched] = await Promise.all([
    prisma.repertoireNode.findUniqueOrThrow({ where: { id: rebuiltRoot.id } }),
    prisma.repertoireNode.findUniqueOrThrow({ where: { id: rebuiltLine.id } }),
    prisma.repertoireNode.findUniqueOrThrow({ where: { id: otherHistory.id } })
  ]);
  assert.equal(restoredRoot.openingMetadataStatus, "VALID_ABSENCE");
  assert.equal(restoredLine.eco, "B10");
  assert.equal(restoredLine.openingName, "Caro-Kann Defense");
  assert.equal(untouched.openingMetadataStatus, null);
});

test("DB.06 opening values cannot be stored without a status", async () => {
  await assert.rejects(
    createRepertoireNode(repertoireId, new Chess().fen(), "invalid-opening", 1, {
      eco: "A00",
      openingName: "Invalid"
    }),
    /status is missing/
  );
});

test("DB.33 an interrupted rebuild cannot erase opening metadata for a later exact history", async () => {
  const chess = new Chess();
  chess.move("d4"); chess.move("d5");
  await createRepertoireNode(repertoireId, chess.fen(), "d2d4 d7d5", 0.2, {
    displayPgn: "d4 d5",
    eco: "D00",
    openingName: "Queen's Pawn Game",
    openingMetadataStatus: "PRESENT"
  });

  await captureRebuildOpeningMetadataCache(repertoireId);
  await prisma.repertoireNode.deleteMany({ where: { repertoireId } });
  await createRepertoireNode(repertoireId, new Chess().fen(), "", 1, { displayPgn: "" });
  // The partial rebuild stops before d4 d5 is recreated.

  const nextCache = await captureRebuildOpeningMetadataCache(repertoireId);
  assert.equal(nextCache.get("d2d4 d7d5")?.eco, "D00");
  const rebuilt = await createRepertoireNode(repertoireId, chess.fen(), "d2d4 d7d5", 0.2, { displayPgn: "d4 d5" });
  assert.equal(await restoreRebuildOpeningMetadataState(rebuilt.id, nextCache), true);
  const restored = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: rebuilt.id } });
  assert.equal(restored.openingName, "Queen's Pawn Game");
});

test("DB.06 rule 2 a cached absence copies its named parent", async () => {
  const chess = new Chess();
  chess.move("e4"); chess.move("c6"); chess.move("Bc4");
  await createRepertoireNode(repertoireId, chess.fen(), "e2e4 c7c6 f1c4", 0.1, {
    displayPgn: "e4 c6 Bc4",
    eco: "B10",
    openingName: "Caro-Kann Defense: Hillbilly Attack",
    openingMetadataStatus: "PRESENT"
  });
  chess.move("d5");
  await createRepertoireNode(repertoireId, chess.fen(), "e2e4 c7c6 f1c4 d7d5", 0.1, {
    displayPgn: "e4 c6 Bc4 d5",
    openingMetadataStatus: "VALID_ABSENCE"
  });

  const cache = await captureRebuildOpeningMetadataCache(repertoireId);
  const child = cache.get("e2e4 c7c6 f1c4 d7d5");
  assert.equal(child?.status, "PRESENT");
  assert.equal(child?.eco, "B10");
  assert.equal(child?.openingName, "Caro-Kann Defense: Hillbilly Attack");
});

test("DB.06 a missing name is retried, parents first, and a name Explorer lacks copies the parent", async () => {
  const own = await prisma.repertoire.create({ data: { title: "Missing names", color: "black", userId } });
  try {
    const chess = new Chess();
    await createRepertoireNode(own.id, chess.fen(), "", 1, { displayPgn: "", openingMetadataStatus: "VALID_ABSENCE" });
    chess.move("d4");
    const afterD4 = chess.fen();
    chess.move("d5");
    // Stored child first, so only the sort puts the parent first.
    const child = await createRepertoireNode(own.id, chess.fen(), "d2d4 d7d5", 0.5, { displayPgn: "d4 d5" });
    const parent = await createRepertoireNode(own.id, afterD4, "d2d4", 0.5, { displayPgn: "d4" });

    const named = await fillMissingOpeningMetadata(own.id, async fen => fen === afterD4 ? { eco: "A40", name: "Queen's Pawn Game" } : null);

    assert.equal(named, 2);
    const [filledParent, filledChild] = await Promise.all([
      prisma.repertoireNode.findUniqueOrThrow({ where: { id: parent.id } }),
      prisma.repertoireNode.findUniqueOrThrow({ where: { id: child.id } })
    ]);
    assert.deepEqual([filledParent.openingMetadataStatus, filledParent.eco, filledParent.openingName], ["PRESENT", "A40", "Queen's Pawn Game"]);
    assert.deepEqual([filledChild.openingMetadataStatus, filledChild.eco, filledChild.openingName], ["PRESENT", "A40", "Queen's Pawn Game"]);
  } finally {
    await prisma.repertoire.delete({ where: { id: own.id } });
  }
});

test("DB.06 a run stopped early leaves no node without a name", async () => {
  const own = await prisma.repertoire.create({ data: { title: "Stopped run", color: "black", userId } });
  try {
    const start = new Chess().fen();
    const amateur = {
      moves: [
        { san: "e4", uci: "e2e4", games: 60, white: 30, draws: 15, black: 15 },
        { san: "d4", uci: "d2d4", games: 40, white: 20, draws: 10, black: 10 }
      ],
      totalGames: 100, positionTotalGames: 100, unaccountedShare: 0, opening: null
    };
    const empty = { moves: [], totalGames: 0, positionTotalGames: 0, unaccountedShare: 0, opening: null };
    const responseEvaluator = async (_fen: string, chess: Chess) => {
      const move = chess.move(chess.get("e4") ? "c5" : "d5");
      chess.undo();
      return {
        selectedUci: move.lan, selectedMoveSan: move.san, cp: 10, mate: null,
        source: "Local Stockfish 19" as const, selectionMethod: "Baseline" as const, moveOrigin: "Engine Move" as const,
        engineRank: 1, baselineCp: 10, baselineMate: null
      };
    };
    let flagReads = 0;
    const log = console.log;
    console.log = () => undefined;
    try {
      // The first read is before the root; the second, after it, stops the run with both Black replies queued.
      await assert.rejects(generateRepertoire(start, {
        repertoireId: own.id,
        fetchDatabases: (async (fen: string) => fen === start ? amateur : empty) as any,
        fetchOpeningMetadata: async () => null,
        ensureNodeWikibooks: (async () => ({ status: "CACHED", text: null })) as any,
        responseEvaluator: responseEvaluator as any,
        wait: async () => undefined,
        shouldStop: () => flagReads++ > 0
      }), UserRequestedStopError);
    } finally {
      console.log = log;
    }

    const nodes = await prisma.repertoireNode.findMany({ where: { repertoireId: own.id }, select: { history: true, openingMetadataStatus: true } });
    assert.deepEqual(nodes.map(node => node.history).sort(), ["", "d2d4", "d2d4 d7d5", "e2e4", "e2e4 c7c5"]);
    assert.deepEqual(nodes.filter(node => node.openingMetadataStatus === null), []);
  } finally {
    await prisma.repertoire.delete({ where: { id: own.id } });
  }
});
