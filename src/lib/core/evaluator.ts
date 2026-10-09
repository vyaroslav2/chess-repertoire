import { Chess } from "chess.js";
import {
  getOrCreateLocalBaseline,
  getOrCreateLocalCandidate,
  runTrustedLocalSearch,
  type LocalSearchRunner
} from "./local-engine";
import { parseFullFen } from "./fen";
import { defaultConfig, getMoveBand } from "./config";
import type { ResponseEvaluationSource, ResponseMoveOrigin, ResponseSelectionMethod } from "../db/operations";

export function shouldIncludeWhiteMove(moveSan: string, currentMoveNumber: number, amateurList: any[], totalAmateurGames: number) {
    const amateurData = amateurList.find(m => m.san === moveSan) || { games: 0, white: 0, draws: 0, black: 0 };
    const amateurGames = amateurData.games ?? (amateurData.white + amateurData.draws + amateurData.black);
    const probability = totalAmateurGames > 0 ? amateurGames / totalAmateurGames : 0;
    const band = getMoveBand(currentMoveNumber, defaultConfig);
    const requiredProbability = defaultConfig.popularityThresholds[band];
    const include = totalAmateurGames > 0 && probability >= requiredProbability;

    return {
      include,
      reason: include ? "Amateur popularity" : "",
      probability,
      amateurGames,
      amateurWhiteWins: amateurData.white,
      amateurDraws: amateurData.draws,
      amateurBlackWins: amateurData.black
    };
}

// HM.04: every returned move is kept in the list; `include` false marks a dropped move.
// HM.05: most popular first, ties alphabetically by SAN.
export function selectWhiteCandidates(currentMoveNumber: number, amateurList: any[], totalAmateurGames: number) {
  return amateurList
    .map(move => ({
      san: move.san,
      ...shouldIncludeWhiteMove(move.san, currentMoveNumber, amateurList, totalAmateurGames)
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
};

export type SelectedResponseResult = {
  selectedUci: string;
  selectedMoveSan: string;
  cp: number | null;
  mate: number | null;
  source: ResponseEvaluationSource;
  selectionMethod: ResponseSelectionMethod;
  moveOrigin: ResponseMoveOrigin;
  /** DB.14: 1 if the move is Stockfish's baseline, otherwise null. */
  engineRank: number | null;
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

/** EW: Black's move is local Stockfish's top move (EW.09), unless a hardcoded response applies (EW.13). */
export async function evaluateBlackMove(
  fen: string,
  chess: Chess,
  previousMovesSan: string[],
  dependencies: EvaluateBlackMoveDependencies = {}
): Promise<SelectedResponseResult> {
  const fullFen = parseFullFen(fen);
  const runner = dependencies.localSearchRunner ?? runTrustedLocalSearch;
  const baseline = (await getOrCreateLocalBaseline(fullFen, defaultConfig, runner)).evaluation;

  // EW.13: a hardcoded response. Stockfish evaluates it for the record and never rejects it.
  const hardcodedSan = findHardcodedResponse(previousMovesSan, defaultConfig.hardcodedBlackResponses);
  let uci = baseline.uci;
  let evaluation = baseline;
  if (hardcodedSan !== null) {
    let hardcodedMove;
    try { hardcodedMove = chess.move(hardcodedSan); } catch { hardcodedMove = null; }
    if (!hardcodedMove) throw new Error(`Hardcoded response ${hardcodedSan} is illegal after ${previousMovesSan.join(" ")}`);
    chess.undo();
    uci = hardcodedMove.lan;
    if (uci !== baseline.uci) {
      evaluation = (await getOrCreateLocalCandidate(fullFen, uci, defaultConfig, runner)).evaluation;
    }
  }

  // EW.12: exactly one of cp or mate.
  if ((evaluation.cp === null) === (evaluation.mate === null)) {
    throw new Error(`Chosen Black move ${uci} must carry exactly one of cp or mate at ${fullFen}`);
  }
  // EW.10: what is recorded on the move.
  return {
    selectedUci: uci,
    selectedMoveSan: legalSan(chess, uci),
    cp: evaluation.cp,
    mate: evaluation.mate,
    source: "Local Stockfish 19",
    selectionMethod: hardcodedSan !== null ? "Hardcoded" : "Baseline",
    moveOrigin: hardcodedSan !== null ? "Hardcoded Move" : "Engine Move",
    engineRank: uci === baseline.uci ? 1 : null
  };
}
