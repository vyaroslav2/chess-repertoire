import { Chess } from "chess.js";
import {
  getOrCreateLocalBaseline,
  getOrCreateSelectorEval,
  runSelectorSearch,
  runTrustedLocalSearch,
  type LocalSearchRunner,
  type SelectorSearchRunner
} from "./local-engine";
import { parseFullFen, positionKeyFromFen } from "./fen";
import { defaultConfig, type Config } from "./config";
import { choose, games, judge, score, scoreDraws, type Dials, type Judged, type Record3 } from "./selector";
import { selectorCurve, selectorK } from "./selector-evidence";
import { fetchSelectorCounts as fetchSelectorCountsFromLichess } from "../api/lichess";
import type { ResponseEvaluationSource, ResponseMoveOrigin, ResponseSelectionMethod } from "../db/operations";

/** HM.03: a move's share of the position's games, and its Amateur results. */
export function whiteMoveStats(moveSan: string, amateurList: any[], totalAmateurGames: number) {
    const amateurData = amateurList.find(m => m.san === moveSan) || { games: 0, white: 0, draws: 0, black: 0 };
    const amateurGames = amateurData.games ?? (amateurData.white + amateurData.draws + amateurData.black);
    const probability = totalAmateurGames > 0 ? amateurGames / totalAmateurGames : 0;

    return {
      probability,
      amateurGames,
      amateurWhiteWins: amateurData.white,
      amateurDraws: amateurData.draws,
      amateurBlackWins: amateurData.black
    };
}

// HM.04: every returned move is kept, however rare; too rare is decided per move, after transposition (HM.21).
// HM.05: most popular first, ties alphabetically by SAN.
export function selectWhiteCandidates(amateurList: any[], totalAmateurGames: number) {
  return amateurList
    .map(move => ({
      san: move.san,
      ...whiteMoveStats(move.san, amateurList, totalAmateurGames)
    }))
    .sort((a, b) => b.probability - a.probability || a.san.localeCompare(b.san));
}

/**
 * EW.13: Black's move from the first `hardcodedBlackResponses` line that the route
 * follows up to and including White's last move. The match is on the route, not the position.
 */
export function findHardcodedResponse(routeSan: readonly string[], lines: readonly string[]): string | null {
  if (routeSan.length % 2 === 0) return null; // the route must end with White's move
  for (const line of lines) {
    const moves = line.replace(/\d+\.+/g, " ").split(/\s+/)
      .filter(move => move !== "" && !["1-0", "0-1", "1/2-1/2", "*"].includes(move));
    if (moves.length > routeSan.length && routeSan.every((san, index) => san === moves[index])) {
      return moves[routeSan.length];
    }
  }
  return null;
}

export type EvaluateBlackMoveDependencies = {
  localSearchRunner?: LocalSearchRunner;
  /** HEG: the run's config; a run passes its runtime config, which is defaultConfig. */
  config?: Config;
  /** HEG.31: the cp the switches earlier on this route gave up between them. */
  lineCpSpent?: number;
  selectorSearchRunner?: SelectorSearchRunner;
  fetchSelectorCounts?: (fen: string, config: Config) => Promise<{ moves: { uci: string; san: string; white: number; draws: number; black: number }[] }>;
};

/** HEG.40: what the selector did at this position, stored on Black's move. */
export type SelectorRecord = {
  moveNumber: number;
  k: number;
  championSan: string;
  championGames: number;
  championScore: number | null;
  /** The champion's 2M eval (HEG.21); null when the selector stopped before searching it. */
  championCp2M: number | null;
  /** Why nothing was judged: no games for these months, or a mate score (HES.10, HES.11). */
  skipped?: "no-games" | "mate";
  judged: Judged[];
  /** The switch, if any: the chosen move's 2M eval, its 200M cp loss, games, score and safe gain. */
  chosen: { san: string; cp2M: number; cpLoss: number; games: number; score: number; safeGain: number } | null;
  /** HEG.31: the route's spend after this move. */
  lineCpSpent: number;
  /** 2M searches made here, not read from the cache. */
  searches: number;
};

