import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { prisma, createOpponentMove, createRepertoireNode, createResponseMove, saveLocalEngineBaseline, saveLocalEngineCandidate, saveRemoteEngineResult, validateResponsePersistence } from "../db/operations";

const FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const PROFILE = "local-test-profile";
let repertoireId: string;
let fromNodeId: string;
let toNodeId: string;

const base = (overrides: Record<string, unknown> = {}) => ({
  fromNodeId, toNodeId, uci: "g8f6", san: "Nf6", cp: -15, mate: null,
  source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Human Move",
  deepVerified: false, localEvaluationProfile: null, weightedCount: 20, ...overrides
}) as Parameters<typeof createResponseMove>[0];

before(async () => { await prisma.$connect(); });
after(async () => { await prisma.$disconnect(); });
beforeEach(async () => {
  await prisma.repertoirePositionStat.deleteMany(); await prisma.repertoireMove.deleteMany();
  await prisma.repertoireNode.deleteMany(); await prisma.localEngineCandidate.deleteMany(); await prisma.localEngineBaseline.deleteMany();
  await prisma.remoteEngineEvalCache.deleteMany(); await prisma.remoteEngineFetch.deleteMany(); await prisma.repertoire.deleteMany(); await prisma.position.deleteMany(); await prisma.user.deleteMany();
  const user = await prisma.user.create({ data: { username: `slice13-${Math.random()}` } });
  const rep = await prisma.repertoire.create({ data: { title: "Slice 13", color: "black", userId: user.id } }); repertoireId = rep.id;
  const from = await createRepertoireNode(rep.id, FEN, "e2e4", 1); fromNodeId = from.id;
  const to = await createRepertoireNode(rep.id, "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2", "e2e4 g8f6", 1); toNodeId = to.id;
});

test("Slice 13 RESPONSE validation, provenance, UCI identity and atomic replacement", async () => {
  const cpRow = await createResponseMove(base());
  assert.equal(cpRow.uci, "g8f6"); assert.equal(cpRow.cp, -15); assert.equal(cpRow.mate, null);
  assert.equal(cpRow.source, "Lichess Cloud Evaluation"); assert.equal(cpRow.selectionMethod, "Ordinary API"); assert.equal(cpRow.moveOrigin, "Human Move");
  const mateRow = await createResponseMove(base({ cp: null, mate: -3, source: "ChessDB" }));
  assert.equal(mateRow.cp, null); assert.equal(mateRow.mate, -3); assert.equal(mateRow.source, "ChessDB");
  const cpAgain = await createResponseMove(base({ cp: 8, mate: null, source: "Local Deep Stockfish" }));
  assert.equal(cpAgain.cp, 8); assert.equal(cpAgain.mate, null); assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId } }), 1);
  await assert.rejects(createResponseMove(base({ san: "Nh6" })), /SAN does not match/);
  assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId } }), 1);
  assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: cpAgain.id } })).cp, 8);
});

test("RESPONSE legal UCI with unrelated destination FullFen hard-errors without writing", async () => {
  const wrongDestination = await createRepertoireNode(
    repertoireId,
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
    "e2e4 e7e5",
    1
  );
  await assert.rejects(
    createResponseMove(base({ toNodeId: wrongDestination.id })),
    /resulting FullFen does not match/
  );
  assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId } }), 0);
});

test("OPPONENT legal UCI with unrelated destination FullFen hard-errors without writing", async () => {
  const source = await createRepertoireNode(
    repertoireId,
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "",
    1
  );
  const wrongDestination = await createRepertoireNode(
    repertoireId,
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1",
    "d2d4",
    1
  );
  await assert.rejects(
    createOpponentMove({
      repertoireId,
      fromNodeId: source.id,
      toNodeId: wrongDestination.id,
      uci: "e2e4",
      san: "e4",
      prob: 0.5,
      trueProbability: 0.5
    }),
    /resulting FullFen does not match/
  );
  assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: source.id } }), 0);
});

test("OPPONENT cross-repertoire nodes hard-error without writing", async () => {
  const source = await createRepertoireNode(
    repertoireId,
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "",
    1
  );
  const user = await prisma.user.create({ data: { username: `slice13-cross-${Math.random()}` } });
  const otherRepertoire = await prisma.repertoire.create({ data: { title: "Other", color: "black", userId: user.id } });
  const otherDestination = await createRepertoireNode(
    otherRepertoire.id,
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "e2e4",
    1
  );
  await assert.rejects(
    createOpponentMove({ repertoireId, fromNodeId: source.id, toNodeId: otherDestination.id, uci: "e2e4", san: "e4" }),
    /cannot cross repertoires/
  );
  assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: source.id } }), 0);
});

