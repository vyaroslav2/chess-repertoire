import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import type { WikibooksResult } from "../api/wikibooks";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("history-specific RepertoireNode Wikibooks cache", async t => {
  const {
    createRepertoireNode,
    ensureRepertoireNodeWikibooks,
    prisma: operationsPrisma
  } = await import("../db/operations");
  const {
    attemptCanonicalNodeWikibooks,
    captureRebuildWikibooksCache,
    restoreRebuildWikibooksState
  } = await import("./generator");

  const user = await prisma.user.create({ data: { username: `wikibooks-${randomUUID()}` } });
  const repertoire = await prisma.repertoire.create({
    data: { title: "Wikibooks cache tests", color: "black", userId: user.id }
  });
  t.after(async () => {
    await prisma.user.delete({ where: { id: user.id } });
    await operationsPrisma.$disconnect();
    await prisma.$disconnect();
  });
  let sequence = 0;
  const createNode = (pgn: string) => createRepertoireNode(repertoire.id, START_FEN, pgn, 1 - sequence++ * 0.01);

  await t.test("different histories at one PositionKey keep independent state", async () => {
    const first = await createNode("Nf3");
    const second = await createNode("Nc3");
    await ensureRepertoireNodeWikibooks(first.id, async history => ({
      status: "DESCRIPTION",
      text: `Description for ${history.join(" ")}`
    }));
    const [savedFirst, savedSecond] = await Promise.all([
      prisma.repertoireNode.findUniqueOrThrow({ where: { id: first.id } }),
      prisma.repertoireNode.findUniqueOrThrow({ where: { id: second.id } })
    ]);
    assert.equal(savedFirst.positionKey, savedSecond.positionKey);
    assert.equal(savedFirst.wikibooksChecked, true);
    assert.equal(savedFirst.wikiText, "Description for Nf3");
    assert.equal(savedSecond.wikibooksChecked, false);
    assert.equal(savedSecond.wikiText, null);
  });

  await t.test("valid absence is persisted and prevents another request", async () => {
    const node = await createNode("e4");
    let fetches = 0;
    const fetcher = async (): Promise<WikibooksResult> => {
      fetches++;
      return { status: "VALID_ABSENCE" };
    };
    await ensureRepertoireNodeWikibooks(node.id, fetcher);
    await ensureRepertoireNodeWikibooks(node.id, fetcher);
    const saved = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: node.id } });
    assert.equal(fetches, 1);
    assert.equal(saved.wikibooksChecked, true);
    assert.equal(saved.wikiText, null);
  });

  await t.test("technical failure remains unchecked and retries on a later run", async () => {
    const node = await createNode("d4");
    let fetches = 0;
    const fetcher = async (): Promise<WikibooksResult> => {
      fetches++;
      return { status: "TECHNICAL_FAILURE", reason: "temporary" };
    };
    await ensureRepertoireNodeWikibooks(node.id, fetcher);
    await ensureRepertoireNodeWikibooks(node.id, fetcher);
    const saved = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: node.id } });
    assert.equal(fetches, 2);
    assert.equal(saved.wikibooksChecked, false);
    assert.equal(saved.wikiText, null);
  });

  await t.test("same-run guard attempts a failed canonical node only once", async () => {
    const node = await createNode("c4");
    const attempted = new Set<string>();
    let fetches = 0;
    const ensure = (nodeId: string) => ensureRepertoireNodeWikibooks(nodeId, async () => {
      fetches++;
      return { status: "TECHNICAL_FAILURE", reason: "temporary" };
    });
    await attemptCanonicalNodeWikibooks(node.id, attempted, ensure);
    await attemptCanonicalNodeWikibooks(node.id, attempted, ensure);
    assert.equal(fetches, 1, "a later transposing route in this run must not retry canonical X");
    const saved = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: node.id } });
    assert.equal(saved.wikibooksChecked, false);

    await attemptCanonicalNodeWikibooks(node.id, new Set<string>(), ensure);
    assert.equal(fetches, 2, "a later generator run may retry unchecked canonical X");
  });

  await t.test("later transposition cannot fetch for or overwrite described canonical node", async () => {
    const canonical = await createNode("Nf3 Nf6 Nc3");
    await ensureRepertoireNodeWikibooks(canonical.id, async () => ({ status: "DESCRIPTION", text: "Canonical history text" }));
    let truncatedRouteFetches = 0;
    await attemptCanonicalNodeWikibooks(canonical.id, new Set<string>(), nodeId =>
      ensureRepertoireNodeWikibooks(nodeId, async () => {
        truncatedRouteFetches++;
        return { status: "DESCRIPTION", text: "Wrong transposing history text" };
      })
    );
    const saved = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: canonical.id } });
    assert.equal(truncatedRouteFetches, 0);
    assert.equal(saved.pgn, "Nf3 Nf6 Nc3");
    assert.equal(saved.wikiText, "Canonical history text");
  });

  await t.test("rebuild restores checked states by exact history without preserving failures", async () => {
    const described = await createNode("g3");
    const absent = await createNode("b3");
    const failed = await createNode("f4");
    await prisma.repertoireNode.update({
      where: { id: described.id },
      data: { wikibooksChecked: true, wikiText: "History-specific description" }
    });
    await prisma.repertoireNode.update({
      where: { id: absent.id },
      data: { wikibooksChecked: true, wikiText: null }
    });

    const preserved = await captureRebuildWikibooksCache(repertoire.id);
    assert.equal(preserved.get("g3"), "History-specific description");
    assert.equal(preserved.has("b3"), true);
    assert.equal(preserved.get("b3"), null);
    assert.equal(preserved.has("f4"), false);

    await prisma.repertoireNode.deleteMany({ where: { repertoireId: repertoire.id } });
    const rebuiltDescription = await createNode("g3");
    const rebuiltAbsence = await createNode("b3");
    const rebuiltFailure = await createNode("f4");
    await restoreRebuildWikibooksState(rebuiltDescription.id, preserved);
    await restoreRebuildWikibooksState(rebuiltAbsence.id, preserved);
    await restoreRebuildWikibooksState(rebuiltFailure.id, preserved);

    let fetches = 0;
    const fetcher = async (): Promise<WikibooksResult> => {
      fetches++;
      return { status: "TECHNICAL_FAILURE", reason: "temporary" };
    };
    await ensureRepertoireNodeWikibooks(rebuiltDescription.id, fetcher);
    await ensureRepertoireNodeWikibooks(rebuiltAbsence.id, fetcher);
    await ensureRepertoireNodeWikibooks(rebuiltFailure.id, fetcher);

    const [savedDescription, savedAbsence, savedFailure] = await Promise.all([
      prisma.repertoireNode.findUniqueOrThrow({ where: { id: rebuiltDescription.id } }),
      prisma.repertoireNode.findUniqueOrThrow({ where: { id: rebuiltAbsence.id } }),
      prisma.repertoireNode.findUniqueOrThrow({ where: { id: rebuiltFailure.id } })
    ]);
    assert.equal(fetches, 1, "only the previously failed history should be fetched after rebuild");
    assert.equal(savedDescription.wikibooksChecked, true);
    assert.equal(savedDescription.wikiText, "History-specific description");
    assert.equal(savedAbsence.wikibooksChecked, true);
    assert.equal(savedAbsence.wikiText, null);
    assert.equal(savedFailure.wikibooksChecked, false);
    assert.equal(savedFailure.wikiText, null);
  });

  await t.test("an interrupted rebuild cannot erase cache entries for histories not yet recreated", async () => {
    const early = await createNode("a3");
    const late = await createNode("a3 a6 h3");
    await ensureRepertoireNodeWikibooks(early.id, async () => ({ status: "VALID_ABSENCE" }));
    await ensureRepertoireNodeWikibooks(late.id, async () => ({
      status: "DESCRIPTION",
      text: "Description reached late in the full tree"
    }));

    const firstPassCache = await captureRebuildWikibooksCache(repertoire.id);
    await prisma.repertoireNode.deleteMany({ where: { repertoireId: repertoire.id } });

    const partiallyRebuiltEarly = await createNode("a3");
    await restoreRebuildWikibooksState(partiallyRebuiltEarly.id, firstPassCache);
    // The run stops here, before the later history is recreated.

    const nextPassCache = await captureRebuildWikibooksCache(repertoire.id);
    assert.equal(nextPassCache.get("a3 a6 h3"), "Description reached late in the full tree");

    await prisma.repertoireNode.deleteMany({ where: { repertoireId: repertoire.id } });
    const rebuiltLate = await createNode("a3 a6 h3");
    await restoreRebuildWikibooksState(rebuiltLate.id, nextPassCache);
    let fetches = 0;
    await ensureRepertoireNodeWikibooks(rebuiltLate.id, async () => {
      fetches++;
      return { status: "TECHNICAL_FAILURE", reason: "must not fetch" };
    });

    const savedLate = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: rebuiltLate.id } });
    assert.equal(fetches, 0);
    assert.equal(savedLate.wikibooksChecked, true);
    assert.equal(savedLate.wikiText, "Description reached late in the full tree");
  });

});
