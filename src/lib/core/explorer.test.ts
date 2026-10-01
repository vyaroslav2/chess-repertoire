import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Chess } from "chess.js";
import { prisma, readExplorerCache, saveLocalEngineBaseline } from "../db/operations";
import { checkExplorerGameCounts, fetchAllDatabases } from "../api/lichess";
import { computeExplorerCacheProfile, defaultConfig } from "./config";
import { parseFullFen, positionKeyFromFen } from "./fen";
import { generateRepertoire } from "./generator";

const START_FEN = new Chess().fen();
const START_KEY = positionKeyFromFen(parseFullFen(START_FEN));

async function captureLog<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    return { result: await run(), lines };
  } finally {
    console.log = original;
  }
}

async function withFetch<T>(body: unknown, run: () => Promise<T>): Promise<T> {
  const original = global.fetch;
  global.fetch = async () => new Response(JSON.stringify(body));
  try {
    return await run();
  } finally {
    global.fetch = original;
  }
}

const shortfallWarning = "[WARNING] Explorer move counts do not add up to the position's total games. Missing: 3 games (15.00%).";

describe("EX.05 game counts", () => {
  it("EX.05: equal counts carry on with no warning", async () => {
    const { result, lines } = await captureLog(async () => checkExplorerGameCounts("AMATEUR", 20, 20));
    assert.equal(result, 0);
    assert.deepEqual(lines, []);
  });

  it("EX.05: an Amateur shortfall warns and returns the missing share", async () => {
    const { result, lines } = await captureLog(async () => checkExplorerGameCounts("AMATEUR", 17, 20));
    assert.equal(result, 3 / 20);
    assert.deepEqual(lines, [shortfallWarning]);
  });

  it("EX.05: a Masters or Elite shortfall warns only", async () => {
    for (const dataset of ["MASTERS", "ELITE"] as const) {
      const { result, lines } = await captureLog(async () => checkExplorerGameCounts(dataset, 17, 20));
      assert.equal(result, 0);
      assert.deepEqual(lines, [shortfallWarning]);
    }
  });

  it("EX.05: more games than the position's total is a hard error", () => {
    assert.throws(
      () => checkExplorerGameCounts("AMATEUR", 21, 20),
      { message: "Explorer move counts are more than the position's total games. Dataset: Amateur. Moves: 21 games. Position: 20 games." }
    );
  });
});

