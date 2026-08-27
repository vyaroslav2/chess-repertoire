import assert from "node:assert/strict";
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
  const { attemptCanonicalNodeWikibooks } = await import("./generator");

  await prisma.repertoirePositionStat.deleteMany();
  await prisma.repertoireMove.deleteMany();
  await prisma.repertoireNode.deleteMany();
  await prisma.humanDataSnapshot.deleteMany();
  await prisma.repertoire.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({ data: { username: `wikibooks-${Date.now()}` } });
  const repertoire = await prisma.repertoire.create({
    data: { title: "Wikibooks cache tests", color: "black", userId: user.id }
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

  await operationsPrisma.$disconnect();
  await prisma.$disconnect();
});
