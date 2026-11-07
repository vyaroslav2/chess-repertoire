// TGL: a small made-up run that shows every block of the tree log: White's moves, too rare, each kind
// of Black reply, the selector's table, cached searches, a transposition's cascade, the endings and a sweep.
import type { RepertoireMove, RepertoireNode } from "@prisma/client";
import { Chess } from "chess.js";
import { defaultConfig } from "../src/lib/core/config";
import type { RunEvent, SearchFact } from "../src/lib/core/run-events";
import { replayEvents, type EngineBest, type ExplorerPosition, type TreeLogInput } from "./tree_log";

type WhiteOptions = { transposesTo?: string };
type ReplyOptions = {
  method: "Baseline" | "Hardcoded" | "Human evidence";
  cp: number;
  baseline?: { san: string; cp: number };
  stopReason?: string;
  // Both searches came from the cache.
  cached?: boolean;
  selector?: { championSan: string; championCp2M: number; championGames: number; championScore: number; lineCpSpent?: number;
    skipped?: string; judged?: { san: string; games: number; score: number; verdict: string; cpWhite?: number; cpLoss?: number; safeGain?: number }[] };
};

export function mockTreeLogInput(): TreeLogInput {
  // A depth cap of 3, so the small tree shows the ending.
  const config = { ...defaultConfig, humanEvidence: true, depthCap: 3 };
  const nodes = new Map<string, RepertoireNode>();
  const moves: RepertoireMove[] = [];
  const explorerByPositionKey = new Map<string, ExplorerPosition>();
  const engineBestByFullFen = new Map<string, EngineBest>();
  const searchSecondsByFullFen = new Map<string, number>();
  const cachedFens = new Set<string>();
  const cascadeGains = new Map<string, number>();

  // A made-up 200M search of a position: stores its time, returns its depth.
  let searches = 0;
  const search = (fullFen: string) => {
    searches++;
    searchSecondsByFullFen.set(fullFen, 95 + (searches * 37) % 80);
    return 44 + (searches * 5) % 9;
  };

  // A node's id is its route; its FEN comes from playing the route.
  const play = (route: string) => {
    const chess = new Chess();
    for (const san of route.split(" ").filter(Boolean)) chess.move(san);
    return chess;
  };
  const uciOf = (route: string, san: string) => {
    const move = play(route).move(san);
    return `${move.from}${move.to}${move.promotion ?? ""}`;
  };
  const node = (route: string, cumProb: number, extra: Partial<RepertoireNode> = {}) => {
    const fullFen = play(route).fen();
    const created: RepertoireNode = {
      id: route, repertoireId: "mock", positionKey: fullFen.split(" ").slice(0, 4).join(" "), fullFen, history: route, displayPgn: route,
      routeProb: cumProb, cumProb, rareDropped: 0, unaccountedDropped: 0, transposesTo: null, eco: null, openingName: null,
      openingMetadataStatus: null, wikibooksChecked: false, wikiText: null, siblingIndex: null, ...extra
    };
    nodes.set(route, created);
    return created;
  };
  const move = (from: string, to: string, san: string, extra: Partial<RepertoireMove>): RepertoireMove => {
    const created: RepertoireMove = {
      id: `${from}>${san}`, repertoireId: "mock", fromNodeId: from, toNodeId: to, san, uci: uciOf(from, san), playerTurn: "OPPONENT",
      moveProb: null, stopReason: null, cp: null, mate: null, depth: null, source: "Local Stockfish 19", selectionMethod: null,
      moveOrigin: null, engineRank: null, championSan: null, championCp2M: null, chosenCp2M: null, selectorCpLoss: null,
      selectorGames: null, selectorScore: null, safeGain: null, lineCpSpent: null, selectorJudged: null, ...extra
    };
    moves.push(created);
    return created;
  };
  const join = (route: string, san: string) => `${route} ${san}`.trim();

  // White's moves at a position, as Explorer returned them. Too rare follows from minCumProb.
  const position = (route: string, total: number, candidates: [string, number, WhiteOptions?][]) => {
    const parent = nodes.get(route)!;
    explorerByPositionKey.set(parent.positionKey, { positionTotalGames: total, fetchedAt: new Date("2026-10-13T14:02:00"),
      moves: candidates.map(([san, games]) => ({ uci: uciOf(route, san), san, games })) });
    // TR.47: the games Explorer lists no move for.
    parent.unaccountedDropped = parent.cumProb * (1 - candidates.reduce((listed, [, games]) => listed + games / total, 0));
    for (const [san, games, options = {}] of candidates) {
      const share = games / total, arriving = parent.cumProb * share, to = join(route, san);
      if (options.transposesTo) {
        node(to, 0, { transposesTo: options.transposesTo });
        move(route, to, san, { moveProb: share, stopReason: "Transposition" });
        // TR.16, TR.22: the cascade: the owner and its reply gain what the move brought.
        cascadeGains.set(`${route}>${san}`, arriving);
        const owner = nodes.get(options.transposesTo)!;
        owner.cumProb += arriving;
        const ownerReply = moves.find(candidate => candidate.fromNodeId === owner.id);
        if (ownerReply) nodes.get(ownerReply.toNodeId!)!.cumProb += arriving;
      } else if (arriving < config.minCumProb) {
        node(to, 0, { rareDropped: arriving });
        move(route, to, san, { moveProb: share, stopReason: "Too rare" });
      } else {
        node(to, arriving);
        move(route, to, san, { moveProb: share });
      }
    }
  };
  const reply = (route: string, san: string, options: ReplyOptions) => {
    const parent = nodes.get(route)!, to = join(route, san);
    const baseline = options.baseline ?? { san, cp: options.cp };
    engineBestByFullFen.set(parent.fullFen, { san: baseline.san, uci: baseline.san, cp: baseline.cp, mate: null });
    const white = moves.find(candidate => candidate.toNodeId === route)!;
    white.cp = baseline.cp;
    white.depth = search(parent.fullFen);
    const after = node(to, parent.cumProb);
    if (options.cached) { cachedFens.add(parent.fullFen); cachedFens.add(after.fullFen); }
    const selector = options.selector;
    move(route, to, san, {
      playerTurn: "RESPONSE", cp: options.cp, depth: search(after.fullFen), selectionMethod: options.method, stopReason: options.stopReason ?? null,
      engineRank: options.method === "Baseline" ? 1 : null,
      ...(selector && {
        championSan: selector.championSan, championCp2M: selector.championCp2M, lineCpSpent: selector.lineCpSpent ?? null,
        selectorJudged: JSON.stringify({ championGames: selector.championGames, championScore: selector.championScore,
          skipped: selector.skipped ?? null, judged: selector.judged ?? [] })
      })
    });
  };

  node("", 1);
  // The real counts at the start position; the replies and evals are made up. For now, only the two hardcoded first moves.
  position("", 524_422_697, [["e4", 336_233_901], ["d4", 128_902_013]]);
  reply("e4", "c6", { method: "Hardcoded", cp: 38, baseline: { san: "e5", cp: 24 } });
  position("e4 c6", 24_859_937, [["d4", 12_249_147], ["Nf3", 6_498_654], ["Qh5", 24_011]]);
  reply("e4 c6 d4", "d5", { method: "Baseline", cp: 32, selector: {
    championSan: "d5", championCp2M: 28, championGames: 312_405, championScore: 0.462, lineCpSpent: 0, judged: [
      { san: "g6", games: 18_220, score: 0.451, verdict: "best-case" },
      { san: "e6", games: 9_874, score: 0.479, verdict: "safe-gain", cpWhite: 41, cpLoss: 13, safeGain: 0.003 }
    ] } });
  position("e4 c6 d4 d5", 12_200_413, [["e5", 5_297_822], ["exd5", 3_351_854], ["Nf3", 300_118], ["Bf4", 3_210]]);
  reply("e4 c6 d4 d5 e5", "Bf5", { method: "Baseline", cp: 35, stopReason: "Depth cap reached on Black's move", selector: {
    championSan: "Bf5", championCp2M: 31, championGames: 42_105, championScore: 0.471, lineCpSpent: 0, judged: [
      { san: "c5", games: 29_860, score: 0.488, verdict: "safe-gain", cpWhite: 44, cpLoss: 13, safeGain: 0.004 },
      { san: "e6", games: 1_204, score: 0.452, verdict: "best-case" }
    ] } });
  reply("e4 c6 d4 d5 Nf3", "dxe4", { method: "Baseline", cp: 27, stopReason: "Depth cap reached on Black's move", selector: {
    championSan: "dxe4", championCp2M: 24, championGames: 5_310, championScore: 0.468, lineCpSpent: 0, judged: [
      { san: "Bg4", games: 1_877, score: 0.455, verdict: "best-case" }
    ] } });
  reply("e4 c6 d4 d5 exd5", "cxd5", { method: "Baseline", cp: 20, stopReason: "Depth cap reached on Black's move", selector: {
    championSan: "cxd5", championCp2M: 19, championGames: 0, championScore: 0, skipped: "no-games" } });
  reply("e4 c6 Nf3", "d5", { method: "Human evidence", cp: 41, baseline: { san: "g6", cp: 34 }, selector: {
    championSan: "g6", championCp2M: 30, championGames: 8_140, championScore: 0.441, lineCpSpent: 7, judged: [
      { san: "d5", games: 96_512, score: 0.487, verdict: "passes", cpWhite: 35, cpLoss: 7, safeGain: 0.031 },
      { san: "d6", games: 4_203, score: 0.503, verdict: "cp-limit", cpWhite: 74, cpLoss: 44, safeGain: 0.018 }
    ] } });
  position("e4 c6 Nf3 d5", 2_480_115, [["exd5", 1_510_902], ["d4", 402_337, { transposesTo: "e4 c6 d4 d5 Nf3" }]]);
  reply("e4 c6 Nf3 d5 exd5", "cxd5", { method: "Baseline", cp: 30, stopReason: "Depth cap reached on Black's move", selector: {
    championSan: "cxd5", championCp2M: 28, championGames: 0, championScore: 0, skipped: "no-games" } });
  reply("d4", "d5", { method: "Hardcoded", cp: 18, baseline: { san: "Nf6", cp: 15 } });
  position("d4 d5", 8_990_442, [["c4", 4_017_920], ["Nf3", 1_994_018], ["Bf4", 1_690_331]]);
  reply("d4 d5 c4", "c6", { method: "Human evidence", cp: 29, baseline: { san: "e6", cp: 21 }, selector: {
    championSan: "e6", championCp2M: 25, championGames: 61_442, championScore: 0.452, lineCpSpent: 11, judged: [
      { san: "c6", games: 58_310, score: 0.493, verdict: "passes", cpWhite: 36, cpLoss: 11, safeGain: 0.039 },
      { san: "dxc4", games: 40_877, score: 0.471, verdict: "safe-gain", cpWhite: 40, cpLoss: 15, safeGain: 0.006 },
      { san: "Nc6", games: 3_118, score: 0.512, verdict: "cp-limit", cpWhite: 78, cpLoss: 53, safeGain: 0.021 }
    ] } });
  position("d4 d5 c4 c6", 9_000_000, [["Nf3", 3_900_000]]);
  reply("d4 d5 c4 c6 Nf3", "Nf6", { method: "Baseline", cp: 24, stopReason: "Depth cap reached on Black's move", selector: {
    championSan: "Nf6", championCp2M: 22, championGames: 0, championScore: 0, skipped: "no-games" } });
  reply("d4 d5 Bf4", "c5", { method: "Baseline", cp: 9, cached: true, stopReason: "No opponent moves found", selector: {
    championSan: "c5", championCp2M: 8, championGames: 0, championScore: 0, skipped: "no-games" } });
  reply("d4 d5 Nf3", "Nf6", { method: "Baseline", cp: 17, selector: {
    championSan: "Nf6", championCp2M: 17, championGames: 0, championScore: 0, skipped: "no-games" } });
  position("d4 d5 Nf3 Nf6", 2_000_000, [["c4", 1_100_000]]);
  reply("d4 d5 Nf3 Nf6 c4", "e6", { method: "Baseline", cp: 22, stopReason: "Depth cap reached on Black's move", selector: {
    championSan: "e6", championCp2M: 20, championGames: 0, championScore: 0, skipped: "no-games" } });

  // The tree's own replay, with made-up times and cascade facts put in, as a recording would have them.
  const nodeList = [...nodes.values()];
  const deep = (nodeId: string | null): SearchFact => {
    const { fullFen } = nodes.get(nodeId!)!;
    const reused = cachedFens.has(fullFen);
    return { fullFen, kind: "deep", seconds: reused ? 0 : searchSecondsByFullFen.get(fullFen) ?? 0, reused };
  };
  // What a node held at that moment: its route's share, until a cascade added to it.
  const cumProbNow = new Map(nodeList.map(({ id, routeProb }) => [id, routeProb]));
  let elapsed = 0;
  let cascades = 0;
  const recorded = replayEvents(nodeList, moves).map((event): RunEvent => {
    if (event.type === "position") return { ...event, elapsed, cumProb: cumProbNow.get(event.nodeId) };
    if (event.type === "transposition") {
      elapsed += 1;
      const gain = cascadeGains.get(event.whiteMoveId) ?? 0;
      const cascadeId = `C${String(++cascades).padStart(2, "0")}`;
      const pointer = moves.find(candidate => candidate.id === event.whiteMoveId)!.toNodeId!;
      const owner = nodes.get(pointer)!.transposesTo!;
      const ownerFrom = cumProbNow.get(owner)!;
      for (const reached of [owner, moves.find(candidate => candidate.fromNodeId === owner)?.toNodeId]) {
        if (reached) cumProbNow.set(reached, cumProbNow.get(reached)! + gain);
      }
      return { ...event, elapsed, cascade: { cascadeId, gain, ownerFrom, ownerTo: ownerFrom + gain, touched: 2, revisits: 0, refires: 0, duplicates: 0, tinyDroppedCounter: 1 } };
    }
    if (event.type !== "reply") return event;
    const white = moves.find(candidate => candidate.id === event.whiteMoveId)!;
    const black = moves.find(candidate => candidate.id === event.replyMoveId)!;
    const judged: { san: string; verdict: string; cpWhite?: number }[] = black.selectorJudged ? JSON.parse(black.selectorJudged).judged : [];
    const after = nodes.get(white.toNodeId!)!;
    const searched = judged.filter(move => move.cpWhite !== undefined);
    // The champion's 2M search too, unless nothing was judged. One of them came from the cache.
    const selectorSearches: SearchFact[] = judged.length === 0 ? [] : [...searched, {}].map((_, index) =>
      ({ fullFen: after.fullFen, kind: "selector", seconds: 2, reused: index === 0 }));
    // HEG.32: the 200M search of each move that passes safe gain. The winner's reply finds its own in the cache.
    const deepChecks: SearchFact[] = judged.filter(move => move.verdict === "passes" || move.verdict === "cp-limit").map(move =>
      ({ fullFen: play(join(after.id, move.san)).fen(), kind: "deep", seconds: 100, reused: false }));
    const replyFen = nodes.get(black.toNodeId!)!.fullFen;
    const replySearch: SearchFact = deepChecks.some(check => check.fullFen === replyFen) ? { fullFen: replyFen, kind: "deep", seconds: 0, reused: true } : deep(black.toNodeId);
    const selectorSeconds = black.selectorJudged && judged.length ? selectorSearches.length * 2 + deepChecks.length * 100 : black.selectorJudged ? 1 : null;
    const searches = [deep(white.toNodeId), ...selectorSearches, ...deepChecks, replySearch];
    elapsed += deep(white.toNodeId).seconds + (selectorSeconds ?? 0) + replySearch.seconds;
    return { ...event, elapsed, searches, selectorSeconds, cumProb: cumProbNow.get(after.id) };
  });
  const events: RunEvent[] = [
    { type: "run", repertoireId: "mock", startedAt: new Date(Date.now() - elapsed * 1000).toISOString(), config },
    ...recorded,
    { type: "sweep", number: 1, reopenedMoveIds: [], elapsed },
    { type: "end", elapsed, tinyDropped: 0 }
  ];

  return {
    repertoire: { title: "Mock repertoire", generationStatus: "IDLE" },
    nodes: nodeList, moves, explorerByPositionKey, engineBestByFullFen, events, recorded: true, config, printedAt: new Date()
  };
}