describe("EX.05 fetch and cache", () => {
  beforeEach(async () => { await prisma.positionCache.deleteMany({ where: { positionKey: START_KEY } }); });
  afterEach(async () => { await prisma.positionCache.deleteMany({ where: { positionKey: START_KEY } }); });

  const shortBody = { white: 12, draws: 5, black: 3, moves: [{ san: "e4", white: 10, draws: 5, black: 2 }] };

  it("EX.05: the Amateur shortfall is returned on a fresh fetch and on a cache hit", async () => {
    const fresh = await captureLog(() => withFetch(shortBody, () => fetchAllDatabases(START_FEN, ["AMATEUR"])));
    assert.equal(fresh.result[2].retrieval, "FRESH");
    assert.equal(fresh.result[2].unaccountedShare, 3 / 20);
    assert.ok(fresh.lines.includes(shortfallWarning));

    const cached = await captureLog(() => fetchAllDatabases(START_FEN, ["AMATEUR"]));
    assert.equal(cached.result[2].retrieval, "CACHE");
    assert.equal(cached.result[2].unaccountedShare, 3 / 20);
    assert.ok(cached.lines.includes(shortfallWarning));
  });

  it("EX.05: a Masters shortfall is not returned as unaccounted", async () => {
    const { result } = await captureLog(() => withFetch(shortBody, () => fetchAllDatabases(START_FEN, ["MASTERS"])));
    assert.equal(result[0].unaccountedShare, 0);
  });

  it("EX.05: more move games than the position's total throws and caches nothing", async () => {
    const body = { white: 1, draws: 0, black: 0, moves: [{ san: "e4", white: 10, draws: 5, black: 2 }] };
    await assert.rejects(withFetch(body, () => fetchAllDatabases(START_FEN, ["AMATEUR"])), /more than the position's total games/);
    const profile = computeExplorerCacheProfile("AMATEUR", defaultConfig);
    assert.equal((await readExplorerCache(START_KEY, profile)).status, "missing");
  });

  it("EX.05: a response without the position's totals is malformed", async () => {
    await assert.rejects(
      withFetch({ moves: [] }, () => fetchAllDatabases(START_FEN, ["AMATEUR"])),
      /position statistic counts are missing or invalid/
    );
  });
});

describe("EX.05 EX.06 generator", () => {
  let userId: string;
  let repertoireId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({ data: { username: `ex_${Date.now()}` } });
    userId = user.id;
    const repertoire = await prisma.repertoire.create({ data: { title: "EX", color: "black", userId } });
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

  it("EX.06: no Amateur moves ends the route with \"No opponent moves found.\"", async () => {
    const { lines } = await captureLog(() => generateRepertoire(START_FEN, {
      repertoireId, ...common,
      fetchDatabases: (async () => [empty, empty, empty]) as any
    }));
    assert.ok(lines.includes("No opponent moves found."));
    assert.equal(await prisma.repertoireMove.count({ where: { repertoireId } }), 0);
    const root = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, history: "" } });
    assert.equal(root.unaccountedDropped, 0);
  });

  it("EX.05: the Amateur shortfall goes to the node's unaccountedDropped; moveProb uses the position's total", async () => {
    const amateur = {
      moves: [
        { san: "e4", uci: "e2e4", games: 40, white: 20, draws: 10, black: 10 },
        { san: "d4", uci: "d2d4", games: 30, white: 15, draws: 8, black: 7 }
      ],
      totalGames: 70, positionTotalGames: 100, unaccountedShare: 0.3, opening: null
    };
    const fenAfter = (san: string) => { const chess = new Chess(); chess.move(san); return chess.fen(); };
    const replies = new Map([[fenAfter("e4"), "c7c5"], [fenAfter("d4"), "d7d5"]]);
    const responseEvaluator = async (fen: string, chess: Chess) => {
      const uci = replies.get(fen);
      if (!uci) throw new Error(`Unexpected evaluator FEN ${fen}`);
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
      chess.undo();
      // S3.12: every Black response must be deepVerified, which needs local Stockfish evidence.
      await saveLocalEngineBaseline(fen, "test-local", { uci, cp: -10, mate: null });
      return {
        selectedUci: uci, selectedMoveSan: move.san, cp: -10, mate: null,
        source: "ChessDB" as const, selectionMethod: "Ordinary API" as const, moveOrigin: "Human Move" as const,
        deepVerified: true, localEvaluationProfile: "test-local",
        selectedStats: { weightedGames: 30, blackScore: 0.5 }, candidateMoves: [], enginePvs: [],
        evalSource: "ChessDB" as const, selectedEngineCp: -10, selectedMate: null,
        openingMetadata: null, openingMetadataRetrieval: "FRESH" as const
      };
    };

    await captureLog(() => generateRepertoire(START_FEN, {
      repertoireId, ...common,
      responseEvaluator: responseEvaluator as any,
      fetchDatabases: (async (fen: string) => fen === START_FEN ? [empty, empty, amateur] : [empty, empty, empty]) as any
    }));

    const root = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, history: "" } });
    assert.ok(Math.abs(root.unaccountedDropped - 0.3) < defaultConfig.probabilityTolerance);
    const edges = await prisma.repertoireMove.findMany({ where: { fromNodeId: root.id, playerTurn: "OPPONENT" }, orderBy: { uci: "asc" } });
    assert.deepEqual(edges.map(edge => [edge.uci, edge.moveProb]), [["d2d4", 0.3], ["e2e4", 0.4]]);
  });
});