export type SelectedResponseResult = {
  selectedUci: string;
  selectedMoveSan: string;
  cp: number | null;
  mate: number | null;
  /** DB.11: the depth of the search behind cp or mate; null for checkmate, stalemate or an old cached eval. */
  depth: number | null;
  source: ResponseEvaluationSource;
  selectionMethod: ResponseSelectionMethod;
  moveOrigin: ResponseMoveOrigin;
  /** DB.14: 1 if the move is Stockfish's baseline, otherwise null. */
  engineRank: number | null;
  /** DB.11, HM.09: EW.09's eval of this position, which is the eval of the White move that reached it. */
  baselineCp: number | null;
  baselineMate: number | null;
  baselineDepth: number | null;
  /** HEG.40: null when `humanEvidence` is off or a hardcoded move applies. */
  selector?: SelectorRecord | null;
};

function legalSan(chess: Chess, uci: string): string {
  let move;
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length === 5 ? uci[4] : undefined });
  } catch {
    throw new Error(`Engine move '${uci}' is illegal in this position.`);
  }
  if (!move || move.lan !== uci) throw new Error(`Engine move '${uci}' is illegal in this position.`);
  chess.undo();
  return move.san;
}

/**
 * EW.11, DB.11: the eval of Black's move is the eval of the position it reaches, White to move.
 * Checkmate and stalemate leave nothing to search.
 */
async function evaluateBlackMoveResult(
  chess: Chess,
  uci: string,
  runner: LocalSearchRunner,
  config: Config = defaultConfig
): Promise<{ cp: number | null; mate: number | null; depth: number | null }> {
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length === 5 ? uci[4] : undefined });
  const afterFen = parseFullFen(chess.fen());
  const checkmate = chess.isCheckmate();
  const stalemate = chess.isStalemate();
  chess.undo();
  if (checkmate) return { cp: null, mate: -1, depth: null };
  if (stalemate) return { cp: 0, mate: null, depth: null };
  const { cp, mate, depth } = (await getOrCreateLocalBaseline(afterFen, config, runner)).evaluation;
  return { cp, mate, depth };
}

/**
 * HEG.11: the selector at one position. The champion is Stockfish's move (EW.09). Each other move
 * with games is judged as HES does, with its cp loss measured at 200M (HEG.32) and allowed no more
 * than the cp limit or what the route's budget has left (HEG.31).
 */
async function runSelector(input: {
  fullFen: string;
  chess: Chess;
  baseline: { uci: string; san: string; cp: number | null; mate: number | null };
  config: Config;
  lineCpSpent: number;
  runner: LocalSearchRunner;
  selectorRunner: SelectorSearchRunner;
  fetchCounts: NonNullable<EvaluateBlackMoveDependencies["fetchSelectorCounts"]>;
}): Promise<SelectorRecord> {
  const { fullFen, chess, baseline, config, lineCpSpent } = input;
  const moveNumber = Number(fullFen.split(" ")[5]);
  const k = selectorK(moveNumber);
  const dials: Dials = { confidence: config.selectorConfidence, margin: config.selectorMargin, cpLimit: config.selectorCpLimit,
    draws: config.selectorDraws, nearTie: config.selectorNearTie };
  const counts = await input.fetchCounts(fullFen, config);
  // Explorer names castling e8h8; its SAN gives the move as the tree and the engine name it.
  const moves = counts.moves.map(move => {
    const played = chess.move(move.san);
    chess.undo();
    return { uci: played.lan, san: played.san, record: { wins: move.black, draws: move.draws, losses: move.white } as Record3 };
  });
  const championRecord = moves.find(move => move.uci === baseline.uci)?.record ?? { wins: 0, draws: 0, losses: 0 };
  const base = { moveNumber, k, championSan: baseline.san, championGames: games(championRecord),
    championScore: games(championRecord) ? score(championRecord) : null, judged: [] as Judged[], chosen: null, lineCpSpent };
  if (!moves.some(move => games(move.record))) return { ...base, championCp2M: null, skipped: "no-games", searches: 0 };

  let searches = 0;
  const eval2M = async (uci: string) => {
    const evaluation = await getOrCreateSelectorEval(fullFen, uci, config, input.selectorRunner);
    if (!evaluation.reused) searches++;
    return { cpWhite: evaluation.cp, mateWhite: evaluation.mate };
  };
  const championEval = await eval2M(baseline.uci);
  if (championEval.cpWhite === null || baseline.cp === null) {
    return { ...base, championCp2M: championEval.cpWhite, skipped: "mate", searches };
  }
  const seed = "select:" + positionKeyFromFen(parseFullFen(fullFen));
  const champion = { cpWhite: championEval.cpWhite,
    draws: scoreDraws(selectorCurve, championEval.cpWhite, k, championRecord, dials.draws, seed + ":" + baseline.uci) };
  const cpAllowed = Math.min(config.selectorCpLimit, config.selectorLineBudget - lineCpSpent);
  const judged: Judged[] = [];
  for (const move of moves) {
    if (move.uci === baseline.uci || !games(move.record)) continue;
    judged.push(await judge(move, champion, selectorCurve, k, dials, seed + ":" + move.uci, () => eval2M(move.uci), {
      cpAllowed,
      // HEG.32: against EW.09's eval, from the generator's own search of the position the move reaches.
      cpLoss: async () => {
        const after = await evaluateBlackMoveResult(chess, move.uci, input.runner, config);
        return after.cp === null ? null : after.cp - baseline.cp!;
      }
    }));
  }
  const winner = choose(judged, dials);
  return { ...base, championCp2M: championEval.cpWhite, judged, searches,
    chosen: winner ? { san: winner.san, cp2M: winner.cpWhite!, cpLoss: winner.cpLoss!, games: winner.games, score: winner.score,
      safeGain: winner.safeGain! } : null,
    // Only losses spend the budget (HEG.31).
    lineCpSpent: winner ? lineCpSpent + Math.max(0, winner.cpLoss!) : lineCpSpent };
}

