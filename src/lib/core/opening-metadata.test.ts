import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Chess } from "chess.js";
import { createRepertoireNode, prisma } from "../db/operations";
import { captureRebuildOpeningMetadataCache, restoreRebuildOpeningMetadataState } from "./generator";

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

test("opening metadata and valid absence survive rebuild only for the same exact history", async () => {
  const root = await createRepertoireNode(repertoireId, new Chess().fen(), "", 1, {
    displayPgn: "",
    openingMetadataStatus: "VALID_ABSENCE",
    openingMetadataSource: "LICHESS_MASTERS"
  });
  const chess = new Chess();
  chess.move("e4"); chess.move("c6");
  await createRepertoireNode(repertoireId, chess.fen(), "e2e4 c7c6", 0.64, {
    displayPgn: "e4 c6",
    eco: "B10",
    openingName: "Caro-Kann Defense",
    openingMetadataStatus: "PRESENT",
    openingMetadataSource: "LICHESS_MASTERS"
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
  assert.equal(restoredRoot.openingMetadataSource, "LICHESS_MASTERS");
  assert.equal(restoredLine.eco, "B10");
  assert.equal(restoredLine.openingName, "Caro-Kann Defense");
  assert.equal(restoredLine.openingMetadataSource, "LICHESS_MASTERS");
  assert.equal(untouched.openingMetadataStatus, null);
});

test("opening values cannot be stored without checked state and source", async () => {
  await assert.rejects(
    createRepertoireNode(repertoireId, new Chess().fen(), "invalid-opening", 1, {
      eco: "A00",
      openingName: "Invalid"
    }),
    /requires source LICHESS_MASTERS/
  );
});

test("an interrupted rebuild cannot erase opening metadata for a later exact history", async () => {
  const chess = new Chess();
  chess.move("d4"); chess.move("d5");
  await createRepertoireNode(repertoireId, chess.fen(), "d2d4 d7d5", 0.2, {
    displayPgn: "d4 d5",
    eco: "D00",
    openingName: "Queen's Pawn Game",
    openingMetadataStatus: "PRESENT",
    openingMetadataSource: "LICHESS_MASTERS"
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
  assert.equal(restored.openingMetadataSource, "LICHESS_MASTERS");
});

test("a cached false absence inherits the latest named parent history", async () => {
  const chess = new Chess();
  chess.move("e4"); chess.move("c6"); chess.move("Bc4");
  await createRepertoireNode(repertoireId, chess.fen(), "e2e4 c7c6 f1c4", 0.1, {
    displayPgn: "e4 c6 Bc4",
    eco: "B10",
    openingName: "Caro-Kann Defense: Hillbilly Attack",
    openingMetadataStatus: "PRESENT",
    openingMetadataSource: "LICHESS_MASTERS"
  });
  chess.move("d5");
  await createRepertoireNode(repertoireId, chess.fen(), "e2e4 c7c6 f1c4 d7d5", 0.1, {
    displayPgn: "e4 c6 Bc4 d5",
    openingMetadataStatus: "VALID_ABSENCE",
    openingMetadataSource: "LICHESS_MASTERS"
  });

  const cache = await captureRebuildOpeningMetadataCache(repertoireId);
  const child = cache.get("e2e4 c7c6 f1c4 d7d5");
  assert.equal(child?.status, "PRESENT");
  assert.equal(child?.eco, "B10");
  assert.equal(child?.openingName, "Caro-Kann Defense: Hillbilly Attack");
});
