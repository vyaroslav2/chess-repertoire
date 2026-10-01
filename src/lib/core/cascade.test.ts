import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Chess } from "chess.js";
import { prisma } from "../db/operations";
import { defaultConfig } from "./config";
import { generateRepertoire } from "./generator";
import { probabilityBalance, runCascade, type CascadeRunState } from "./cascade";

const START_FEN = new Chess().fen();
const near = (actual: number, expected: number) => Math.abs(actual - expected) < defaultConfig.probabilityTolerance;
const boardAndTurn = (fen: string) => fen.split(" ").slice(0, 2).join(" ");
const play = (sans: string[]) => { const chess = new Chess(); for (const san of sans) chess.move(san); return boardAndTurn(chess.fen()); };
// Only the side to move matters to the cascade (TR.21).
const WHITE_TO_MOVE = START_FEN;
const BLACK_TO_MOVE = (() => { const chess = new Chess(); chess.move("e4"); return chess.fen(); })();

async function captureLog<T>(run: () => Promise<T>): Promise<{ result?: T; error?: Error; lines: string[] }> {
  const lines: string[] = [];
  const original = { log: console.log, warn: console.warn };
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  console.warn = console.log;
  try {
    return { result: await run(), lines };
  } catch (error) {
    return { error: error as Error, lines };
  } finally {
    console.log = original.log;
    console.warn = original.warn;
  }
}