/**
 * EW: Black's move is local Stockfish's top move (EW.09), unless a hardcoded response applies (EW.13),
 * or, with `humanEvidence` on, the selector finds a better-scoring human move (HEG.10).
 */
export async function evaluateBlackMove(
  fen: string,
  chess: Chess,
  previousMovesSan: string[],
  dependencies: EvaluateBlackMoveDependencies = {}
): Promise<SelectedResponseResult> {
  const fullFen = parseFullFen(fen);
  const config = dependencies.config ?? defaultConfig;
  const runner = dependencies.localSearchRunner ?? runTrustedLocalSearch;
  const baseline = (await getOrCreateLocalBaseline(fullFen, config, runner)).evaluation;

  // EW.13: a hardcoded response. Stockfish never rejects it.
  const hardcodedSan = findHardcodedResponse(previousMovesSan, config.hardcodedBlackResponses);
  let uci = baseline.uci;
  if (hardcodedSan !== null) {
    let hardcodedMove;
    try { hardcodedMove = chess.move(hardcodedSan); } catch { hardcodedMove = null; }
    if (!hardcodedMove) throw new Error(`Hardcoded response ${hardcodedSan} is illegal after ${previousMovesSan.join(" ")}`);
    chess.undo();
    uci = hardcodedMove.lan;
  }
  // HEG.10: a hardcoded move wins, and Black's first move is never judged (HES.10).
  let selector: SelectorRecord | null = null;
  if (config.humanEvidence && hardcodedSan === null && Number(fullFen.split(" ")[5]) > 1) {
    selector = await runSelector({ fullFen, chess, baseline: { ...baseline, san: legalSan(chess, baseline.uci) }, config,
      lineCpSpent: dependencies.lineCpSpent ?? 0, runner,
      selectorRunner: dependencies.selectorSearchRunner ?? runSelectorSearch,
      fetchCounts: dependencies.fetchSelectorCounts ?? fetchSelectorCountsFromLichess });
    if (selector.chosen) uci = selector.judged.find(move => move.san === selector!.chosen!.san)!.uci;
  }
  const selectedMoveSan = legalSan(chess, uci);
  const evaluation = await evaluateBlackMoveResult(chess, uci, runner, config);

  // EW.12: exactly one of cp or mate.
  if ((evaluation.cp === null) === (evaluation.mate === null)) {
    throw new Error(`Chosen Black move ${uci} must carry exactly one of cp or mate at ${fullFen}`);
  }
  // EW.10: what is recorded on the move.
  return {
    selectedUci: uci,
    selectedMoveSan,
    cp: evaluation.cp,
    mate: evaluation.mate,
    depth: evaluation.depth,
    source: "Local Stockfish 19",
    selectionMethod: hardcodedSan !== null ? "Hardcoded" : selector?.chosen ? "Human evidence" : "Baseline",
    moveOrigin: hardcodedSan !== null ? "Hardcoded Move" : selector?.chosen ? "Human Move" : "Engine Move",
    engineRank: uci === baseline.uci ? 1 : null,
    baselineCp: baseline.cp,
    baselineMate: baseline.mate,
    baselineDepth: baseline.depth,
    ...(selector ? { selector } : {})
  };
}
