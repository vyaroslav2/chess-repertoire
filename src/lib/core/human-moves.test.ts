import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Chess } from "chess.js";
import { createRepertoireNode, prisma, propagateRepertoireProbabilities } from "../db/operations";
import { defaultConfig } from "./config";
import { selectWhiteCandidates } from "./evaluator";
import { generateRepertoire } from "./generator";
import { canonicalizeOpponentCandidates, readExpectedOpponentEdges, reconcileOpponentBranches } from "./rm-opponent-reconciliation";

const START_FEN = new Chess().fen();
const near = (actual: number, expected: number) => Math.abs(actual - expected) < defaultConfig.probabilityTolerance;

function amateurMove(san: string, games: number) {
  const chess = new Chess();
  const move = chess.move(san);
  return { san, uci: move.lan, games, white: games, draws: 0, black: 0 };
}

async function captureLog<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const original = { log: console.log, warn: console.warn };
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  console.warn = console.log;
  try {
    return { result: await run(), lines };
  } finally {
    console.log = original.log;
    console.warn = original.warn;
  }
}

describe("HM.04 HM.05 candidates", () => {
  it("HM.04: every returned move is listed; a move below its threshold is marked dropped", () => {
    const selected = selectWhiteCandidates(1, [amateurMove("e4", 95), amateurMove("b3", 4), amateurMove("g3", 1)], 100);
    assert.deepEqual(selected.map(move => [move.san, move.include]), [["e4", true], ["b3", false], ["g3", false]]);
  });

  it("HM.05: most popular first, ties alphabetically by SAN", () => {
    const selected = selectWhiteCandidates(1, [amateurMove("d4", 30), amateurMove("e4", 40), amateurMove("c4", 30)], 100);
    assert.deepEqual(selected.map(move => move.san), ["e4", "c4", "d4"]);
  });

  it("HM.05 HM.06: siblingIndex starts at 1; routeProb = parent.routeProb * moveProb", () => {
    const [e4, d4] = canonicalizeOpponentCandidates({
      sourceFullFen: START_FEN,
      sourcePgn: "",
      sourceRouteProb: 0.5,
      sourceCumProb: 0.8,
      candidates: [{ san: "e4", probability: 0.6 }, { san: "d4", probability: 0.4, dropped: true }]
    });
    assert.deepEqual([e4.siblingIndex, d4.siblingIndex], [1, 2]);
    assert.deepEqual([e4.dropped, d4.dropped], [false, true]);
    assert.ok(near(e4.routeProb, 0.3));
    assert.ok(near(d4.routeProb, 0.2));
  });
});

