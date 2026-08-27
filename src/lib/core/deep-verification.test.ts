import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Chess } from "chess.js";
import { computeExplorerRequestProfile, defaultConfig } from "./config";
import { responseMoveNumber, runDeepVerification } from "./deep-verification";
import type { LocalCandidateVerification } from "./local-engine";
import {
  createHumanDataSnapshot, createRepertoireNode, createResponseMove, getOrCreatePosition,
  markResponseDeepVerified, prisma, saveHumanExplorerBucket, saveLocalEngineBaseline, saveLocalEngineCandidate
} from "../db/operations";

const boardFen = (fullmove: number) => `rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 ${fullmove}`;
let userId: string;
let repertoireId: string;

async function addResponse(repId: string, fullmove: number, suffix: string, overrides: Record<string, unknown> = {}) {
  const fen = boardFen(fullmove);
  const chess = new Chess(fen);
  const played = chess.move({ from: "g8", to: "f6" })!;
  const from = await createRepertoireNode(repId, fen, `${suffix}-from`, 1);
  const to = await createRepertoireNode(repId, chess.fen(), `${suffix}-to`, 1);
  return createResponseMove({
    fromNodeId: from.id, toNodeId: to.id, uci: played.lan, san: played.san,
    cp: -20, mate: null, source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API",
    moveOrigin: "Human Move", deepVerified: false, localEvaluationProfile: null, ...overrides
  } as Parameters<typeof createResponseMove>[0]);
}

function local(decision: "ACCEPT" | "REJECT", candidateUci: string, baselineUci = "e7e5", profile = "current-profile"): LocalCandidateVerification {
  return {
    decision, evaluationProfile: profile, candidateWasBaselineBest: candidateUci === baselineUci,
    baseline: { uci: baselineUci, san: "e5", cp: -100, mate: null },
    candidate: candidateUci === baselineUci
      ? { uci: candidateUci, san: "e5", cp: -100, mate: null }
      : { uci: candidateUci, san: "Nf6", cp: -30, mate: null }
  };
}

before(async () => prisma.$connect());
after(async () => prisma.$disconnect());
beforeEach(async () => {
  await prisma.repertoirePositionStat.deleteMany(); await prisma.repertoireMove.deleteMany(); await prisma.repertoireNode.deleteMany();
  await prisma.localEngineCandidate.deleteMany(); await prisma.localEngineBaseline.deleteMany(); await prisma.explorerMoveCache.deleteMany();
  await prisma.humanExplorerFetch.deleteMany(); await prisma.humanDataSnapshot.deleteMany(); await prisma.repertoire.deleteMany(); await prisma.position.deleteMany(); await prisma.user.deleteMany();
  const user = await prisma.user.create({ data: { username: `dv-${Math.random()}` } }); userId = user.id;
  repertoireId = (await prisma.repertoire.create({ data: { title: "DV", color: "black", userId } })).id;
});

test("DV is repertoire-scoped, skips verified rows, and orders root-outwards deterministically", async () => {
  const other = (await prisma.repertoire.create({ data: { title: "Other", color: "black", userId } })).id;
  const deep = await addResponse(repertoireId, 9, "z-deep");
  const tieB = await addResponse(repertoireId, 4, "b-tie");
  const tieA = await addResponse(repertoireId, 4, "a-tie");
  const verified = await addResponse(repertoireId, 2, "verified", { source: "Local Deep Stockfish" });
  await prisma.repertoireMove.update({ where: { id: verified.id }, data: { deepVerified: true, localEvaluationProfile: "old" } });
  const otherMove = await addResponse(other, 1, "other");
  const seen: string[] = [];
  const marked: string[] = [];
  const result = await runDeepVerification(repertoireId, {
    verifyLocal: async (_fen, uci) => { seen.push(uci + ":" + seen.length); return local("ACCEPT", uci); },
    markPass: async input => { marked.push(input.responseId); return prisma.repertoireMove.findUniqueOrThrow({ where: { id: input.responseId } }); }
  });
  assert.deepEqual(result, { status: "COMPLETE", verifiedCount: 3 });
  assert.equal(seen.length, 3);
  const expectedOrder = (await prisma.repertoireMove.findMany({ where: { id: { in: [tieA.id, tieB.id, deep.id] } }, include: { fromNode: true } }))
    .sort((a, b) => responseMoveNumber(a.fromNode.fullFen) - responseMoveNumber(b.fromNode.fullFen) || a.fromNode.pgn.localeCompare(b.fromNode.pgn))
    .map(row => row.id);
  assert.deepEqual(expectedOrder, [tieA.id, tieB.id, deep.id]);
  assert.deepEqual(marked, expectedOrder);
  assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: otherMove.id } })).deepVerified, false);
});

test("move-number bands use stored FullFen boundaries 4/5 and 8/9", () => {
  assert.equal(responseMoveNumber(boardFen(4)), 4); assert.equal(responseMoveNumber(boardFen(5)), 5);
  assert.equal(responseMoveNumber(boardFen(8)), 8); assert.equal(responseMoveNumber(boardFen(9)), 9);
});

