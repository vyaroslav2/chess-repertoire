import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { prisma, validateResponsePersistence } from "../db/operations";
import { defaultConfig, type Config } from "./config";
import { evaluateBlackMove } from "./evaluator";
import { parseFullFen } from "./fen";
import { generateRepertoire } from "./generator";
import { parseSelectorSearch, type LocalSearchRunner, type SelectorSearchRunner } from "./local-engine";
import { selectorK } from "./selector-evidence";

const START_FEN = new Chess().fen();
const boardAndTurn = (fen: string) => fen.split(" ").slice(0, 2).join(" ");
const play = (...sans: string[]) => { const chess = new Chess(); for (const san of sans) chess.move(san); return chess; };
const fenAfter = (...sans: string[]) => parseFullFen(play(...sans).fen());
const on: Config = { ...defaultConfig, humanEvidence: true, depthCap: 3 };

async function captureLog<T>(run: () => Promise<T>): Promise<{ result?: T; error?: Error; lines: string[] }> {
  const lines: string[] = [];
  const original = { log: console.log, warn: console.warn };
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  console.warn = console.log;
  try { return { result: await run(), lines }; }
  catch (error) { return { error: error as Error, lines }; }
  finally { console.log = original.log; console.warn = original.warn; }
}

describe("HEG the selector in the generator", () => {
  it("HEG.21 the 2M read is HE's: the last exact line, the stop line included, from White's view", () => {
    const fen = fenAfter("d4", "d5", "c4");
    const lines = [
      "info depth 19 seldepth 25 multipv 1 score cp 20 nodes 1500000 pv e7e6 b1c3",
      "info depth 20 seldepth 26 multipv 1 score cp 25 lowerbound nodes 1900000 pv e7e6",
      // The stop line: at the node limit, no bound mark. EW.09 drops it; HE keeps it.
      "info depth 20 seldepth 27 multipv 1 score cp 18 nodes 2000000 pv e7e6 g1f3",
      "bestmove e7e6 ponder g1f3"
    ];
    assert.deepEqual(parseSelectorSearch(lines, fen, "e7e6"), { cp: -18, mate: null, depth: 20 });
    assert.throws(() => parseSelectorSearch(lines, fen, "c7c6"), /requested root move/);
  });

  it("HEG.23 k follows the Explorer trend, and moves outside 2–15 take its nearest end", () => {
    assert.ok(Math.abs(selectorK(2) - 264.9) < 0.1);
    assert.ok(Math.abs(selectorK(8) - 122.5) < 0.5);
    assert.equal(selectorK(1), selectorK(2));
    assert.equal(selectorK(20), selectorK(15));
  });

  it("HEG.40 a switch carries Human evidence, Human Move, its evidence and no engineRank", () => {
    const input = { fromNodeId: "a", toNodeId: "b", uci: "c7c6", cp: 10, mate: null, source: "Local Stockfish 19" as const };
    const selector = { championSan: "e6", championCp2M: 20, lineCpSpent: 10, judged: "{}",
      chosen: { cp2M: 25, cpLoss: 10, games: 100, score: 0.6, safeGain: 0.02 } };
    assert.doesNotThrow(() => validateResponsePersistence({ ...input, selectionMethod: "Human evidence", moveOrigin: "Human Move", engineRank: null, selector }));
    assert.throws(() => validateResponsePersistence({ ...input, selectionMethod: "Human evidence", moveOrigin: "Engine Move", engineRank: null, selector }), /go together/);
    assert.throws(() => validateResponsePersistence({ ...input, selectionMethod: "Human evidence", moveOrigin: "Human Move", engineRank: 1, selector }), /evidence and no engineRank/);
    assert.throws(() => validateResponsePersistence({ ...input, selectionMethod: "Baseline", moveOrigin: "Engine Move", engineRank: 1, selector }), /only a switch/);
    assert.doesNotThrow(() => validateResponsePersistence({ ...input, selectionMethod: "Baseline", moveOrigin: "Engine Move", engineRank: 1,
      selector: { ...selector, chosen: null } }));
  });

  describe("a run", () => {
    let userId: string;
    let repertoireId: string;
    beforeEach(async () => {
      await prisma.engineCache.deleteMany({});
      const user = await prisma.user.create({ data: { username: `heg_${Date.now()}` } });
      userId = user.id;
      repertoireId = (await prisma.repertoire.create({ data: { title: "HEG", color: "black", userId } })).id;
    });
    afterEach(async () => {
      await prisma.repertoire.deleteMany({ where: { id: repertoireId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    });

    // White plays one move each time: 1. d4, 2. c4, 3. Nf3. Black's first move is hardcoded (d5).
    const whiteMoves: Record<string, string> = {
      [boardAndTurn(START_FEN)]: "d4", [boardAndTurn(fenAfter("d4", "d5"))]: "c4", [boardAndTurn(fenAfter("d4", "d5", "c4", "c6"))]: "Nf3"
    };
    const empty = { moves: [], totalGames: 0, positionTotalGames: 0, unaccountedShare: 0, opening: null };
    const fetchDatabases = (async (fen: string) => {
      const san = whiteMoves[boardAndTurn(fen)];
      if (!san) return empty;
      const played = new Chess(fen).move(san);
      return { moves: [{ san, uci: played.lan, games: 1000, white: 400, draws: 200, black: 400 }],
        totalGames: 1000, positionTotalGames: 1000, unaccountedShare: 0, opening: null };
    }) as any;
    const common = {
      fetchOpeningMetadata: async () => null,
      ensureNodeWikibooks: (async () => ({ status: "CACHED", text: null })) as any,
      wait: async () => undefined
    };

    // 200M (EW.09, EW.11, HEG.32), White's view. Black to move: its top move. White to move: any legal move.
    const deep: Record<string, [string, number]> = {
      [fenAfter("d4")]: ["d5", 30], [fenAfter("d4", "d5")]: ["a3", 30],
      [fenAfter("d4", "d5", "c4")]: ["e6", 30], [fenAfter("d4", "d5", "c4", "e6")]: ["a3", 30],
      [fenAfter("d4", "d5", "c4", "c6")]: ["a3", 60],                         // c6 gives up 30 cp
      [fenAfter("d4", "d5", "c4", "c6", "Nf3")]: ["Nf6", 40],
      [fenAfter("d4", "d5", "c4", "c6", "Nf3", "Nf6")]: ["a3", 40],
      [fenAfter("d4", "d5", "c4", "c6", "Nf3", "e6")]: ["a3", 65]             // e6 would give up 25 cp
    };
    const localSearchRunner: LocalSearchRunner = async fen => {
      const [san, cp] = deep[fen] ?? (() => { throw new Error(`no fake 200M search for ${fen}`); })();
      const move = new Chess(fen).move(san);
      return { uci: move.lan, san: move.san, cp, mate: null, depth: 40 };
    };
    // 2M (HEG.21), White's view, keyed by position and move.
    const shallow: Record<string, number> = { "2 e7e6": 30, "2 c7c6": 35, "3 g8f6": 40, "3 e7e6": 45 };
    const selectorSearches: string[] = [];
    const selectorSearchRunner: SelectorSearchRunner = async (fen, uci, settings) => {
      assert.deepEqual(settings, { nodes: 2_000_000, hashMb: 64 });
      selectorSearches.push(uci);
      const cp = shallow[fen.split(" ")[5] + " " + uci];
      if (cp === undefined) throw new Error(`no fake 2M search for ${uci} at ${fen}`);
      return { cp, mate: null, depth: 20 };
    };
    // Counts for selectorMonths: the champion scores 50% on 10,000 games, the contender 60%.
    const record = (san: string, games: number, score: number) => ({ uci: "", san, white: games * (1 - score), draws: 0, black: games * score });
    const counts: Record<string, ReturnType<typeof record>[]> = {
      [boardAndTurn(fenAfter("d4", "d5", "c4"))]: [record("e6", 10_000, 0.5), record("c6", 10_000, 0.6)],
      [boardAndTurn(fenAfter("d4", "d5", "c4", "c6", "Nf3"))]: [record("Nf6", 10_000, 0.5), record("e6", 10_000, 0.6)]
    };
    const countsAsked: string[] = [];
    const fetchSelectorCounts = async (fen: string) => { countsAsked.push(fen); return { moves: counts[boardAndTurn(fen)] ?? [] }; };
    const responseEvaluator = ((fen: string, chess: Chess, history: string[], dependencies: object) =>
      evaluateBlackMove(fen, chess, history, { ...dependencies, localSearchRunner, selectorSearchRunner, fetchSelectorCounts })) as any;

    const responseAfter = (route: string) => prisma.repertoireMove.findFirstOrThrow({
      where: { repertoireId, playerTurn: "RESPONSE", fromNode: { displayPgn: route } } });

    it("HEG.10–11 HEG.31 HEG.40–41 a switch is built on and recorded; the line budget blocks a second; the hardcoded move is never judged", async () => {
      countsAsked.length = 0;
      selectorSearches.length = 0;
      const log = await captureLog(() => generateRepertoire(START_FEN, { repertoireId, ...common, fetchDatabases, responseEvaluator, config: on }));
      if (log.error) throw log.error;

      const first = await responseAfter("d4");
      assert.deepEqual([first.san, first.selectionMethod, first.championSan, first.lineCpSpent], ["d5", "Hardcoded", null, null]);

      const switched = await responseAfter("d4 d5 c4");
      assert.deepEqual([switched.san, switched.selectionMethod, switched.moveOrigin, switched.engineRank], ["c6", "Human evidence", "Human Move", null]);
      assert.deepEqual([switched.championSan, switched.championCp2M, switched.chosenCp2M, switched.selectorCpLoss, switched.selectorGames, switched.selectorScore, switched.lineCpSpent],
        ["e6", 30, 35, 30, 10_000, 0.6, 30]);
      assert.ok(switched.safeGain! > on.selectorMargin);
      assert.equal(switched.cp, 60, "the stored eval is the 200M search of the chosen move (EW.11)");
      const judged = JSON.parse(switched.selectorJudged!);
      assert.deepEqual(judged.judged.map((move: { san: string; verdict: string }) => [move.san, move.verdict]), [["c6", "passes"]]);

      // 30 cp spent of 50: e6 (25 cp) passes the 30 cp limit but not the 20 cp left.
      const kept = await responseAfter("d4 d5 c4 c6 Nf3");
      assert.deepEqual([kept.san, kept.selectionMethod, kept.engineRank, kept.lineCpSpent], ["Nf6", "Baseline", 1, 30]);
      assert.deepEqual(JSON.parse(kept.selectorJudged!).judged.map((move: { san: string; verdict: string; cpLoss: number }) => [move.san, move.verdict, move.cpLoss]),
        [["e6", "cp-limit", 25]]);

      assert.deepEqual(countsAsked, [fenAfter("d4", "d5", "c4"), fenAfter("d4", "d5", "c4", "c6", "Nf3")], "the hardcoded first move fetches no counts");
      assert.deepEqual(selectorSearches, ["e7e6", "c7c6", "g8f6", "e7e6"]);
      assert.ok(log.lines.includes("[HUMAN EVIDENCE] route=d4 d5 c4; e6 -> c6; games=10000; score=60.0%; safeGain=" +
        (switched.safeGain! * 100).toFixed(1) + "; cpLoss=30; budget spent=30 of 50"));
      assert.ok(log.lines.some(line => line.startsWith("[JUDGED] route=d4 d5 c4 c6 Nf3; e6: cp-limit;")));
      assert.ok(log.lines.some(line => /^Human Evidence Switches: +1 \(/.test(line)));
    });

    it("HEG.50 off builds the tree as before: Stockfish's move, no counts, no 2M searches, no selector fields", async () => {
      countsAsked.length = 0;
      selectorSearches.length = 0;
      const log = await captureLog(() => generateRepertoire(START_FEN, { repertoireId, ...common, fetchDatabases, responseEvaluator,
        config: { ...on, humanEvidence: false } }));
      if (log.error) throw log.error;
      const kept = await responseAfter("d4 d5 c4");
      assert.deepEqual([kept.san, kept.selectionMethod, kept.championSan, kept.lineCpSpent, kept.selectorJudged], ["e6", "Baseline", null, null, null]);
      assert.deepEqual([countsAsked.length, selectorSearches.length], [0, 0]);
      assert.ok(!log.lines.some(line => line.startsWith("[HUMAN EVIDENCE]") || line.startsWith("Human Evidence")));
    });
  });
});