describe("HM generator", () => {
  let userId: string;
  let repertoireId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({ data: { username: `hm_${Date.now()}` } });
    userId = user.id;
    const repertoire = await prisma.repertoire.create({ data: { title: "HM", color: "black", userId } });
    repertoireId = repertoire.id;
  });

  afterEach(async () => {
    await prisma.repertoire.deleteMany({ where: { id: repertoireId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  const common = {
    fetchOpeningMetadata: async () => null,
    ensureNodeWikibooks: (async () => ({ status: "CACHED", text: null })) as any,
    wait: async () => undefined
  };
  const empty = { moves: [], totalGames: 0, positionTotalGames: 0, unaccountedShare: 0, opening: null };
  const amateurAt = (moves: ReturnType<typeof amateurMove>[]) => ({
    moves, totalGames: 100, positionTotalGames: 100, unaccountedShare: 0, opening: null
  });
  const fenAfter = (san: string) => { const chess = new Chess(); chess.move(san); return chess.fen(); };

  function evaluator(calls: string[]) {
    return async (fen: string, chess: Chess) => {
      const reply = chess.moves({ verbose: true })[0];
      calls.push(fen);
      return {
        selectedUci: reply.lan, selectedMoveSan: reply.san, cp: -10, mate: null,
        source: "ChessDB" as const, selectionMethod: "Ordinary API" as const, moveOrigin: "Human Move" as const,
        deepVerified: false, localEvaluationProfile: null,
        selectedStats: { weightedGames: 30, blackScore: 0.5 }, candidateMoves: [], enginePvs: [],
        evalSource: "ChessDB" as const, selectedEngineCp: -10, selectedMate: null,
        openingMetadata: null, openingMetadataRetrieval: "FRESH" as const
      };
    };
  }

  async function runRoot(moves: ReturnType<typeof amateurMove>[], calls: string[] = []) {
    return captureLog(() => generateRepertoire(START_FEN, 1, {
      repertoireId, ...common,
      responseEvaluator: evaluator(calls) as any,
      fetchDatabases: (async (fen: string) => fen === START_FEN ? [empty, empty, amateurAt(moves)] : [empty, empty, empty]) as any
    }));
  }

  const rootMoves = () => [
    amateurMove("e4", 40), amateurMove("d4", 27), amateurMove("c4", 27), amateurMove("g3", 3), amateurMove("b3", 3)
  ];

  it("HM.04: a dropped move gets a node with cumProb 0 and its arriving probability in rareDropped", async () => {
    const calls: string[] = [];
    await runRoot(rootMoves(), calls);
    for (const san of ["b3", "g3"]) {
      const node = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, displayPgn: san } });
      assert.equal(node.cumProb, 0);
      assert.ok(near(node.rareDropped, 0.03));
      assert.ok(near(node.routeProb, 0.03));
      assert.ok(node.openingMetadataStatus !== null);
      const edge = await prisma.repertoireMove.findFirstOrThrow({ where: { toNodeId: node.id } });
      assert.equal(edge.stopReason, "Too rare");
      assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: node.id } }), 0);
      assert.ok(!calls.includes(fenAfter(san)));
    }
    const e4 = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, displayPgn: "e4" } });
    assert.equal(e4.rareDropped, 0);
    assert.ok(near(e4.cumProb, 0.4));
  });

  it("HM.05: siblingIndex numbers every returned move by popularity, dropped moves included", async () => {
    await runRoot(rootMoves());
    const root = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, history: "" } });
    const children = await prisma.repertoireMove.findMany({
      where: { fromNodeId: root.id, playerTurn: "OPPONENT" },
      include: { toNode: true }
    });
    const bySibling = children.map(edge => [edge.toNode!.siblingIndex, edge.san]).sort((a, b) => (a[0] as number) - (b[0] as number));
    assert.deepEqual(bySibling, [[1, "e4"], [2, "c4"], [3, "d4"], [4, "b3"], [5, "g3"]]);
  });

  it("HM.06: the least popular move is handled first and taken last; routeProb follows the route", async () => {
    const calls: string[] = [];
    const { lines } = await runRoot(rootMoves(), calls);
    assert.deepEqual(calls, [fenAfter("d4"), fenAfter("c4"), fenAfter("e4")]);
    const dequeued = lines.filter(line => line.startsWith("[QUEUE] Dequeued: ") && !line.endsWith("(root)"));
    assert.deepEqual(dequeued.map(line => line.split(" ")[2]), ["e4", "c4", "d4"]);
    const e4 = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, displayPgn: "e4" } });
    const afterReply = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, history: { startsWith: "e2e4 " } } });
    assert.ok(near(e4.routeProb, 0.4));
    assert.ok(near(afterReply.routeProb, 0.4));
  });

  it("HM.08: all returned moves dropped logs the warning and ends the route", async () => {
    const calls: string[] = [];
    // Both moves fall below the 5% threshold; the other 93 games have no move (EX.05).
    const { lines: warned } = await captureLog(() => generateRepertoire(START_FEN, 1, {
      repertoireId, ...common,
      responseEvaluator: evaluator(calls) as any,
      fetchDatabases: (async (fen: string) => fen === START_FEN
        ? [empty, empty, { moves: [amateurMove("e4", 4), amateurMove("d4", 3)], totalGames: 7, positionTotalGames: 100, unaccountedShare: 0.93, opening: null }]
        : [empty, empty, empty]) as any
    }));
    assert.ok(warned.includes("[WARNING] All opponent moves were filtered away."));
    assert.deepEqual(calls, []);
    const edges = await prisma.repertoireMove.findMany({ where: { repertoireId } });
    assert.deepEqual(edges.map(edge => edge.stopReason), ["Too rare", "Too rare"]);
  });

  it("HM.04: a cascade that reaches a dropped move adds to its rareDropped, not its cumProb", async () => {
    const source = await createRepertoireNode(repertoireId, START_FEN, "", 0.5);
    const [dropped] = canonicalizeOpponentCandidates({
      sourceFullFen: source.fullFen, sourcePgn: "", sourceRouteProb: source.routeProb, sourceCumProb: source.cumProb,
      candidates: [{ san: "b3", probability: 0.02, dropped: true }]
    });
    const result = await reconcileOpponentBranches({
      repertoireId,
      expectedSource: {
        id: source.id, repertoireId, fullFen: source.fullFen, positionKey: source.positionKey,
        displayPgn: source.displayPgn, routeProb: source.routeProb, cumProb: source.cumProb
      },
      expectedStoredEdges: await readExpectedOpponentEdges(source.id),
      recomputedCandidates: [dropped]
    });
    const nodeId = result.branches[0].destinationNodeId!;
    assert.ok(near((await prisma.repertoireNode.findUniqueOrThrow({ where: { id: nodeId } })).rareDropped, 0.01));

    await prisma.repertoireNode.update({ where: { id: source.id }, data: { cumProb: 0.8 } });
    await propagateRepertoireProbabilities(repertoireId, source.id);
    const after = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: nodeId } });
    assert.equal(after.cumProb, 0);
    assert.ok(near(after.rareDropped, 0.016));
    assert.ok(near(after.routeProb, 0.01));
  });
});
