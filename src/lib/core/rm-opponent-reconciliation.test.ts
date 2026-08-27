import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Chess } from "chess.js";
import {
  createOpponentMove,
  createRepertoireNode,
  createResponseMove,
  prisma
} from "../db/operations";
import { parseFullFen, positionKeyFromFen } from "./fen";
import {
  canonicalizeOpponentCandidates,
  readExpectedOpponentEdges,
  reconcileOpponentBranches,
  type CanonicalOpponentCandidate,
  type ExpectedOpponentSource
} from "./rm-opponent-reconciliation";
import {
  generateRepertoire,
  removeDeletedCanonicalQueueWork,
  type GeneratorQueueItem,
  type PendingCanonicalContinuations
} from "./generator";

describe("Slice 17 OPPONENT set reconciliation", () => {
  const initialFullFen = new Chess().fen();
  let userId: string;
  let repertoireId: string;
  let sequence = 0;

  beforeEach(async () => {
    sequence++;
    const user = await prisma.user.create({
      data: { username: `slice17_${Date.now()}_${sequence}` }
    });
    userId = user.id;
    const repertoire = await prisma.repertoire.create({
      data: { title: "Slice 17", color: "black", userId }
    });
    repertoireId = repertoire.id;
  });

  afterEach(async () => {
    await prisma.repertoire.deleteMany({ where: { id: repertoireId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  async function createNode(fullFen: string, pgn: string, cumulativeProb = 1) {
    return createRepertoireNode(repertoireId, fullFen, pgn, cumulativeProb);
  }

  function expectedSource(node: {
    id: string;
    repertoireId: string;
    fullFen: string;
    positionKey: string;
    pgn: string;
    cumulativeProb: number;
  }): ExpectedOpponentSource {
    return {
      id: node.id,
      repertoireId: node.repertoireId,
      fullFen: node.fullFen,
      positionKey: node.positionKey,
      pgn: node.pgn,
      cumulativeProb: node.cumulativeProb
    };
  }

  function candidates(source: ExpectedOpponentSource, rows: Array<{ san: string; probability: number; uci?: string }>) {
    return canonicalizeOpponentCandidates({
      sourceFullFen: source.fullFen,
      sourcePgn: source.pgn,
      sourceCumulativeProb: source.cumulativeProb,
      candidates: rows
    });
  }

  async function createOpponentBranch(input: {
    source: Awaited<ReturnType<typeof createNode>>;
    san: string;
    probability: number;
    destinationPgn?: string;
    destinationCumulativeProb?: number;
  }) {
    const [candidate] = candidates(expectedSource(input.source), [{ san: input.san, probability: input.probability }]);
    const destination = await createNode(
      candidate.destinationFullFen,
      input.destinationPgn ?? candidate.destinationPgn,
      input.destinationCumulativeProb ?? candidate.trueProbability
    );
    const edge = await createOpponentMove({
      repertoireId,
      fromNodeId: input.source.id,
      toNodeId: destination.id,
      uci: candidate.uci,
      san: candidate.san,
      prob: candidate.prob,
      trueProbability: candidate.trueProbability
    });
    return { candidate, destination, edge };
  }

  async function reconcile(source: Awaited<ReturnType<typeof createNode>>, current: CanonicalOpponentCandidate[]) {
    return reconcileOpponentBranches({
      repertoireId,
      expectedSource: expectedSource(source),
      expectedStoredEdges: await readExpectedOpponentEdges(source.id),
      recomputedCandidates: current
    });
  }

  async function attachResponse(source: Awaited<ReturnType<typeof createNode>>, uci: string, cp = -10, reps = 0) {
    const chess = new Chess(source.fullFen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    assert.ok(move);
    const destination = await createNode(chess.fen(), `${source.pgn} ${move.san}`.trim(), source.cumulativeProb);
    const response = await createResponseMove({
      fromNodeId: source.id,
      toNodeId: destination.id,
      uci,
      san: move.san,
      cp,
      mate: null,
      source: "Lichess Cloud Evaluation",
      selectionMethod: "Ordinary API",
      moveOrigin: "Human Move",
      deepVerified: false,
      localEvaluationProfile: null,
      weightedCount: 10
    });
    const stat = await prisma.repertoirePositionStat.create({
      data: { repertoireId, nodeId: source.id, targetMoveId: response.id, reps, lapses: reps > 0 ? 1 : 0 }
    });
    return { response, destination, stat };
  }

  it("retains exact-set edge identity/destination/subtree and refreshes both probability fields", async () => {
    const source = await createNode(initialFullFen, "", 0.5);
    const e4 = await createOpponentBranch({ source, san: "e4", probability: 0.4 });
    const response = await attachResponse(e4.destination, "c7c5", -20, 4);
    const current = candidates(expectedSource(source), [{ san: "e4", probability: 0.6 }]);

    const result = await reconcile(source, current);
    assert.deepEqual(result.retainedUcis, ["e2e4"]);
    assert.deepEqual(result.addedUcis, []);
    assert.deepEqual(result.removedUcis, []);
    const stored = await prisma.repertoireMove.findUniqueOrThrow({ where: { id: e4.edge.id } });
    assert.equal(stored.id, e4.edge.id);
    assert.equal(stored.toNodeId, e4.destination.id);
    assert.equal(stored.prob, 0.6);
    assert.equal(stored.trueProbability, 0.3);
    assert.ok(await prisma.repertoireMove.findUnique({ where: { id: response.response.id } }));
    assert.ok(await prisma.repertoireNode.findUnique({ where: { id: response.destination.id } }));
    assert.equal((await prisma.repertoirePositionStat.findUniqueOrThrow({ where: { id: response.stat.id } })).reps, 4);
  });

  it("adds an ordinary UCI branch with exact FullFen/PositionKey and adds a transposition without overwriting canonical history", async () => {
    const source = await createNode(initialFullFen, "", 1);
    const [e4, d4] = candidates(expectedSource(source), [
      { san: "e4", probability: 0.4 },
      { san: "d4", probability: 0.3 }
    ]);
    const externalD4 = await createNode(d4.destinationFullFen, "external canonical d4", 0.1);

    const result = await reconcile(source, [e4, d4]);
    assert.deepEqual(result.addedUcis, ["d2d4", "e2e4"]);
    const e4Branch = result.branches.find(branch => branch.uci === "e2e4")!;
    const e4Node = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: e4Branch.destinationNodeId } });
    assert.equal(e4Node.fullFen, e4.destinationFullFen);
    assert.equal(e4Node.positionKey, e4.destinationPositionKey);
    assert.equal(e4Node.pgn, "e4");
    const d4Branch = result.branches.find(branch => branch.uci === "d2d4")!;
    assert.equal(d4Branch.destinationNodeId, externalD4.id);
    assert.equal(d4Branch.isTransposition, true);
    assert.equal((await prisma.repertoireNode.findUniqueOrThrow({ where: { id: externalD4.id } })).pgn, "external canonical d4");
  });

  it("removes an owned obsolete branch and descendants without collateral damage to a retained sibling", async () => {
    const source = await createNode(initialFullFen, "", 1);
    const retained = await createOpponentBranch({ source, san: "e4", probability: 0.4 });
    const obsolete = await createOpponentBranch({ source, san: "d4", probability: 0.3 });
    const retainedResponse = await attachResponse(retained.destination, "c7c5");
    const obsoleteResponse = await attachResponse(obsolete.destination, "d7d5");

    const result = await reconcile(source, candidates(expectedSource(source), [{ san: "e4", probability: 0.45 }]));
    assert.deepEqual(result.removedUcis, ["d2d4"]);
    assert.equal(await prisma.repertoireMove.findUnique({ where: { id: obsolete.edge.id } }), null);
    assert.equal(await prisma.repertoireNode.findUnique({ where: { id: obsolete.destination.id } }), null);
    assert.equal(await prisma.repertoireNode.findUnique({ where: { id: obsoleteResponse.destination.id } }), null);
    assert.ok(await prisma.repertoireMove.findUnique({ where: { id: retained.edge.id } }));
    assert.ok(await prisma.repertoireNode.findUnique({ where: { id: retained.destination.id } }));
    assert.ok(await prisma.repertoireMove.findUnique({ where: { id: retainedResponse.response.id } }));
  });

  it("removes only an obsolete incoming transposition edge and preserves the external canonical target", async () => {
    const source = await createNode(initialFullFen, "", 1);
    const obsolete = await createOpponentBranch({
      source,
      san: "e4",
      probability: 0.4,
      destinationPgn: "external owner e4"
    });
    const continuation = await attachResponse(obsolete.destination, "c7c5");

    await reconcile(source, []);
    assert.equal(await prisma.repertoireMove.findUnique({ where: { id: obsolete.edge.id } }), null);
    assert.ok(await prisma.repertoireNode.findUnique({ where: { id: obsolete.destination.id } }));
    assert.ok(await prisma.repertoireMove.findUnique({ where: { id: continuation.response.id } }));
  });

  it("deleting a canonical owner removes the target, continuation, and incoming transposition without promotion", async () => {
    const play = (history: string[]) => {
      const chess = new Chess();
      for (const san of history) chess.move(san);
      return chess;
    };
    const ownerParentHistory = ["Nf3", "Nf6", "g3", "g6", "Bg2", "Bg7"];
    const incomingParentHistory = ["g3", "g6", "Bg2", "Bg7", "Nf3", "Nf6"];
    const ownerParent = await createNode(play(ownerParentHistory).fen(), ownerParentHistory.join(" "), 0.4);
    const incomingParent = await createNode(play(incomingParentHistory).fen(), incomingParentHistory.join(" "), 0.2);
    const owner = await createOpponentBranch({ source: ownerParent, san: "d4", probability: 0.5 });
    const incomingCandidate = candidates(expectedSource(incomingParent), [{ san: "d4", probability: 0.5 }])[0];
    assert.equal(incomingCandidate.destinationFullFen, owner.destination.fullFen);
    const incomingEdge = await createOpponentMove({
      repertoireId,
      fromNodeId: incomingParent.id,
      toNodeId: owner.destination.id,
      uci: incomingCandidate.uci,
      san: incomingCandidate.san,
      prob: incomingCandidate.prob,
      trueProbability: incomingCandidate.trueProbability
    });
    const continuation = await attachResponse(owner.destination, "c7c5");

    await reconcile(ownerParent, []);
    assert.equal(await prisma.repertoireNode.findUnique({ where: { id: owner.destination.id } }), null);
    assert.equal(await prisma.repertoireMove.findUnique({ where: { id: continuation.response.id } }), null);
    assert.equal(await prisma.repertoireMove.findUnique({ where: { id: incomingEdge.id } }), null);
    assert.ok(await prisma.repertoireNode.findUnique({ where: { id: incomingParent.id } }));
  });

  it("an empty current set removes multiple owned siblings deterministically", async () => {
    const source = await createNode(initialFullFen, "", 1);
    const e4 = await createOpponentBranch({ source, san: "e4", probability: 0.4 });
    const d4 = await createOpponentBranch({ source, san: "d4", probability: 0.3 });
    const result = await reconcile(source, []);
    assert.deepEqual(result.removedUcis, ["d2d4", "e2e4"]);
    assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: source.id, playerTurn: "OPPONENT" } }), 0);
    assert.equal(await prisma.repertoireNode.findUnique({ where: { id: e4.destination.id } }), null);
    assert.equal(await prisma.repertoireNode.findUnique({ where: { id: d4.destination.id } }), null);
  });

  it("removes already-pending queue work owned by a deleted obsolete branch without duplicates", async () => {
    const source = await createNode(initialFullFen, "", 1);
    const obsolete = await createOpponentBranch({ source, san: "e4", probability: 0.4 });
    const continuation = await attachResponse(obsolete.destination, "c7c5");
    const queueItem: GeneratorQueueItem = {
      nodeId: continuation.destination.id,
      fen: continuation.destination.fullFen,
      currentMoveNumber: 2,
      cumulativeProb: 0.4,
      history: continuation.destination.pgn.split(" "),
      responseSourceNodeId: obsolete.destination.id
    };
    const queue = [queueItem];
    const pending: PendingCanonicalContinuations = new Map([[obsolete.destination.id, queueItem]]);
    const result = await reconcile(source, []);
    assert.ok(result.removedNodeIds.includes(obsolete.destination.id));
    assert.ok(result.removedNodeIds.includes(continuation.destination.id));
    assert.equal(removeDeletedCanonicalQueueWork({
      queue,
      pendingByResponseSource: pending,
      deletedNodeIds: result.removedNodeIds
    }), 1);
    assert.equal(queue.length, 0);
    assert.equal(pending.size, 0);
  });

  it("hard-errors duplicate/illegal current candidates and malformed stored edges before mutation", async () => {
    const source = await createNode(initialFullFen, "", 1);
    assert.throws(() => candidates(expectedSource(source), [
      { san: "e4", probability: 0.4 },
      { san: "e4", probability: 0.3 }
    ]), /Duplicate current OPPONENT UCI/);
    assert.throws(() => candidates(expectedSource(source), [{ san: "Ke9", probability: 0.2 }]), /Illegal OPPONENT candidate/);

    const e4 = await createOpponentBranch({ source, san: "e4", probability: 0.4 });
    await prisma.repertoireMove.update({ where: { id: e4.edge.id }, data: { prob: null } });
    const expected = await readExpectedOpponentEdges(source.id);
    await assert.rejects(reconcileOpponentBranches({
      repertoireId,
      expectedSource: expectedSource(source),
      expectedStoredEdges: expected,
      recomputedCandidates: []
    }), /Invalid OPPONENT stored prob/);
    assert.ok(await prisma.repertoireMove.findUnique({ where: { id: e4.edge.id } }));
    assert.ok(await prisma.repertoireNode.findUnique({ where: { id: e4.destination.id } }));
  });

  it("detects deleted, changed, and unexpected expected-set races with zero partial mutation", async () => {
    const source = await createNode(initialFullFen, "", 1);
    const e4 = await createOpponentBranch({ source, san: "e4", probability: 0.4 });
    const d4 = await createOpponentBranch({ source, san: "d4", probability: 0.3 });
    const expected = await readExpectedOpponentEdges(source.id);
    const current = candidates(expectedSource(source), [{ san: "e4", probability: 0.6 }]);

    await prisma.repertoireMove.update({ where: { id: d4.edge.id }, data: { uci: "c2c4" } });
    await assert.rejects(reconcileOpponentBranches({
      repertoireId, expectedSource: expectedSource(source), expectedStoredEdges: expected, recomputedCandidates: current
    }), /edge .* changed/);
    assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: e4.edge.id } })).prob, 0.4);
    assert.ok(await prisma.repertoireNode.findUnique({ where: { id: d4.destination.id } }));

    await prisma.repertoireMove.update({ where: { id: d4.edge.id }, data: { uci: "d2d4" } });
    await prisma.repertoireMove.delete({ where: { id: d4.edge.id } });
    await assert.rejects(reconcileOpponentBranches({
      repertoireId, expectedSource: expectedSource(source), expectedStoredEdges: expected, recomputedCandidates: current
    }), /edge count changed/);
    assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: e4.edge.id } })).prob, 0.4);
  });

  it("detects destination, extra-edge, source-FullFen, and ownership races", async () => {
    const source = await createNode(initialFullFen, "", 1);
    const e4 = await createOpponentBranch({ source, san: "e4", probability: 0.4 });
    const expected = await readExpectedOpponentEdges(source.id);
    const current = candidates(expectedSource(source), [{ san: "e4", probability: 0.5 }]);
    const d4Candidate = candidates(expectedSource(source), [{ san: "d4", probability: 0.3 }])[0];
    const d4Node = await createNode(d4Candidate.destinationFullFen, d4Candidate.destinationPgn, 0.3);

    await prisma.repertoireMove.update({ where: { id: e4.edge.id }, data: { toNodeId: d4Node.id } });
    await assert.rejects(reconcileOpponentBranches({
      repertoireId, expectedSource: expectedSource(source), expectedStoredEdges: expected, recomputedCandidates: current
    }), /edge .* changed/);
    await prisma.repertoireMove.update({ where: { id: e4.edge.id }, data: { toNodeId: e4.destination.id } });

    const extra = await createOpponentMove({
      repertoireId, fromNodeId: source.id, toNodeId: d4Node.id, uci: "d2d4", san: "d4", prob: 0.3, trueProbability: 0.3
    });
    await assert.rejects(reconcileOpponentBranches({
      repertoireId, expectedSource: expectedSource(source), expectedStoredEdges: expected, recomputedCandidates: current
    }), /edge count changed/);
    await prisma.repertoireMove.delete({ where: { id: extra.id } });

    const changedChess = new Chess();
    changedChess.move("c4");
    const changedFen = parseFullFen(changedChess.fen());
    const changedKey = positionKeyFromFen(changedFen);
    await prisma.position.upsert({ where: { positionKey: changedKey }, update: {}, create: { positionKey: changedKey } });
    await prisma.repertoireNode.update({ where: { id: source.id }, data: { fullFen: changedFen, positionKey: changedKey } });
    await assert.rejects(reconcileOpponentBranches({
      repertoireId, expectedSource: expectedSource(source), expectedStoredEdges: expected, recomputedCandidates: current
    }), /canonical state changed/);
    assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: e4.edge.id } })).prob, 0.4);
  });

  it("rejects cross-repertoire stored ownership before any sibling update", async () => {
    const source = await createNode(initialFullFen, "", 1);
    const e4 = await createOpponentBranch({ source, san: "e4", probability: 0.4 });
    const d4 = await createOpponentBranch({ source, san: "d4", probability: 0.3 });
    const expected = await readExpectedOpponentEdges(source.id);
    const other = await prisma.repertoire.create({ data: { title: "foreign", color: "black", userId } });
    await prisma.repertoireMove.update({ where: { id: d4.edge.id }, data: { repertoireId: other.id } });
    await assert.rejects(reconcileOpponentBranches({
      repertoireId,
      expectedSource: expectedSource(source),
      expectedStoredEdges: expected,
      recomputedCandidates: candidates(expectedSource(source), [{ san: "e4", probability: 0.6 }])
    }), /edge .* changed/);
    assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: e4.edge.id } })).prob, 0.4);
    assert.ok(await prisma.repertoireNode.findUnique({ where: { id: d4.destination.id } }));
  });

  it("ordinary generator rerun reconciles retained/removed/added/transposed branches and RESPONSE/SRS identity", async () => {
    const root = await createNode(initialFullFen, "", 1);
    const e4 = await createOpponentBranch({ source: root, san: "e4", probability: 0.35 });
    const d4 = await createOpponentBranch({ source: root, san: "d4", probability: 0.25 });
    const nf3 = await createOpponentBranch({ source: root, san: "Nf3", probability: 0.2 });
    const e4Response = await attachResponse(e4.destination, "c7c5", -20, 7);
    const d4Response = await attachResponse(d4.destination, "d7d5", -15, 2);
    const nf3Response = await attachResponse(nf3.destination, "d7d5", -8, 5);

    const c4Candidate = candidates(expectedSource(root), [{ san: "c4", probability: 0.2 }])[0];
    const c4Canonical = await createNode(c4Candidate.destinationFullFen, "external canonical c4", 0.1);
    const c4Response = await attachResponse(c4Canonical, "e7e5", -5, 3);

    const evaluatorCalls = new Map<string, number>();
    const evaluatorHistories = new Map<string, string[]>();
    const responseEvaluator = async (fen: string, chess: Chess, _moveNumber: number, history: string[]) => {
      evaluatorCalls.set(fen, (evaluatorCalls.get(fen) ?? 0) + 1);
      evaluatorHistories.set(fen, [...history]);
      let uci: string;
      let cp: number;
      if (fen === e4.destination.fullFen) { uci = "c7c5"; cp = -12; }
      else if (fen === nf3.destination.fullFen) { uci = "g8f6"; cp = -4; }
      else if (fen === c4Canonical.fullFen) { uci = "e7e5"; cp = -6; }
      else throw new Error(`Unexpected evaluator FEN ${fen}`);
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
      assert.ok(move);
      chess.undo();
      return {
        selectedUci: uci,
        selectedMoveSan: move.san,
        cp,
        mate: null,
        source: "ChessDB" as const,
        selectionMethod: "Ordinary API" as const,
        moveOrigin: "Human Move" as const,
        deepVerified: false,
        localEvaluationProfile: null,
        selectedStats: { weightedGames: 30, blackScore: 0.5 },
        candidateMoves: [],
        enginePvs: [],
        evalSource: "ChessDB" as const,
        selectedEngineCp: cp,
        selectedMate: null
      };
    };
    const humanRows = [
      { san: "e4", uci: "e2e4", games: 40, white: 20, draws: 10, black: 10 },
      { san: "Nf3", uci: "g1f3", games: 30, white: 15, draws: 8, black: 7 },
      { san: "c4", uci: "c2c4", games: 20, white: 10, draws: 5, black: 5 }
    ];

    const summary = await generateRepertoire(initialFullFen, 1, {
      repertoireId,
      fetchDatabases: (async () => [
        { moves: [], totalGames: 0, opening: undefined },
        { moves: [], totalGames: 0 },
        { moves: humanRows, totalGames: 100 }
      ]) as any,
      responseEvaluator: responseEvaluator as any,
      ensurePositionCache: (async () => ({})) as any,
      ensureNodeWikibooks: (async () => ({ status: "CACHED", text: null })) as any,
      wait: async () => undefined
    });

    const rootEdges = await prisma.repertoireMove.findMany({
      where: { fromNodeId: root.id, playerTurn: "OPPONENT" },
      orderBy: { uci: "asc" }
    });
    assert.deepEqual(rootEdges.map(edge => edge.uci), ["c2c4", "e2e4", "g1f3"]);
    assert.equal(rootEdges.find(edge => edge.uci === "e2e4")!.id, e4.edge.id);
    assert.equal(rootEdges.find(edge => edge.uci === "g1f3")!.id, nf3.edge.id);
    assert.equal(rootEdges.find(edge => edge.uci === "c2c4")!.toNodeId, c4Canonical.id);
    assert.equal((await prisma.repertoireNode.findUniqueOrThrow({ where: { id: c4Canonical.id } })).pgn, "external canonical c4");
    assert.equal(await prisma.repertoireMove.findUnique({ where: { id: d4.edge.id } }), null);
    assert.equal(await prisma.repertoireNode.findUnique({ where: { id: d4.destination.id } }), null);
    assert.equal(await prisma.repertoireNode.findUnique({ where: { id: d4Response.destination.id } }), null);

    const sameResponse = await prisma.repertoireMove.findUniqueOrThrow({ where: { id: e4Response.response.id } });
    assert.equal(sameResponse.cp, -12);
    assert.equal((await prisma.repertoirePositionStat.findUniqueOrThrow({ where: { id: e4Response.stat.id } })).reps, 7);
    const changedResponse = await prisma.repertoireMove.findFirstOrThrow({
      where: { fromNodeId: nf3.destination.id, playerTurn: "RESPONSE" }
    });
    assert.notEqual(changedResponse.id, nf3Response.response.id);
    assert.equal(changedResponse.uci, "g8f6");
    const freshStat = await prisma.repertoirePositionStat.findFirstOrThrow({ where: { targetMoveId: changedResponse.id } });
    assert.equal(freshStat.reps, 0);
    assert.equal(freshStat.lapses, 0);
    assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: c4Response.response.id } })).cp, -6);
    assert.equal(evaluatorCalls.get(e4.destination.fullFen), 1);
    assert.equal(evaluatorCalls.get(nf3.destination.fullFen), 1);
    assert.equal(evaluatorCalls.get(c4Canonical.fullFen), 1);
    assert.deepEqual(evaluatorHistories.get(c4Canonical.fullFen), ["external", "canonical", "c4"]);
    assert.equal(summary.totalBlackMovesEvaluated, 3);
  });


  it("B processed first and retaining a transposition into X, then A processed later and deleting X reprocesses B", async () => {
    const root = await createNode("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "", 1);

    // B: 1. Nc3
    const nc3_edge = await createOpponentBranch({ source: root, san: "Nc3", probability: 0.5 });
    const nc3_resp = await attachResponse(nc3_edge.destination, "g8f6", -5, 5);
    const nodeB = nc3_resp.destination;

    // A: 1. Nf3
    const nf3_edge = await createOpponentBranch({ source: root, san: "Nf3", probability: 0.5 });
    const nf3_resp = await attachResponse(nf3_edge.destination, "g8f6", -5, 5);
    const nodeA = nf3_resp.destination;

    const a_to_x = await createOpponentBranch({ source: nodeA, san: "Nc3", probability: 0.5 });
    const nodeX = a_to_x.destination;
    await prisma.repertoireNode.update({ where: { id: nodeX.id }, data: { pgn: "Nf3 Nf6 Nc3" } });
    const x_resp = await attachResponse(nodeX, "d7d5", -10, 2);

    // B -> X (transposition)
    await prisma.repertoireMove.create({
      data: {
        repertoireId,
        fromNodeId: nodeB.id,
        toNodeId: nodeX.id,
        san: "Nf3",
        uci: "g1f3",
        prob: 0.5,
        trueProbability: 0.5,
        playerTurn: "OPPONENT"
      }
    });

    const mockDatabases = async (fen: string) => {
      if (fen === root.fullFen) return [{ moves: [] }, { moves: [] }, { moves: [{ san: "Nc3", uci: "b1c3", games: 50 }, { san: "Nf3", uci: "g1f3", games: 50 }], totalGames: 100 }] as any;
      if (fen === nodeB.fullFen) return [{ moves: [] }, { moves: [] }, { moves: [{ san: "Nf3", uci: "g1f3", games: 100 }], totalGames: 100 }] as any;
      if (fen === nodeA.fullFen) return [{ moves: [] }, { moves: [] }, { moves: [], totalGames: 0 }] as any;
      return [{ moves: [] }, { moves: [] }, { moves: [], totalGames: 0 }] as any;
    };

    let reprocessedB = false;
    const mockEvaluator = async (fen: string) => {
      if (fen === nc3_edge.destination.fullFen) return { selectedUci: "g8f6", selectedMoveSan: "Nf6", cp: -5, mate: null, depth: 20, controlEngineId: "dummyEngine", source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: null };
      if (fen === nf3_edge.destination.fullFen) return { selectedUci: "g8f6", selectedMoveSan: "Nf6", cp: -5, mate: null, depth: 20, controlEngineId: "dummyEngine", source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: null };
      if (fen === a_to_x.destination.fullFen) {
        reprocessedB = true;
        return { selectedUci: "d7d5", selectedMoveSan: "d5", cp: -10, mate: null, depth: 20, controlEngineId: "dummyEngine", source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: null };
      }
      return { selectedUci: "e7e5", selectedMoveSan: "e5", cp: 0, mate: null, depth: 20, controlEngineId: "dummyEngine", source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: null };
    };

    // Force B to be processed first by queueing order
    await prisma.repertoireMove.update({ where: { id: nc3_edge.edge.id }, data: { prob: 0.6, trueProbability: 0.6 } as any });
    await prisma.repertoireMove.update({ where: { id: nf3_edge.edge.id }, data: { prob: 0.4, trueProbability: 0.4 } as any });

    await generateRepertoire(root.fullFen, 3, {
      repertoireId,
      fetchDatabases: mockDatabases,
      responseEvaluator: mockEvaluator as any,
      ensurePositionCache: (async () => ({})) as any,
      ensureNodeWikibooks: (async () => ({ status: "CACHED", text: null })) as any,
      wait: async () => undefined
    });

    assert.strictEqual(reprocessedB, true);
    const newB_X = await prisma.repertoireMove.findFirst({ where: { fromNodeId: nodeB.id, san: "Nf3" }});
    assert.ok(newB_X);
    const newX = await prisma.repertoireNode.findUnique({ where: { id: newB_X.toNodeId }});
    assert.strictEqual(newX?.pgn, "Nc3 Nf6 Nf3");
  });

  it("A processed first and deleting X, then B processed later creates fresh canonical X", async () => {
    const root = await createNode("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "", 1);

    // A: 1. Nf3
    const nf3_edge = await createOpponentBranch({ source: root, san: "Nf3", probability: 0.6 });
    const nf3_resp = await attachResponse(nf3_edge.destination, "g8f6", -5, 5);
    const nodeA = nf3_resp.destination;

    // B: 1. Nc3
    const nc3_edge = await createOpponentBranch({ source: root, san: "Nc3", probability: 0.4 });
    const nc3_resp = await attachResponse(nc3_edge.destination, "g8f6", -5, 5);
    const nodeB = nc3_resp.destination;

    // A -> X: 2. Nc3
    const a_to_x = await createOpponentBranch({ source: nodeA, san: "Nc3", probability: 0.5 });
    const nodeX = a_to_x.destination;
    await prisma.repertoireNode.update({ where: { id: nodeX.id }, data: { pgn: "Nf3 Nf6 Nc3" } });
    const x_resp = await attachResponse(nodeX, "d7d5", -10, 2);

    // B -> X (transposition)
    await prisma.repertoireMove.create({
      data: {
        repertoireId,
        fromNodeId: nodeB.id,
        toNodeId: nodeX.id,
        san: "Nf3",
        uci: "g1f3",
        prob: 0.5,
        trueProbability: 0.5,
        playerTurn: "OPPONENT"
      }
    });

    const mockDatabases = async (fen: string) => {
      if (fen === root.fullFen) return [{ moves: [] }, { moves: [] }, { moves: [{ san: "Nf3", uci: "g1f3", games: 50 }, { san: "Nc3", uci: "b1c3", games: 50 }], totalGames: 100 }] as any;
      if (fen === nodeB.fullFen) return [{ moves: [] }, { moves: [] }, { moves: [{ san: "Nf3", uci: "g1f3", games: 100 }], totalGames: 100 }] as any;
      if (fen === nodeA.fullFen) return [{ moves: [] }, { moves: [] }, { moves: [], totalGames: 0 }] as any;
      return [{ moves: [] }, { moves: [] }, { moves: [], totalGames: 0 }] as any;
    };

    let reprocessedB = false;
    const processingOrder: string[] = [];
    const mockEvaluator = async (fen: string) => {
      if (fen === nc3_edge.destination.fullFen) {
        processingOrder.push("B");
        return { selectedUci: "g8f6", selectedMoveSan: "Nf6", cp: -5, mate: null, depth: 20, controlEngineId: "dummyEngine", source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: null };
      }
      if (fen === nf3_edge.destination.fullFen) {
        processingOrder.push("A");
        return { selectedUci: "g8f6", selectedMoveSan: "Nf6", cp: -5, mate: null, depth: 20, controlEngineId: "dummyEngine", source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: null };
      }
      if (fen === a_to_x.destination.fullFen) {
        reprocessedB = true;
        return { selectedUci: "d7d5", selectedMoveSan: "d5", cp: -10, mate: null, depth: 20, controlEngineId: "dummyEngine", source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: null };
      }
      return { selectedUci: "e7e5", selectedMoveSan: "e5", cp: 0, mate: null, depth: 20, controlEngineId: "dummyEngine", source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: null };
    };

    await generateRepertoire(root.fullFen, 3, {
      repertoireId,
      fetchDatabases: mockDatabases,
      responseEvaluator: mockEvaluator as any,
      ensurePositionCache: (async () => ({})) as any,
      ensureNodeWikibooks: (async () => ({ status: "CACHED", text: null })) as any,
      wait: async () => undefined
    });

    assert.deepStrictEqual(processingOrder.slice(0, 2), ["A", "B"]);
    const newB_X = await prisma.repertoireMove.findFirst({ where: { fromNodeId: nodeB.id, san: "Nf3" }});
    assert.ok(newB_X);
    const newX = await prisma.repertoireNode.findUnique({ where: { id: newB_X.toNodeId }});
    assert.strictEqual(newX?.pgn, "Nc3 Nf6 Nf3");
  });
});