test("DV PASS conditionally marks profile while preserving selected evaluation and provenance", async () => {
  const response = await addResponse(repertoireId, 4, "pass", { cp: -20, source: "ChessDB", selectionMethod: "Hardcoded Opening", moveOrigin: "Hardcoded Move" });
  const from = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: response.fromNodeId } });
  await saveLocalEngineBaseline(from.fullFen, "current-profile", { uci: "e7e5", cp: -100, mate: null });
  await saveLocalEngineCandidate(from.fullFen, response.uci!, "current-profile", { uci: response.uci!, cp: -30, mate: null });
  const result = await runDeepVerification(repertoireId, { verifyLocal: async () => local("ACCEPT", response.uci!) });
  assert.deepEqual(result, { status: "COMPLETE", verifiedCount: 1 });
  const after = await prisma.repertoireMove.findUniqueOrThrow({ where: { id: response.id } });
  assert.equal(after.deepVerified, true); assert.equal(after.localEvaluationProfile, "current-profile");
  assert.equal(after.cp, -20); assert.equal(after.source, "ChessDB");
  assert.equal(after.selectionMethod, "Hardcoded Opening"); assert.equal(after.moveOrigin, "Hardcoded Move");
});

test("DV pass persistence rejects a changed RESPONSE race", async () => {
  const response = await addResponse(repertoireId, 4, "race");
  const from = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: response.fromNodeId } });
  await saveLocalEngineBaseline(from.fullFen, "current-profile", { uci: "e7e5", cp: -100, mate: null });
  await assert.rejects(markResponseDeepVerified({
    responseId: response.id, expectedUci: "e7e6", expectedFullFen: from.fullFen, localEvaluationProfile: "current-profile",
    expectedBaseline: { uci: "e7e5", cp: -100, mate: null }, expectedCandidate: { uci: "e7e6", cp: -30, mate: null }
  }), /changed after verification/);
  assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: response.id } })).deepVerified, false);
});

async function seedSnapshot(positionKey: string, withHumanMove: boolean) {
  const snapshot = await createHumanDataSnapshot(repertoireId, computeExplorerRequestProfile(defaultConfig));
  await getOrCreatePosition(boardFen(4));
  await saveHumanExplorerBucket(snapshot.id, positionKey, "MASTERS", withHumanMove ? [{ uci: "e7e5", san: "e5", games: 3, whiteWins: 1, draws: 1, blackWins: 1 }] : []);
  await saveHumanExplorerBucket(snapshot.id, positionKey, "ELITE", []);
  return snapshot;
}

test("first REJECT stops descendants and returns cached B1 Human proposal without mutation", async () => {
  const failed = await addResponse(repertoireId, 4, "fail");
  const deeper = await addResponse(repertoireId, 5, "deeper");
  const from = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: failed.fromNodeId } });
  const snapshot = await seedSnapshot(from.positionKey, true);
  const calls: string[] = [];
  const result = await runDeepVerification(repertoireId, {
    verifyLocal: async (fen, uci, tolerance) => {
      calls.push(`${fen}|${uci}|${tolerance}`);
      return uci === failed.uci ? local("REJECT", uci) : local("ACCEPT", uci);
    }
  });
  assert.equal(result.status, "FAILED_RESPONSE");
  if (result.status === "FAILED_RESPONSE") {
    assert.equal(result.failed.responseId, failed.id); assert.equal(result.proposal.uci, "e7e5");
    assert.equal(result.proposal.moveOrigin, "Human Move"); assert.equal(result.proposal.selectionMethod, "Corrected after Deep Verification");
  }
  assert.equal(calls.length, 2); assert.match(calls[0], new RegExp(`^${from.fullFen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\|${failed.uci}\\|95$`));
  assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: failed.id } })).deepVerified, false);
  assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: deeper.id } })).deepVerified, false);
  assert.equal(await prisma.humanDataSnapshot.count({ where: { repertoireId } }), 1); assert.ok(snapshot);
});

test("empty cached HCM shortlist proposes exact Local baseline and writes no replacement", async () => {
  const failed = await addResponse(repertoireId, 4, "engine-fail");
  const from = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: failed.fromNodeId } });
  await seedSnapshot(from.positionKey, false);
  const result = await runDeepVerification(repertoireId, { verifyLocal: async (_fen, uci) => local("REJECT", uci) });
  assert.equal(result.status, "FAILED_RESPONSE");
  if (result.status === "FAILED_RESPONSE") {
    assert.equal(result.proposal.uci, "e7e5"); assert.equal(result.proposal.cp, -100);
    assert.equal(result.proposal.moveOrigin, "Engine Move"); assert.equal(result.proposal.source, "Local Deep Stockfish");
  }
  assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: failed.fromNodeId } }), 1);
});
