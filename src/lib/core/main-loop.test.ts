import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Chess } from "chess.js";
import { prisma } from "../db/operations";
import { defaultConfig } from "./config";
import { probabilityBalance } from "./cascade";
import { endOfRunFailures, generateRepertoire, NO_OPPONENT_MOVES_ENDING, reopenDroppedMoves } from "./generator";

const START_FEN = new Chess().fen();
const boardAndTurn = (fen: string) => fen.split(" ").slice(0, 2).join(" ");
const play = (sans: string[]) => { const chess = new Chess(); for (const san of sans) chess.move(san); return boardAndTurn(chess.fen()); };

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

describe("S3 main queue loop", () => {
  let userId: string;
  let repertoireId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({ data: { username: `s3_${Date.now()}` } });
    userId = user.id;
    const repertoire = await prisma.repertoire.create({ data: { title: "S3", color: "black", userId } });
    repertoireId = repertoire.id;
  });

  afterEach(async () => {
    await prisma.repertoire.deleteMany({ where: { id: repertoireId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  describe("S3.11 - S3.14 end-of-run checks", () => {
    async function node(history: string, cumProb: number, rareDropped = 0, status: string | null = "VALID_ABSENCE") {
      return prisma.repertoireNode.create({
        data: {
          repertoireId, fullFen: START_FEN, positionKey: history, history, displayPgn: history,
          routeProb: cumProb, cumProb, rareDropped, openingMetadataStatus: status
        }
      });
    }

    async function move(from: { id: string }, to: { id: string }, san: string, extra: { stopReason?: string | null; response?: boolean } = {}) {
      return prisma.repertoireMove.create({
        data: {
          repertoireId, fromNodeId: from.id, toNodeId: to.id, uci: san, san,
          playerTurn: extra.response ? "RESPONSE" : "OPPONENT", moveProb: extra.response ? null : 0.5,
          stopReason: extra.stopReason ?? null
        }
      });
    }

    // root --e4--> A (Game over, 60%) and root --a4--> B (Too rare, 40% in rareDropped).
    async function sound() {
      const root = await node("", 1);
      const a = await node("e4", 0.6);
      const b = await node("a4", 0, 0.4);
      await move(root, a, "e4", { stopReason: "Game over" });
      await move(root, b, "a4", { stopReason: "Too rare" });
      return { root, a, b };
    }

    const failures = () => endOfRunFailures({ repertoireId, tinyDroppedTotal: 0, config: defaultConfig });

    it("DRS.02 DRS.03 DRS.04: the sweep walks children in siblingIndex order and reopens only moves at minCumProb or above", async () => {
      const root = await node("", 1);
      const a = await node("a", 0, 0.003);
      const b = await node("b", 0, 0.002);
      const c = await node("c", 0, 0.0005);
      await prisma.repertoireNode.update({ where: { id: a.id }, data: { siblingIndex: 1 } });
      await prisma.repertoireNode.update({ where: { id: b.id }, data: { siblingIndex: 2 } });
      await prisma.repertoireNode.update({ where: { id: c.id }, data: { siblingIndex: 3 } });
      // Created out of order, so the walk cannot lean on insertion order.
      const moveC = await move(root, c, "c", { stopReason: "Too rare" });
      const moveB = await move(root, b, "b", { stopReason: "Too rare" });
      const moveA = await move(root, a, "a", { stopReason: "Too rare" });

      const log = await captureLog(() => reopenDroppedMoves({ repertoireId, minCumProb: defaultConfig.minCumProb }));
      if (log.error) throw log.error;
      assert.deepEqual(log.result, [{ moveId: moveA.id, nodeId: a.id }, { moveId: moveB.id, nodeId: b.id }]);
      assert.deepEqual(log.lines, ["[REOPENED] a: cumProb 0.300%.", "[REOPENED] b: cumProb 0.200%."]);
      const after = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: a.id } });
      assert.equal(after.cumProb, 0.003);
      assert.equal(after.rareDropped, 0);
      assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: moveA.id } })).stopReason, null);
      // DRS.04: c stays as it is.
      assert.equal((await prisma.repertoireNode.findUniqueOrThrow({ where: { id: c.id } })).rareDropped, 0.0005);
      assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: moveC.id } })).stopReason, "Too rare");
      // DRS.09: the balance is unchanged.
      assert.ok(Math.abs(await probabilityBalance(repertoireId, 0) - 0.0055) < defaultConfig.probabilityTolerance);
    });

    it("S3.11 S3.13 S3.14: a sound tree passes every check", async () => {
      await sound();
      assert.deepEqual(await failures(), []);
    });

    it("S3.11: endings + rareDroppedTotal + unaccountedDroppedTotal + tinyDroppedTotal must come to 100%", async () => {
      const { a } = await sound();
      await prisma.repertoireNode.update({ where: { id: a.id }, data: { cumProb: 0.59 } });
      assert.match((await failures()).join("\n"), /^S3\.11: .* is 99\.000000%, not 100%\.$/);
      // tinyDroppedTotal is part of the sum.
      assert.deepEqual(await endOfRunFailures({ repertoireId, tinyDroppedTotal: 0.01, config: defaultConfig }), []);
    });

    it("S3.13: a node without opening metadata fails", async () => {
      const { b } = await sound();
      await prisma.repertoireNode.update({ where: { id: b.id }, data: { openingMetadataStatus: null } });
      assert.match((await failures()).join("\n"), /^S3\.13: Generated history a4 .* status is missing$/);
    });

    it("S3.14: an ending reached by a move without a stopReason fails; the root needs none", async () => {
      await sound();
      await prisma.repertoireMove.updateMany({ where: { repertoireId, san: "e4" }, data: { stopReason: null } });
      assert.deepEqual(await failures(), ["S3.14: 1 routes end without a stopReason (first: e4)."]);
      await prisma.repertoireNode.deleteMany({ where: { repertoireId } });
      await node("", 1);
      assert.deepEqual(await failures(), []);
    });
  });

  describe("S3 generator", () => {
    const common = {
      fetchOpeningMetadata: async () => null,
      ensureNodeWikibooks: (async () => ({ status: "CACHED", text: null })) as any,
      wait: async () => undefined
    };
    const empty = { moves: [], totalGames: 0, positionTotalGames: 0, unaccountedShare: 0, opening: null };
    // 1.e4 (9,995 games) is kept, 1.a4 (5 games, 0.05%) is too rare; after 1.e4 e5 Explorer has no games.
    const whiteMoves: Record<string, Array<[string, number]>> = { [play([])]: [["e4", 9_995], ["a4", 5]] };
    const fetchDatabases = (async (fen: string) => {
      const moves = whiteMoves[boardAndTurn(fen)];
      if (!moves) return empty;
      return {
        moves: moves.map(([san, games]) => {
          const played = new Chess(fen).move(san);
          return { san, uci: played.lan, games, white: games, draws: 0, black: 0 };
        }),
        totalGames: 10_000, positionTotalGames: 10_000, unaccountedShare: 0, opening: null
      };
    }) as any;

    function evaluator() {
      return async (fen: string, chess: Chess) => {
        const reply = chess.moves({ verbose: true }).find(move => move.san === "e5")!;
        return {
          selectedUci: reply.lan, selectedMoveSan: reply.san, cp: -10, mate: null,
          source: "Local Stockfish 19" as const, selectionMethod: "Baseline" as const, moveOrigin: "Engine Move" as const,
          engineRank: 1, baselineCp: -10, baselineMate: null
        };
      };
    }

    it("S3.14 EX.06: the Black move into a position with no games carries stopReason No opponent moves found", async () => {
      const log = await captureLog(() => generateRepertoire(START_FEN, {
        repertoireId, ...common, fetchDatabases, responseEvaluator: evaluator() as any
      }));
      if (log.error) throw log.error;
      const response = await prisma.repertoireMove.findFirstOrThrow({ where: { repertoireId, playerTurn: "RESPONSE" } });
      assert.equal(response.san, "e5");
      assert.equal(response.stopReason, NO_OPPONENT_MOVES_ENDING);
      assert.equal(NO_OPPONENT_MOVES_ENDING, "No opponent moves found");
    });

    it("S3.10 S3.15: the summary prints rareDroppedMovesTotal and a sound run returns normally", async () => {
      const log = await captureLog(() => generateRepertoire(START_FEN, {
        repertoireId, ...common, fetchDatabases, responseEvaluator: evaluator() as any
      }));
      if (log.error) throw log.error;
      assert.equal(log.result!.rareDroppedMovesTotal, 1);
      assert.ok(log.lines.includes("Rare Dropped Moves Total: 1"));
      const repertoire = await prisma.repertoire.findUniqueOrThrow({ where: { id: repertoireId } });
      assert.equal(repertoire.generationStatus, "IDLE");
    });

    it("S3.11 S3.15: one failed check throws a hard error after the summary", async () => {
      // Explorer claims half the root's games are missing although its moves add up: probability is created.
      const inconsistent = (async (fen: string) => {
        const result = await fetchDatabases(fen);
        return boardAndTurn(fen) === play([]) ? { ...result, unaccountedShare: 0.5 } : result;
      }) as any;
      const log = await captureLog(() => generateRepertoire(START_FEN, {
        repertoireId, ...common, fetchDatabases: inconsistent, responseEvaluator: evaluator() as any
      }));
      assert.ok(log.error);
      assert.match(log.error.message, /^End-of-run checks failed:\nS3\.11: .* is 150\.000000%, not 100%\.$/);
      assert.ok(log.lines.includes("Rare Dropped Moves Total: 1"));
      const repertoire = await prisma.repertoire.findUniqueOrThrow({ where: { id: repertoireId } });
      assert.equal(repertoire.generationStatus, "FAILED");
    });

    it("S3.16 DRS.06: a sweep that reopens nothing ends the run", async () => {
      const log = await captureLog(() => generateRepertoire(START_FEN, {
        repertoireId, ...common, fetchDatabases, responseEvaluator: evaluator() as any
      }));
      if (log.error) throw log.error;
      // 1.a4 holds 0.05%, still below minCumProb.
      assert.ok(log.lines.includes("[SWEEP 1] Reopened 0 routes."));
      assert.ok(log.lines.includes("Sweeps:                   1"));
      assert.ok(log.lines.includes("Reopened Routes:          0"));
      assert.equal(log.result!.totalSweeps, 1);
      assert.equal(log.result!.rareDroppedMovesTotal, 1);
    });

    it("DRS.04 DRS.05 DRS.06 DRS.09: a too-rare move lifted by a transposition is reopened and expanded", async () => {
      // 1.e4 e5 2.Nf3 is 90% x 0.01%, too rare. 1.Nf3 e5 2.e4 (10%) transposes into it, and its cascade lifts it.
      const moves: Record<string, Array<[string, number]>> = {
        [play([])]: [["e4", 9_000], ["Nf3", 1_000]],
        [play(["e4", "e5"])]: [["Bc4", 9_999], ["Nf3", 1]],
        [play(["Nf3", "e5"])]: [["e4", 10_000]]
      };
      const transposing = (async (fen: string) => {
        const rows = moves[boardAndTurn(fen)];
        if (!rows) return empty;
        const total = rows.reduce((sum, [, games]) => sum + games, 0);
        return {
          moves: rows.map(([san, games]) => ({ san, uci: new Chess(fen).move(san).lan, games, white: games, draws: 0, black: 0 })),
          totalGames: total, positionTotalGames: total, unaccountedShare: 0, opening: null
        };
      }) as any;
      const firstOrE5 = async (fen: string, chess: Chess) => {
        const legal = chess.moves({ verbose: true });
        const reply = legal.find(move => move.san === "e5") ?? legal[0];
        return {
          selectedUci: reply.lan, selectedMoveSan: reply.san, cp: -10, mate: null,
          source: "Local Stockfish 19" as const, selectionMethod: "Baseline" as const, moveOrigin: "Engine Move" as const,
          engineRank: 1, baselineCp: -10, baselineMate: null
        };
      };
      const log = await captureLog(() => generateRepertoire(START_FEN, {
        repertoireId, ...common, fetchDatabases: transposing, responseEvaluator: firstOrE5 as any
      }));
      if (log.error) throw log.error;

      assert.ok(log.lines.includes("[REOPENED] e4 e5 Nf3: cumProb 10.009%."));
      const sweeps = log.lines.filter(line => line.startsWith("[SWEEP "));
      assert.deepEqual(sweeps, ["[SWEEP 1] Reopened 1 routes.", "[SWEEP 2] Reopened 0 routes."]);
      assert.equal(log.result!.totalSweeps, 2);
      assert.equal(log.result!.totalReopenedRoutes, 1);
      assert.equal(log.result!.rareDroppedMovesTotal, 0);

      const reopened = await prisma.repertoireNode.findFirstOrThrow({
        where: { repertoireId, displayPgn: "e4 e5 Nf3" },
        include: { incomingMoves: true, outgoingMoves: true }
      });
      assert.ok(Math.abs(reopened.cumProb - 0.10009) < defaultConfig.probabilityTolerance);
      assert.equal(reopened.rareDropped, 0);
      assert.equal(reopened.incomingMoves[0].stopReason, null);
      // DRS.05: Black replied, and the next position went through the queue.
      assert.equal(reopened.outgoingMoves.length, 1);
      assert.equal(reopened.outgoingMoves[0].playerTurn, "RESPONSE");
      const dequeued = log.lines.filter(line => line.startsWith("[QUEUE] Dequeued: "));
      assert.ok(dequeued.at(-1)!.startsWith("[QUEUE] Dequeued: e4 e5 Nf3 "));
    });

    it("S3.03: each node is processed once, marked when it is taken off the queue", async () => {
      const log = await captureLog(() => generateRepertoire(START_FEN, {
        repertoireId, ...common, fetchDatabases, responseEvaluator: evaluator() as any
      }));
      if (log.error) throw log.error;
      const dequeued = log.lines.filter(line => line.startsWith("[QUEUE] Dequeued: "));
      assert.deepEqual(dequeued, ["[QUEUE] Dequeued: (root)", "[QUEUE] Dequeued: e4 e5"]);
      assert.equal(log.result!.totalPositionsProcessed, 2);
    });
  });
});
