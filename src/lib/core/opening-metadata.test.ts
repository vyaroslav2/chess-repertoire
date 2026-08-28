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
