import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Chess } from "chess.js";
import { createRepertoireNode, prisma } from "../db/operations";
import { runCascade } from "./cascade";
import { defaultConfig } from "./config";
import { selectWhiteCandidates } from "./evaluator";
import { generateRepertoire } from "./generator";
import { canonicalizeOpponentCandidates, readExpectedOpponentEdges, reconcileOpponentBranches } from "./rm-opponent-reconciliation";

const START_FEN = new Chess().fen();
const near = (actual: number, expected: number) => Math.abs(actual - expected) < defaultConfig.probabilityTolerance;

function amateurMove(san: string, games: number, fen = START_FEN) {
  const chess = new Chess(fen);
  const move = chess.move(san);
  return { san, uci: move.lan, games, white: games, draws: 0, black: 0 };
}

const boardAndTurn = (fen: string) => fen.split(" ").slice(0, 2).join(" ");

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

  function evaluator(calls: string[], replies: Record<string, string> = {}) {
    return async (fen: string, chess: Chess) => {
      const legal = chess.moves({ verbose: true });
      const reply = legal.find(move => move.san === replies[boardAndTurn(fen)]) ?? legal[0];
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

  it("HM.04 HM.21 HM.23 HM.24: a dropped move gets a node with cumProb 0, its arriving probability in rareDropped, and a [TOO RARE] log", async () => {
    const calls: string[] = [];
    const { lines } = await runRoot(rootMoves(), calls);
    assert.ok(lines.includes("[TOO RARE] route=b3; rareDropped=3.000%"));
    assert.ok(lines.includes("[TOO RARE] route=g3; rareDropped=3.000%"));
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

  // A pointer elsewhere in the tree whose cascade reaches `owner` (TR.10).
  async function cascadeInto(owner: { id: string }, gain: number) {
    const pointer = await prisma.repertoireNode.create({
      data: { repertoireId, fullFen: fenAfter("e4"), positionKey: "pointer", history: "pointer", routeProb: gain, cumProb: gain, transposesTo: owner.id }
    });
    await runCascade({ repertoireId, pointerId: pointer.id, ownerId: owner.id, run: { cascadeCount: 0, tinyDroppedTotal: 0 }, config: defaultConfig });
  }

  it("HM.04 TR.48 TR.45: a cascade that reaches a dropped move adds to its rareDropped, not its cumProb", async () => {
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

    await captureLog(() => cascadeInto(source, 0.3));
    const after = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: nodeId } });
    assert.equal(after.cumProb, 0);
    assert.ok(near(after.rareDropped, 0.016));
    assert.ok(near(after.routeProb, 0.01));
  });

  async function reconcileFrom(
    source: Awaited<ReturnType<typeof createRepertoireNode>>,
    rows: Array<{ san: string; probability: number }>
  ) {
    return reconcileOpponentBranches({
      repertoireId,
      expectedSource: {
        id: source.id, repertoireId, fullFen: source.fullFen, positionKey: source.positionKey,
        displayPgn: source.displayPgn, routeProb: source.routeProb, cumProb: source.cumProb
      },
      expectedStoredEdges: await readExpectedOpponentEdges(source.id),
      recomputedCandidates: canonicalizeOpponentCandidates({
        sourceFullFen: source.fullFen, sourcePgn: source.displayPgn, sourceHistory: source.history,
        sourceRouteProb: source.routeProb, sourceCumProb: source.cumProb, candidates: rows
      })
    });
  }

  it("HM.25: a new White-move node starts with cumProb = parent.cumProb * moveProb; routeProb follows the route", async () => {
    const source = await createRepertoireNode(repertoireId, START_FEN, "", 0.5, { cumProb: 0.8 });
    const { branches: [e4] } = await reconcileFrom(source, [{ san: "e4", probability: 0.5 }]);
    const node = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: e4.destinationNodeId! } });
    assert.ok(near(node.cumProb, 0.4));
    assert.ok(near(node.routeProb, 0.25));
    assert.equal(e4.ending, null);
  });

  // 1.e4 f6 2.d4 g5: White to move, and 3.Qh5 is mate.
  const mateFen = (() => { const chess = new Chess(); for (const san of ["e4", "f6", "d4", "g5"]) chess.move(san); return chess.fen(); })();

  it("HM.26 HM.27 HM.28 HM.29: a White move that ends the game keeps its node and cumProb, gets no Black reply, and logs [GAME OVER]", async () => {
    const calls: string[] = [];
    const { lines } = await captureLog(() => generateRepertoire(mateFen, 1, {
      repertoireId, ...common,
      responseEvaluator: evaluator(calls) as any,
      fetchDatabases: (async (fen: string) => fen === mateFen
        ? [empty, empty, amateurAt([amateurMove("Qh5#", 40, mateFen), amateurMove("Nc3", 60, mateFen)])]
        : [empty, empty, empty]) as any
    }));
    assert.ok(lines.includes("[GAME OVER] route=Qh5#; cumProb=40.000%"));
    const node = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, displayPgn: "Qh5#" } });
    assert.ok(near(node.cumProb, 0.4));
    assert.equal(node.rareDropped, 0);
    assert.equal(node.transposesTo, null);
    const edge = await prisma.repertoireMove.findFirstOrThrow({ where: { toNodeId: node.id } });
    assert.equal(edge.stopReason, "Game over");
    assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: node.id } }), 0);
    assert.ok(!calls.includes(node.fullFen));
    assert.equal(calls.length, 1); // Only Nc3 reaches EW (HM.36).
  });

  it("HM.30 HM.31 HM.32 HM.33 HM.N.04: a White move that repeats this route gets its own ending node and logs [REPETITION]", async () => {
    const play = (sans: string[]) => { const chess = new Chess(); for (const san of sans) chess.move(san); return boardAndTurn(chess.fen()); };
    const whiteMoves: Record<string, string> = {
      [play([])]: "Nf3",
      [play(["Nf3", "Nf6"])]: "Ne5",
      [play(["Nf3", "Nf6", "Ne5", "Ng8"])]: "Nf3"
    };
    const calls: string[] = [];
    const { lines } = await captureLog(() => generateRepertoire(START_FEN, 3, {
      repertoireId, ...common,
      responseEvaluator: evaluator(calls, { [play(["Nf3"])]: "Nf6", [play(["Nf3", "Nf6", "Ne5"])]: "Ng8" }) as any,
      fetchDatabases: (async (fen: string) => {
        const san = whiteMoves[boardAndTurn(fen)];
        if (!san) return [empty, empty, empty];
        return [empty, empty, amateurAt([amateurMove(san, 100, fen)])];
      }) as any
    }));
    assert.ok(lines.includes("[REPETITION] route=Nf3 Nf6 Ne5 Ng8 Nf3; repeated=Nf3; cumProb=100.000%"));
    const node = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, displayPgn: "Nf3 Nf6 Ne5 Ng8 Nf3" } });
    const earlier = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, displayPgn: "Nf3" } });
    assert.equal(node.positionKey, earlier.positionKey);
    assert.ok(near(node.cumProb, 1));
    assert.equal(node.transposesTo, null);
    // HM.32: the earlier node keeps what it had; nothing is passed back to it.
    assert.ok(near(earlier.cumProb, 1));
    const edge = await prisma.repertoireMove.findFirstOrThrow({ where: { toNodeId: node.id } });
    assert.equal(edge.stopReason, "Repetition");
    assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: node.id } }), 0);
    assert.ok(!calls.includes(node.fullFen));
    const owner = await prisma.position.findUniqueOrThrow({ where: { repertoireId_positionKey: { repertoireId, positionKey: node.positionKey } } });
    assert.equal(owner.nodeId, earlier.id);
  });

  const play = (sans: string[]) => { const chess = new Chess(); for (const san of sans) chess.move(san); return boardAndTurn(chess.fen()); };

  async function runScripted(whiteMoves: Record<string, Array<[string, number]>>, replies: Record<string, string>, maxDepth: number) {
    const calls: string[] = [];
    const fetched: string[] = [];
    const { lines } = await captureLog(() => generateRepertoire(START_FEN, maxDepth, {
      repertoireId, ...common,
      responseEvaluator: evaluator(calls, replies) as any,
      fetchDatabases: (async (fen: string) => {
        fetched.push(boardAndTurn(fen));
        const moves = whiteMoves[boardAndTurn(fen)];
        if (!moves) return [empty, empty, empty];
        return [empty, empty, amateurAt(moves.map(([san, games]) => amateurMove(san, games, fen)))];
      }) as any
    }));
    return { calls, fetched, lines };
  }

  it("RE.09 HM.30: Black's reply that repeats a position is not stopped; it is queued and the next White move is the repetition", async () => {
    const { calls, fetched, lines } = await runScripted(
      { [play([])]: [["Nf3", 100]], [play(["Nf3", "Nf6"])]: [["Ng1", 100]] },
      { [play(["Nf3"])]: "Nf6", [play(["Nf3", "Nf6", "Ng1"])]: "Ng8" },
      3
    );
    const reply = await prisma.repertoireMove.findFirstOrThrow({ where: { repertoireId, playerTurn: "RESPONSE", san: "Ng8" } });
    const repeated = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, displayPgn: "Nf3 Nf6 Ng1 Ng8" } });
    assert.equal(reply.stopReason, null);
    assert.equal(reply.toNodeId, repeated.id);
    assert.equal(repeated.positionKey, (await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, history: "" } })).positionKey);
    // The repeated start position is taken off the queue, and its White move ends as a repetition.
    assert.equal(fetched.filter(position => position === play([])).length, 2);
    assert.ok(lines.includes("[REPETITION] route=Nf3 Nf6 Ng1 Ng8 Nf3; repeated=Nf3; cumProb=100.000%"));
    assert.equal(calls.length, 2);
    assert.ok(!lines.some(line => line.startsWith("[REPETITION STOP]")));
  });

  it("RE.09: Black's reply that reaches a position another route reached is not stopped; each route keeps its own node", async () => {
    // 1.e4 d6 2.Nf3 e6 and 1.Nf3 e6 2.e4 d6 reach the same FullFen, clocks included.
    const { fetched } = await runScripted(
      {
        [play([])]: [["e4", 60], ["Nf3", 40]],
        [play(["e4", "d6"])]: [["Nf3", 100]],
        [play(["Nf3", "e6"])]: [["e4", 100]]
      },
      { [play(["e4"])]: "d6", [play(["e4", "d6", "Nf3"])]: "e6", [play(["Nf3"])]: "e6", [play(["Nf3", "e6", "e4"])]: "d6" },
      3
    );
    const first = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, displayPgn: "e4 d6 Nf3 e6" } });
    const second = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, displayPgn: "Nf3 e6 e4 d6" } });
    assert.equal(first.fullFen, second.fullFen);
    assert.notEqual(first.id, second.id);
    const responses = await prisma.repertoireMove.findMany({ where: { repertoireId, playerTurn: "RESPONSE" } });
    assert.equal(responses.length, 4);
    assert.ok(responses.every(response => response.stopReason === null && response.toNodeId !== null));
    // Both routes reach the queue.
    assert.equal(fetched.filter(position => position === boardAndTurn(first.fullFen)).length, 2);
  });

  it("HM.32: a cascade into the source raises the repetition node's cumProb, never the earlier node's", async () => {
    let parent = await createRepertoireNode(repertoireId, START_FEN, "", 1);
    const nodes = [];
    const chess = new Chess();
    const sans = ["Nf3", "Nf6", "Ne5", "Ng8"];
    for (let i = 0; i < sans.length; i++) {
      const move = chess.move(sans[i]);
      parent = await createRepertoireNode(repertoireId, chess.fen(), `${parent.history ? `${parent.history} ` : ""}${move.lan}`, 0.5, {
        displayPgn: sans.slice(0, i + 1).join(" ")
      });
      nodes.push(parent);
    }
    const [earlier] = nodes;
    const source = nodes[nodes.length - 1];
    const result = await reconcileFrom(source, [{ san: "Nf3", probability: 0.6 }, { san: "e4", probability: 0.4 }]);
    const repetition = result.branches.find(branch => branch.san === "Nf3")!;
    const e4 = result.branches.find(branch => branch.san === "e4")!;
    assert.equal(repetition.ending, "Repetition");
    assert.equal(repetition.repeatedPgn, "Nf3");
    assert.equal(e4.ending, null);
    assert.ok(near(repetition.effectiveCumProb, 0.3));

    await captureLog(() => cascadeInto(source, 0.4));
    const after = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: repetition.destinationNodeId! } });
    assert.ok(near(after.cumProb, 0.54));
    assert.ok(near(after.routeProb, 0.3));
    assert.ok(near((await prisma.repertoireNode.findUniqueOrThrow({ where: { id: earlier.id } })).cumProb, 0.5));
  });
});