describe("TR", () => {
  let userId: string;
  let repertoireId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({ data: { username: `tr_${Date.now()}` } });
    userId = user.id;
    const repertoire = await prisma.repertoire.create({ data: { title: "TR", color: "black", userId } });
    repertoireId = repertoire.id;
  });

  afterEach(async () => {
    await prisma.repertoire.deleteMany({ where: { id: repertoireId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  async function node(name: string, fullFen: string, cumProb: number, transposesTo: string | null = null) {
    return prisma.repertoireNode.create({
      data: { repertoireId, fullFen, positionKey: name, history: name, displayPgn: name, routeProb: cumProb, cumProb, transposesTo }
    });
  }

  let moveCount = 0;
  async function move(from: { id: string }, to: { id: string } | null, moveProb: number | null, stopReason: string | null = null) {
    moveCount += 1;
    return prisma.repertoireMove.create({
      data: {
        repertoireId, fromNodeId: from.id, toNodeId: to?.id ?? null, uci: `move${moveCount}`, san: `move${moveCount}`,
        playerTurn: moveProb === null ? "RESPONSE" : "OPPONENT", moveProb, stopReason
      }
    });
  }

  const read = (target: { id: string }) => prisma.repertoireNode.findUniqueOrThrow({ where: { id: target.id } });

  async function cascade(pointer: { id: string; transposesTo: string | null }, run: CascadeRunState = { cascadeCount: 0, tinyDroppedTotal: 0 }, config = defaultConfig) {
    return captureLog(() => runCascade({ repertoireId, pointerId: pointer.id, ownerId: pointer.transposesTo!, run, config }));
  }

  describe("TR generator", () => {
    const common = {
      fetchOpeningMetadata: async () => null,
      ensureNodeWikibooks: (async () => ({ status: "CACHED", text: null })) as any,
      wait: async () => undefined
    };
    const empty = { moves: [], totalGames: 0, positionTotalGames: 0, unaccountedShare: 0, opening: null };

    function evaluator(calls: string[], replies: Record<string, string>) {
      return async (fen: string, chess: Chess) => {
        const legal = chess.moves({ verbose: true });
        const reply = legal.find(candidate => candidate.san === replies[boardAndTurn(fen)]) ?? legal[0];
        calls.push(boardAndTurn(fen));
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

    // 1.e4 e5 2.Nf3 and 1.Nf3 e5 2.e4 reach the same positionKey; the clocks differ.
    async function runTransposition() {
      const whiteMoves: Record<string, Array<[string, number]>> = {
        [play([])]: [["e4", 60], ["Nf3", 40]],
        [play(["e4", "e5"])]: [["Nf3", 100]],
        [play(["Nf3", "e5"])]: [["e4", 100]]
      };
      const calls: string[] = [];
      const log = await captureLog(() => generateRepertoire(START_FEN, {
        repertoireId, ...common,
        responseEvaluator: evaluator(calls, { [play(["e4"])]: "e5", [play(["Nf3"])]: "e5", [play(["e4", "e5", "Nf3"])]: "Nc6" }) as any,
        fetchDatabases: (async (fen: string) => {
          const moves = whiteMoves[boardAndTurn(fen)];
          if (!moves) return [empty, empty, empty];
          return [empty, empty, {
            moves: moves.map(([san, games]) => {
              const chess = new Chess(fen);
              const played = chess.move(san);
              return { san, uci: played.lan, games, white: games, draws: 0, black: 0 };
            }),
            totalGames: 100, positionTotalGames: 100, unaccountedShare: 0, opening: null
          }];
        }) as any
      }));
      if (log.error) throw log.error;
      const owner = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, displayPgn: "e4 e5 Nf3" } });
      const pointer = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, displayPgn: "Nf3 e5 e4" } });
      return { ...log, calls, owner, pointer };
    }

    it("TR.02 TR.03 TR.06 TR.07: the first node to reach a positionKey owns it", async () => {
      const { owner, pointer } = await runTransposition();
      assert.notEqual(owner.fullFen, pointer.fullFen);
      assert.equal(owner.positionKey, pointer.positionKey);
      assert.equal(owner.transposesTo, null);
      const row = await prisma.position.findUniqueOrThrow({ where: { repertoireId_positionKey: { repertoireId, positionKey: owner.positionKey } } });
      assert.equal(row.nodeId, owner.id);
    });

    it("TR.08 TR.44: a later node is a pointer with stopReason Transposition, no Black reply, and a [TRANSPOSITION] log", async () => {
      const { lines, calls, owner, pointer } = await runTransposition();
      assert.ok(lines.includes("[TRANSPOSITION] route=Nf3 e5 e4; owner=e4 e5 Nf3; cumProb=40.000%"));
      assert.equal(pointer.transposesTo, owner.id);
      const edge = await prisma.repertoireMove.findFirstOrThrow({ where: { toNodeId: pointer.id } });
      assert.equal(edge.stopReason, "Transposition");
      assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: pointer.id } }), 0);
      // Owner and pointer share the board: EW ran once, for the owner (TR.44).
      assert.equal(calls.filter(position => position === boardAndTurn(pointer.fullFen)).length, 1);
    });

    it("TR.10 TR.16 TR.22 TR.19 TR.N.01: the pointer's cumProb moves to the owner and its subtree; routeProb is never changed", async () => {
      const { lines, owner, pointer } = await runTransposition();
      assert.equal(pointer.cumProb, 0);
      assert.ok(near(pointer.routeProb, 0.4));
      assert.ok(near(owner.cumProb, 1));
      assert.ok(near(owner.routeProb, 0.6));
      const reply = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, displayPgn: "e4 e5 Nf3 Nc6" } });
      assert.ok(near(reply.cumProb, 1));
      assert.ok(near(reply.routeProb, 0.6));
      assert.ok(lines.includes("Cascade C01 complete. revisits=0; refires=0; duplicates=0; tinyDroppedCounter=0"));
      assert.ok(near(await probabilityBalance(repertoireId, 0), 1));
    });
  });

  it("TR.09 TR.23: each cascade gets the next cascadeId", async () => {
    const owner = await node("owner", BLACK_TO_MOVE, 0.2);
    const run = { cascadeCount: 0, tinyDroppedTotal: 0 };
    const first = await cascade(await node("p1", BLACK_TO_MOVE, 0.1, owner.id), run);
    const second = await cascade(await node("p2", BLACK_TO_MOVE, 0.1, owner.id), run);
    assert.equal(first.result!.cascadeId, "C01");
    assert.equal(second.result!.cascadeId, "C02");
    assert.ok(near((await read(owner)).cumProb, 0.4));
  });

  it("TR.24 TR.37: a gain below tinyThreshold is set aside in tinyDroppedTotal", async () => {
    const owner = await node("owner", BLACK_TO_MOVE, 0.2);
    const tiny = defaultConfig.tinyThreshold / 2;
    const pointer = await node("pointer", BLACK_TO_MOVE, tiny, owner.id);
    const run = { cascadeCount: 0, tinyDroppedTotal: 0 };
    const { result, lines } = await cascade(pointer, run);
    assert.equal(result!.tinyDroppedCounter, 1);
    assert.equal(run.tinyDroppedTotal, tiny);
    assert.equal((await read(owner)).cumProb, 0.2);
    assert.equal((await read(pointer)).cumProb, 0);
    assert.ok(lines.includes("Cascade C01 complete. revisits=0; refires=0; duplicates=0; tinyDroppedCounter=1"));
  });

  it("TR.25 TR.47 TR.N.05: a Black move node passes gain x moveProb to each child; the games with no move go to unaccountedDropped", async () => {
    const owner = await node("owner", WHITE_TO_MOVE, 0.1);
    const children = [];
    for (const [name, games] of [["a", 2], ["b", 2], ["c", 1]] as const) {
      const child = await node(name, BLACK_TO_MOVE, 0.1 * games / 6);
      await move(owner, child, games / 6);
      children.push(child);
    }
    await cascade(await node("pointer", WHITE_TO_MOVE, 0.06, owner.id));
    assert.ok(near((await read(owner)).cumProb, 0.16));
    assert.ok(near((await read(children[0])).cumProb, 0.1 * 2 / 6 + 0.02));
    assert.ok(near((await read(children[1])).cumProb, 0.1 * 2 / 6 + 0.02));
    assert.ok(near((await read(children[2])).cumProb, 0.1 / 6 + 0.01));
    assert.ok(near((await read(owner)).unaccountedDropped, 0.01));
  });

  it("TR.32 TR.15: a cascade passes through another pointer to its owner; that pointer's cumProb stays 0", async () => {
    const finalOwner = await node("final", BLACK_TO_MOVE, 0.1);
    const blackMoveNode = await node("black", WHITE_TO_MOVE, 0.2);
    const earlierPointer = await node("earlier", BLACK_TO_MOVE, 0, finalOwner.id);
    await move(blackMoveNode, earlierPointer, 1, "Transposition");
    await cascade(await node("pointer", WHITE_TO_MOVE, 0.3, blackMoveNode.id));
    assert.equal((await read(earlierPointer)).cumProb, 0);
    assert.ok(near((await read(finalOwner)).cumProb, 0.4));
  });

  it("TR.13 TR.38 TR.39 TR.40: a node reached again is a revisit; the same edge with a different gain is a refire", async () => {
    // owner --> reply --> half to a pointer back to owner, half to a leaf. The gain halves each time round.
    const owner = await node("owner", BLACK_TO_MOVE, 0.1);
    const reply = await node("reply", WHITE_TO_MOVE, 0.1);
    await move(owner, reply, null);
    const back = await node("back", BLACK_TO_MOVE, 0, owner.id);
    const leaf = await node("leaf", BLACK_TO_MOVE, 0.05);
    await move(reply, back, 0.5, "Transposition");
    await move(reply, leaf, 0.5);
    const { result, error } = await cascade(await node("pointer", BLACK_TO_MOVE, 0.2, owner.id));
    assert.equal(error, undefined);
    assert.ok(result!.revisits > 0);
    assert.ok(result!.refires > 0);
    assert.equal(result!.duplicates, 0);
    assert.ok(result!.tinyDroppedCounter > 0);
    assert.ok(near((await read(leaf)).cumProb, 0.25));
  });

  it("TR.26 TR.35 TR.36 TR.43: the same item twice is a logged duplicate; a node touched past nodeTouchCountCap is a hard error", async () => {
    // A loop with moveProb 100%: the gain never shrinks.
    const owner = await node("owner", BLACK_TO_MOVE, 0.1);
    const reply = await node("reply", WHITE_TO_MOVE, 0.1);
    await move(owner, reply, null);
    const back = await node("back", BLACK_TO_MOVE, 0, owner.id);
    await move(reply, back, 1, "Transposition");
    const { error, lines } = await cascade(await node("pointer", BLACK_TO_MOVE, 0.01, owner.id), undefined, { ...defaultConfig, nodeTouchCountCap: 3 });
    assert.ok(lines.includes("[WARNING] Duplicate item in cascade C01: owner --> reply, gain 1.000000%. Applied anyway."));
    assert.ok(lines.includes("[WARNING] Possible loop: owner touched 4 times in cascade C01."));
    assert.equal(error?.message, "Possible loop: owner touched 4 times in cascade C01.");
  });

  it("TR.33 TR.34: cumProb above 100% is a hard error", async () => {
    const owner = await node("owner", BLACK_TO_MOVE, 0.9);
    const { error, lines } = await cascade(await node("pointer", BLACK_TO_MOVE, 0.2, owner.id));
    assert.ok(lines.includes("[WARNING] cumProb above 100% at owner in cascade C01: 110.000000%."));
    assert.equal(error?.message, "cumProb above 100% at owner in cascade C01: 110.000000%.");
  });

  it("TR.41 TR.42 TR.51: probability that leaves the endings without being counted is a hard error", async () => {
    // A legacy move with no destination: the owner is no longer an ending, and nothing receives the gain.
    const owner = await node("owner", BLACK_TO_MOVE, 0.1);
    await move(owner, null, null, "Repetition");
    const { error, lines } = await cascade(await node("pointer", BLACK_TO_MOVE, 0.2, owner.id));
    assert.ok(lines.includes("[WARNING] Probability went missing in cascade C01: sum 20.000000% --> 0.000000%."));
    assert.match(error!.message, /^Probability went missing in cascade C01/);
  });

  it("TR.41 TR.42 TR.52: probability counted twice is a hard error", async () => {
    // A dropped node should have no children; if it has one, its gain is counted in rareDropped and passed on.
    const parent = await node("parent", WHITE_TO_MOVE, 0.1);
    const dropped = await node("dropped", BLACK_TO_MOVE, 0);
    await move(parent, dropped, 0.1, "Too rare");
    const child = await node("child", WHITE_TO_MOVE, 0);
    await move(dropped, child, null);
    const { error, lines } = await cascade(await node("pointer", BLACK_TO_MOVE, 0.2, dropped.id));
    assert.ok(lines.includes("[WARNING] Probability was created in cascade C01: sum 20.000000% --> 40.000000%."));
    assert.match(error!.message, /^Probability was created in cascade C01/);
  });
});
