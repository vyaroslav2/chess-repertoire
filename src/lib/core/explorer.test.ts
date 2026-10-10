import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Chess } from "chess.js";
import { prisma, readExplorerCache } from "../db/operations";
import { checkExplorerGameCounts, fetchExplorer } from "../api/lichess";
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
    const { result, lines } = await captureLog(async () => checkExplorerGameCounts(20, 20));
    assert.equal(result, 0);
    assert.deepEqual(lines, []);
  });

  it("EX.05: a shortfall warns and returns the missing share", async () => {
    const { result, lines } = await captureLog(async () => checkExplorerGameCounts(17, 20));
    assert.equal(result, 3 / 20);
    assert.deepEqual(lines, [shortfallWarning]);
  });

  it("EX.05: more games than the position's total is a hard error", () => {
    assert.throws(
      () => checkExplorerGameCounts(21, 20),
      { message: "Explorer move counts are more than the position's total games. Dataset: Amateur. Moves: 21 games. Position: 20 games." }
    );
  });
});

describe("EX.05 fetch and cache", () => {
  beforeEach(async () => { await prisma.positionCache.deleteMany({ where: { positionKey: START_KEY } }); });
  afterEach(async () => { await prisma.positionCache.deleteMany({ where: { positionKey: START_KEY } }); });

  const shortBody = { white: 12, draws: 5, black: 3, moves: [{ san: "e4", white: 10, draws: 5, black: 2 }] };

  it("EX.05: the Amateur shortfall is returned on a fresh fetch and on a cache hit", async () => {
    const fresh = await captureLog(() => withFetch(shortBody, () => fetchExplorer(START_FEN)));
    assert.equal(fresh.result.retrieval, "FRESH");
    assert.equal(fresh.result.unaccountedShare, 3 / 20);
    assert.ok(fresh.lines.includes(shortfallWarning));

    const cached = await captureLog(() => fetchExplorer(START_FEN));
    assert.equal(cached.result.retrieval, "CACHE");
    assert.equal(cached.result.unaccountedShare, 3 / 20);
    assert.ok(cached.lines.includes(shortfallWarning));
  });

  it("EX: only the Amateur dataset is asked for", async () => {
    const urls: string[] = [];
    const original = global.fetch;
    global.fetch = (async (url: string) => { urls.push(String(url)); return new Response(JSON.stringify(shortBody)); }) as typeof fetch;
    try { await captureLog(() => fetchExplorer(START_FEN)); } finally { global.fetch = original; }
    assert.equal(urls.length, 1);
    assert.match(urls[0], /^https:\/\/explorer\.lichess\.ovh\/lichess\?/);
    assert.match(urls[0], /speeds=classical,rapid&ratings=1600,1800,2000$/);
  });

  it("EX.05: more move games than the position's total throws and caches nothing", async () => {
    const body = { white: 1, draws: 0, black: 0, moves: [{ san: "e4", white: 10, draws: 5, black: 2 }] };
    await assert.rejects(withFetch(body, () => fetchExplorer(START_FEN)), /more than the position's total games/);
    const profile = computeExplorerCacheProfile(defaultConfig);
    assert.equal((await readExplorerCache(START_KEY, profile)).status, "missing");
  });

  it("EX.05: a response without the position's totals is malformed", async () => {
    await assert.rejects(
      withFetch({ moves: [] }, () => fetchExplorer(START_FEN)),
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
      fetchDatabases: (async () => empty) as any
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
      return {
        selectedUci: uci, selectedMoveSan: move.san, cp: -10, mate: null,
        source: "Local Stockfish 19" as const, selectionMethod: "Baseline" as const, moveOrigin: "Engine Move" as const,
        engineRank: 1
      };
    };

    await captureLog(() => generateRepertoire(START_FEN, {
      repertoireId, ...common,
      responseEvaluator: responseEvaluator as any,
      fetchDatabases: (async (fen: string) => fen === START_FEN ? amateur : empty) as any
    }));

    const root = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, history: "" } });
    assert.ok(Math.abs(root.unaccountedDropped - 0.3) < defaultConfig.probabilityTolerance);
    const edges = await prisma.repertoireMove.findMany({ where: { fromNodeId: root.id, playerTurn: "OPPONENT" }, orderBy: { uci: "asc" } });
    assert.deepEqual(edges.map(edge => [edge.uci, edge.moveProb]), [["d2d4", 0.3], ["e2e4", 0.4]]);
  });

  it("DB.06 rule 4: EW does not ask Explorer, so the position after White's move is fetched for its name only", async () => {
    const afterE4 = (() => { const chess = new Chess(); chess.move("e4"); return chess.fen(); })();
    const amateur = {
      moves: [{ san: "e4", uci: "e2e4", games: 100, white: 50, draws: 25, black: 25 }],
      totalGames: 100, positionTotalGames: 100, unaccountedShare: 0, opening: null
    };
    const named: string[] = [];
    const responseEvaluator = async (_fen: string, chess: Chess) => {
      const move = chess.move("c5");
      chess.undo();
      return {
        selectedUci: move.lan, selectedMoveSan: move.san, cp: 30, mate: null,
        source: "Local Stockfish 19" as const, selectionMethod: "Baseline" as const, moveOrigin: "Engine Move" as const,
        engineRank: 1
      };
    };

    await captureLog(() => generateRepertoire(START_FEN, {
      repertoireId, ...common,
      fetchOpeningMetadata: async (fen: string) => {
        named.push(fen);
        return fen === afterE4 ? { eco: "B00", name: "King's Pawn Game" } : null;
      },
      responseEvaluator: responseEvaluator as any,
      fetchDatabases: (async (fen: string) => fen === START_FEN ? amateur : empty) as any
    }));

    assert.ok(named.includes(afterE4));
    const node = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId, history: "e2e4" } });
    assert.deepEqual([node.openingMetadataStatus, node.eco, node.openingName], ["PRESENT", "B00", "King's Pawn Game"]);
  });
});
