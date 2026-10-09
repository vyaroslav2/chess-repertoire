import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Chess } from "chess.js";
import { prisma, saveLocalEngineBaseline } from "../db/operations";
import { defaultConfig } from "./config";
import { endOfRunFailures, generateRepertoire, NO_OPPONENT_MOVES_ENDING } from "./generator";

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

    async function move(from: { id: string }, to: { id: string }, san: string, extra: { stopReason?: string | null; response?: boolean; deepVerified?: boolean } = {}) {
      return prisma.repertoireMove.create({
        data: {
          repertoireId, fromNodeId: from.id, toNodeId: to.id, uci: san, san,
          playerTurn: extra.response ? "RESPONSE" : "OPPONENT", moveProb: extra.response ? null : 0.5,
          stopReason: extra.stopReason ?? null, deepVerified: extra.deepVerified ?? false
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

    it("S3.11 S3.12 S3.13 S3.14: a sound tree passes every check", async () => {
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

    it("S3.12: a Black response without deepVerified fails", async () => {
      const { a } = await sound();
      const c = await node("e4 e5", 0.6);
      await move(a, c, "e5", { response: true, stopReason: "Depth budget reached on Black's move" });
      await prisma.repertoireMove.updateMany({ where: { repertoireId, san: "e4" }, data: { stopReason: null } });
      assert.deepEqual(await failures(), ["S3.12: 1 Black responses do not have deepVerified set (first: e5)."]);
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
    // 1.e4 (98 games) is kept, 1.a4 (2 games) is too rare; after 1.e4 e5 Explorer has no games.
    const whiteMoves: Record<string, Array<[string, number]>> = { [play([])]: [["e4", 98], ["a4", 2]] };
    const fetchDatabases = (async (fen: string) => {
      const moves = whiteMoves[boardAndTurn(fen)];
      if (!moves) return [empty, empty, empty];
      return [empty, empty, {
        moves: moves.map(([san, games]) => {
          const played = new Chess(fen).move(san);
          return { san, uci: played.lan, games, white: games, draws: 0, black: 0 };
        }),
        totalGames: 100, positionTotalGames: 100, unaccountedShare: 0, opening: null
      }];
    }) as any;

    function evaluator(deepVerified: boolean) {
      return async (fen: string, chess: Chess) => {
        const reply = chess.moves({ verbose: true }).find(move => move.san === "e5")!;
        await saveLocalEngineBaseline(fen, "test-local", { uci: reply.lan, cp: -10, mate: null });
        return {
          selectedUci: reply.lan, selectedMoveSan: reply.san, cp: -10, mate: null,
          source: "ChessDB" as const, selectionMethod: "Ordinary API" as const, moveOrigin: "Human Move" as const,
          deepVerified, localEvaluationProfile: "test-local",
          selectedStats: { weightedGames: 30, blackScore: 0.5 }, candidateMoves: [], enginePvs: [],
          evalSource: "ChessDB" as const, selectedEngineCp: -10, selectedMate: null,
          openingMetadata: null, openingMetadataRetrieval: "FRESH" as const
        };
      };
    }

    it("S3.14 EX.06: the Black move into a position with no games carries stopReason No opponent moves found", async () => {
      const log = await captureLog(() => generateRepertoire(START_FEN, {
        repertoireId, ...common, fetchDatabases, responseEvaluator: evaluator(true) as any
      }));
      if (log.error) throw log.error;
      const response = await prisma.repertoireMove.findFirstOrThrow({ where: { repertoireId, playerTurn: "RESPONSE" } });
      assert.equal(response.san, "e5");
      assert.equal(response.stopReason, NO_OPPONENT_MOVES_ENDING);
      assert.equal(NO_OPPONENT_MOVES_ENDING, "No opponent moves found");
    });

    it("S3.10 S3.15: the summary prints rareDroppedMovesTotal and a sound run returns normally", async () => {
      const log = await captureLog(() => generateRepertoire(START_FEN, {
        repertoireId, ...common, fetchDatabases, responseEvaluator: evaluator(true) as any
      }));
      if (log.error) throw log.error;
      assert.equal(log.result!.rareDroppedMovesTotal, 1);
      assert.ok(log.lines.includes("Rare Dropped Moves Total: 1"));
      const repertoire = await prisma.repertoire.findUniqueOrThrow({ where: { id: repertoireId } });
      assert.equal(repertoire.generationStatus, "IDLE");
    });

    it("S3.12 S3.15: one failed check throws a hard error after the summary", async () => {
      // A response that cannot be stored as verified stands in for one that slipped through.
      const log = await captureLog(() => generateRepertoire(START_FEN, {
        repertoireId, ...common, fetchDatabases, responseEvaluator: evaluator(false) as any
      }));
      assert.ok(log.error);
      assert.equal(log.error.message, "End-of-run checks failed:\nS3.12: 1 Black responses do not have deepVerified set (first: e5).");
      assert.ok(log.lines.includes("Rare Dropped Moves Total: 1"));
      const repertoire = await prisma.repertoire.findUniqueOrThrow({ where: { id: repertoireId } });
      assert.equal(repertoire.generationStatus, "FAILED");
    });

    it("S3.03: each node is processed once, marked when it is taken off the queue", async () => {
      const log = await captureLog(() => generateRepertoire(START_FEN, {
        repertoireId, ...common, fetchDatabases, responseEvaluator: evaluator(true) as any
      }));
      if (log.error) throw log.error;
      const dequeued = log.lines.filter(line => line.startsWith("[QUEUE] Dequeued: "));
      assert.deepEqual(dequeued, ["[QUEUE] Dequeued: (root)", "[QUEUE] Dequeued: e4 e5"]);
      assert.equal(log.result!.totalPositionsProcessed, 2);
    });
  });
});