test("OPPONENT mismatched supplied repertoireId hard-errors without writing", async () => {
  const source = await createRepertoireNode(
    repertoireId,
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "",
    1
  );
  const destination = await createRepertoireNode(
    repertoireId,
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "opponent-e2e4",
    1
  );
  await assert.rejects(
    createOpponentMove({ repertoireId: "caller-supplied-wrong-id", fromNodeId: source.id, toNodeId: destination.id, uci: "e2e4", san: "e4" }),
    /repertoireId does not match/
  );
  assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: source.id } }), 0);
});

test("Slice 13 rejects every malformed evaluation and controlled value before writing", async () => {
  const bad = [
    { cp: null, mate: null }, { cp: 1, mate: 2 }, { cp: NaN, mate: null }, { cp: Infinity, mate: null },
    { cp: null, mate: 1.5 }, { cp: null, mate: 0 }, { source: "Hardcoded Opening" }, { source: undefined },
    { selectionMethod: "Guess" }, { moveOrigin: "Guess" }, { uci: "bad" }, { deepVerified: true, localEvaluationProfile: null }
  ];
  for (const override of bad) assert.throws(() => validateResponsePersistence(base(override)), /Invalid RESPONSE/);
  assert.equal(await prisma.repertoireMove.count(), 0);
});

test("Slice 13 persists valid provenance combinations including fallback and hardcoded", async () => {
  for (const state of [
    { source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Human Move" },
    { source: "ChessDB", selectionMethod: "Ordinary API", moveOrigin: "Human Move" },
    { source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Human Move" },
    { source: "Local Deep Stockfish", selectionMethod: "Local Engine Fallback", moveOrigin: "Engine Move" },
    { source: "ChessDB", selectionMethod: "Hardcoded Opening", moveOrigin: "Hardcoded Move" }
  ] as const) {
    const row = await createResponseMove(base(state));
    assert.equal(row.source, state.source); assert.equal(row.selectionMethod, state.selectionMethod); assert.equal(row.moveOrigin, state.moveOrigin);
  }
  assert.ok(!Object.keys(prisma.repertoireMove.fields).includes("selectionReason"));
});

async function seedVerifiedResponse() {
  await saveLocalEngineBaseline(FEN, PROFILE, { uci: "e7e5", cp: 0, mate: null });
  await saveLocalEngineCandidate(FEN, "g8f6", PROFILE, { uci: "g8f6", cp: 10, mate: null });
  return createResponseMove(base({ source: "Local Deep Stockfish", deepVerified: true, localEvaluationProfile: PROFILE }));
}

test("Slice 13 links verification to real Local evidence and invalidates material baseline changes only", async () => {
  await assert.rejects(createResponseMove(base({ deepVerified: true, localEvaluationProfile: PROFILE })), /evidence is missing/);
  await seedVerifiedResponse();
  await saveLocalEngineBaseline(FEN, PROFILE, { uci: "e7e5", cp: 0, mate: null });
  assert.equal((await prisma.repertoireMove.findFirstOrThrow({ where: { fromNodeId } })).deepVerified, true);
  await saveLocalEngineBaseline(FEN, PROFILE, { uci: "e7e5", cp: -1, mate: null });
  assert.equal((await prisma.repertoireMove.findFirstOrThrow({ where: { fromNodeId } })).deepVerified, false);
});

test("Slice 13 candidate invalidation is exact by FullFen, UCI and profile", async () => {
  await seedVerifiedResponse();
  await saveLocalEngineCandidate(FEN, "g8f6", PROFILE, { uci: "g8f6", cp: 10, mate: null });
  assert.equal((await prisma.repertoireMove.findFirstOrThrow({ where: { fromNodeId } })).deepVerified, true);
  await saveLocalEngineCandidate(FEN, "b8c6", PROFILE, { uci: "b8c6", cp: 99, mate: null });
  assert.equal((await prisma.repertoireMove.findFirstOrThrow({ where: { fromNodeId } })).deepVerified, true);
  await saveLocalEngineCandidate(FEN, "g8f6", "another-profile", { uci: "g8f6", cp: 99, mate: null });
  assert.equal((await prisma.repertoireMove.findFirstOrThrow({ where: { fromNodeId } })).deepVerified, true);
  await saveLocalEngineCandidate(FEN, "g8f6", PROFILE, { uci: "g8f6", cp: 11, mate: null });
  assert.equal((await prisma.repertoireMove.findFirstOrThrow({ where: { fromNodeId } })).deepVerified, false);
});

test("Slice 13 remote refresh cannot invalidate Local verification", async () => {
  await seedVerifiedResponse();
  await saveRemoteEngineResult(FEN, "LICHESS", "remote-profile", [{ uci: "g8f6", cp: 1, mate: null }]);
  await saveRemoteEngineResult(FEN, "CHESSDB", "remote-profile", [{ uci: "g8f6", cp: 2, mate: null }]);
  assert.equal((await prisma.repertoireMove.findFirstOrThrow({ where: { fromNodeId } })).deepVerified, true);
});
