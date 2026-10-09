import { Chess } from "chess.js";
import { readRemoteEngineResult, saveRemoteEngineResult, type RemoteEngineEvaluation } from "../db/operations";
import { isApiOff, lichessHeaders, requestApi } from "../api/retry";
import {
  getCpTolerance,
  verifyOrdinaryCpSnapshot,
  type OrdinaryCpSnapshotEntry,
  type PvDecision
} from "./verifier";
import {
  getOrCreateLocalBaseline,
  getOrCreateLocalCandidate,
  verifyLocalCandidate,
  runTrustedLocalSearch,
  type LocalSearchRunner,
  type TrustedLocalEvaluation
} from "./local-engine";
import { analyseLichessMateSnapshot, verifyCandidateAgainstLichessMate } from "./lichess-mate";

import { parseFullFen } from "./fen";
import { computeRemoteEngineEvaluationProfile, defaultConfig, getMoveBand } from "./config";
import type { ResponseEvaluationSource, ResponseMoveOrigin, ResponseSelectionMethod } from "../db/operations";

export function compareRemoteEvaluationsForBlack(a: RemoteEngineEvaluation, b: RemoteEngineEvaluation): number {
  const category = (evaluation: RemoteEngineEvaluation) =>
    evaluation.mate !== null ? (evaluation.mate < 0 ? 0 : 2) : 1;
  const categoryDifference = category(a) - category(b);
  if (categoryDifference !== 0) return categoryDifference;

  if (a.mate !== null && b.mate !== null) {
    const mateDifference = a.mate < 0
      ? Math.abs(a.mate) - Math.abs(b.mate)
      : Math.abs(b.mate) - Math.abs(a.mate);
    if (mateDifference !== 0) return mateDifference;
  } else if (a.cp !== null && b.cp !== null && a.cp !== b.cp) {
    return a.cp - b.cp;
  }
  return a.uci.localeCompare(b.uci);
}

function toOrdinaryCpSnapshot(evaluations: RemoteEngineEvaluation[]): OrdinaryCpSnapshotEntry[] | null {
  if (evaluations.some(evaluation => evaluation.mate !== null)) return null;
  return evaluations.map(evaluation => ({
    uci: evaluation.uci,
    cp: evaluation.cp as number,
    san: evaluation.san,
    mate: null
  }));
}

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

import { fetchAllDatabases, pickExplorerOpening, type ExplorerOpening } from "../api/lichess";
import { buildBlackHumanShortlist, type BlackHumanCandidate } from "./black-human-shortlist";

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
  /** DB.14: the move's place in the list of the engine that accepted it. */
  engineRank?: number | null;
  deepVerified: boolean;
  localEvaluationProfile: string | null;
  selectedStats: any;
  candidateMoves: BlackHumanCandidate[];
  /** DB.06 rule 1: the opening Explorer returned for this position: Masters, then Elite, then Amateur. Rule 4 for a hardcoded reply. */
  openingMetadata: ExplorerOpening | null | "NOT_FETCHED";
  /** DB.13: all games in each dataset that reached this position. */
  totalMastersGames: number | null;
  totalEliteGames: number | null;
  /** @deprecated diagnostic compatibility; persistence uses source/cp/mate. */
  evalSource: ResponseEvaluationSource;
  /** @deprecated diagnostic compatibility; persistence uses cp. */
  selectedEngineCp: any;
  /** @deprecated diagnostic compatibility; persistence uses mate. */
  selectedMate: number | null;
};

type RankedEvaluation = RemoteEngineEvaluation & { rank: number | null };
type RemoteSnapshot = { source: "Lichess Cloud Evaluation" | "ChessDB"; evaluations: RankedEvaluation[] };

type EngineChoice = {
  uci: string;
  cp: number | null;
  mate: number | null;
  source: ResponseEvaluationSource;
  engineRank: number | null;
  deepVerified: boolean;
  localEvaluationProfile: string | null;
  /** The API answer the move was chosen from; EW.11 checks it against local Stockfish. */
  apiSnapshot: RemoteSnapshot | null;
};

function topForBlack(evaluations: RankedEvaluation[]): RankedEvaluation {
  return [...evaluations].sort((a, b) =>
    compareRemoteEvaluationsForBlack({ ...a, uci: "" }, { ...b, uci: "" }) ||
    (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.uci.localeCompare(b.uci))[0];
}

function evaluationText(evaluation: { cp: number | null; mate: number | null }): string {
  return evaluation.mate !== null ? `mate ${evaluation.mate}` : `cp ${evaluation.cp}`;
}

function choiceFromSnapshot(snapshot: RemoteSnapshot, uci: string): EngineChoice {
  const evaluation = snapshot.evaluations.find(item => item.uci === uci);
  if (!evaluation) throw new Error(`${snapshot.source} has no evaluation for ${uci}`);
  return {
    uci, cp: evaluation.cp, mate: evaluation.mate, source: snapshot.source, engineRank: evaluation.rank,
    deepVerified: false, localEvaluationProfile: null, apiSnapshot: snapshot
  };
}

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

export async function evaluateBlackMove(
  fen: string,
  chess: Chess,
  moveNumber: number,
  previousMovesSan: string[],
  dependencies: EvaluateBlackMoveDependencies = {}
): Promise<SelectedResponseResult> {
  const fullFen = parseFullFen(fen);
  const localSearchRunner = dependencies.localSearchRunner ?? runTrustedLocalSearch;

  // EW.07: Lichess Cloud Eval, from EngineCache first. Null when off, given up or no evals found.
  const lichessProfile = computeRemoteEngineEvaluationProfile("LICHESS", defaultConfig);
  let lichessSnapshot: RemoteSnapshot | null | undefined;
  const resolveLichess = async (): Promise<RemoteSnapshot | null> => {
    if (lichessSnapshot !== undefined) return lichessSnapshot;
    let lichessResult = await readRemoteEngineResult(fullFen, "LICHESS", lichessProfile);
    if (lichessResult.status === "missing" && !isApiOff("Cloud Eval")) {
      const cloudUrl = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fullFen)}&multiPv=${defaultConfig.lichessCloudEvalMultiPv}`;
      const cloud = await requestApi("Cloud Eval", cloudUrl, { body: "json", headers: lichessHeaders(false) });
      if (cloud.kind === "answer") {
        const cloudData = cloud.body;
        if (!cloudData || !Array.isArray(cloudData.pvs)) throw new Error("Malformed successful Lichess engine snapshot");
        const evaluations: RemoteEngineEvaluation[] = cloudData.pvs.map((pv: any) => ({
          uci: typeof pv.moves === "string" ? pv.moves.split(" ")[0] : "",
          cp: pv.cp === undefined ? null : pv.cp,
          mate: pv.mate === undefined ? null : pv.mate
        }));
        await saveRemoteEngineResult(fullFen, "LICHESS", lichessProfile, evaluations);
        lichessResult = await readRemoteEngineResult(fullFen, "LICHESS", lichessProfile);
      } else if (cloud.kind === "nothing") {
        // AR.06: no cloud evaluation is a valid answer, cached as empty.
        await saveRemoteEngineResult(fullFen, "LICHESS", lichessProfile, []);
        lichessResult = await readRemoteEngineResult(fullFen, "LICHESS", lichessProfile);
      }
      // AR.12: a give-up is never cached.
    }
    lichessSnapshot = lichessResult.status === "success"
      ? { source: "Lichess Cloud Evaluation", evaluations: lichessResult.evaluations }
      : null;
    return lichessSnapshot;
  };

  // EW.08: ChessDB, from EngineCache first. Null when off, given up, no evals found, or hiding a mate.
  const chessDbProfile = computeRemoteEngineEvaluationProfile("CHESSDB", defaultConfig);
  let chessDbSnapshot: RemoteSnapshot | null | undefined;
  const resolveChessDb = async (): Promise<RemoteSnapshot | null> => {
    if (chessDbSnapshot !== undefined) return chessDbSnapshot;
    let chessDbResult = await readRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile);
    if (chessDbResult.status === "missing" && !isApiOff("ChessDB")) {
      const chessdbUrl = `https://www.chessdb.cn/cdb.php?action=${defaultConfig.api.chessDb.queryMode}&board=${encodeURIComponent(fullFen)}`;
      const chessDb = await requestApi("ChessDB", chessdbUrl, { body: "text" });
      // AR.12: a give-up is never cached.
      if (chessDb.kind === "answer") {
        const text: string = chessDb.body.trim();
        let evaluations: RemoteEngineEvaluation[];
        if (text === "unknown") {
          evaluations = []; // AR.06
        } else if (text.includes("move:")) {
          evaluations = text.split("|").filter(row => row.includes("move:")).map(row => {
            const match = row.match(/move:([^,]+),score:([^,]+)/);
            if (!match || !/^-?\d+$/.test(match[2])) throw new Error("Malformed successful ChessDB engine snapshot");
            return { uci: match[1], cp: -Number(match[2]), mate: null };
          });
        } else {
          // AR.10: anything else is a malformed answer.
          throw new Error(`Malformed successful ChessDB engine snapshot: ${text.slice(0, 80)}`);
        }
        await saveRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile, evaluations);
        chessDbResult = await readRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile);
      }
    }
    // EW.08: a score this large may be a hidden mate. The answer stays cached as received.
    const hidesMate = chessDbResult.status === "success" && chessDbResult.evaluations.some(evaluation =>
      evaluation.cp !== null && Math.abs(evaluation.cp) >= defaultConfig.chessDbMaxAbsCp);
    chessDbSnapshot = chessDbResult.status === "success" && !hidesMate
      ? { source: "ChessDB", evaluations: chessDbResult.evaluations }
      : null;
    return chessDbSnapshot;
  };

  const localChoice = (evaluation: TrustedLocalEvaluation, baselineUci: string, evaluationProfile: string): EngineChoice => ({
    uci: evaluation.uci, cp: evaluation.cp, mate: evaluation.mate, source: "Local Deep Stockfish",
    // DB.14: local Stockfish only knows its top move.
    engineRank: evaluation.uci === baselineUci ? 1 : null,
    deepVerified: true, localEvaluationProfile: evaluationProfile, apiSnapshot: null
  });

  const finish = (input: {
    choice: EngineChoice;
    selectionMethod: ResponseSelectionMethod;
    moveOrigin: ResponseMoveOrigin;
    selectedStats: BlackHumanCandidate | null;
    candidateMoves: BlackHumanCandidate[];
    openingMetadata: SelectedResponseResult["openingMetadata"];
    totalMastersGames: number | null;
    totalEliteGames: number | null;
  }): SelectedResponseResult => {
    const { choice } = input;
    // EW.12: exactly one of cp or mate.
    if ((choice.cp === null) === (choice.mate === null)) {
      throw new Error(`Chosen Black move ${choice.uci} must carry exactly one of cp or mate at ${fullFen}`);
    }
    return {
      selectedUci: choice.uci,
      selectedMoveSan: legalSan(chess, choice.uci),
      cp: choice.cp,
      mate: choice.mate,
      source: choice.source,
      selectionMethod: input.selectionMethod,
      moveOrigin: input.moveOrigin,
      engineRank: choice.engineRank,
      deepVerified: choice.deepVerified,
      localEvaluationProfile: choice.localEvaluationProfile,
      selectedStats: input.selectedStats,
      candidateMoves: input.candidateMoves,
      openingMetadata: input.openingMetadata,
      totalMastersGames: input.totalMastersGames,
      totalEliteGames: input.totalEliteGames,
      evalSource: choice.source,
      selectedEngineCp: choice.cp,
      selectedMate: choice.mate
    };
  };

  // EW.13: a hardcoded response. No Explorer, no filtering, no scoring, no candidate loop.
  const hardcodedSan = findHardcodedResponse(previousMovesSan, defaultConfig.hardcodedBlackResponses);
  if (hardcodedSan !== null) {
    let hardcodedMove;
    try { hardcodedMove = chess.move(hardcodedSan); } catch { hardcodedMove = null; }
    if (!hardcodedMove) throw new Error(`Hardcoded response ${hardcodedSan} is illegal after ${previousMovesSan.join(" ")}`);
    chess.undo();
    const uci = hardcodedMove.lan;

    // The eval is for the record only: the first found of Lichess, ChessDB, local Stockfish.
    let choice: EngineChoice | null = null;
    for (const resolve of [resolveLichess, resolveChessDb]) {
      const snapshot = await resolve();
      if (snapshot?.evaluations.some(evaluation => evaluation.uci === uci)) {
        choice = choiceFromSnapshot(snapshot, uci);
        break;
      }
    }
    // Every Black response is verified by local Stockfish; a hardcoded one is never rejected on it.
    const baselineResult = await getOrCreateLocalBaseline(fullFen, defaultConfig, localSearchRunner);
    const localEvaluation = baselineResult.evaluation.uci === uci
      ? baselineResult.evaluation
      : (await getOrCreateLocalCandidate(fullFen, uci, defaultConfig, localSearchRunner)).evaluation;
    const local = localChoice(localEvaluation, baselineResult.evaluation.uci, baselineResult.evaluationProfile);
    choice = choice
      ? { ...choice, deepVerified: true, localEvaluationProfile: baselineResult.evaluationProfile }
      : local;

    return finish({
      choice,
      selectionMethod: "Hardcoded",
      moveOrigin: "Hardcoded Move",
      selectedStats: null,
      candidateMoves: [],
      // DB.06 rule 4: this position was never sent to Explorer.
      openingMetadata: "NOT_FETCHED",
      totalMastersGames: null,
      totalEliteGames: null
    });
  }

  // EW.02 - EW.04: Explorer from cache, filtered by minimumWeightedGames and scored.
  const [mastersData, eliteData, amateurData] = await fetchAllDatabases(fen);
  const shortlist = buildBlackHumanShortlist(mastersData.moves || [], eliteData.moves || [], defaultConfig);

  // EW.05: moves still tied on score and weighted games are ordered by local Stockfish, then alphabetically.
  const candidateMoves: BlackHumanCandidate[] = [];
  for (let start = 0; start < shortlist.length;) {
    let end = start + 1;
    while (end < shortlist.length && shortlist[end].blackScore === shortlist[start].blackScore &&
           shortlist[end].weightedGames === shortlist[start].weightedGames) end++;
    const tied = shortlist.slice(start, end);
    if (tied.length > 1) {
      const localEvaluations = new Map<string, TrustedLocalEvaluation>();
      for (const candidate of tied) {
        localEvaluations.set(candidate.uci, (await getOrCreateLocalCandidate(fullFen, candidate.uci, defaultConfig, localSearchRunner)).evaluation);
      }
      tied.sort((a, b) => compareRemoteEvaluationsForBlack(localEvaluations.get(a.uci)!, localEvaluations.get(b.uci)!));
    }
    candidateMoves.push(...tied);
    start = end;
  }

  const apiTolerance = getCpTolerance(moveNumber, false);
  const ordinaryDecision = (snapshot: RemoteSnapshot, uci: string): PvDecision => {
    const ordinary = toOrdinaryCpSnapshot(snapshot.evaluations);
    return ordinary === null ? "INCONCLUSIVE" : verifyOrdinaryCpSnapshot(uci, ordinary, apiTolerance);
  };

  // EW.07 - EW.10 for one candidate. A REJECT sends us back to EW.06 for the next one.
  const runWaterfall = async (uci: string): Promise<EngineChoice | "REJECT"> => {
    const lichess = await resolveLichess();
    if (lichess) {
      const mateContext = analyseLichessMateSnapshot(lichess.evaluations);
      if (mateContext.kind === "FORCED_MATE") {
        return verifyCandidateAgainstLichessMate(uci, mateContext) === "ACCEPT" ? choiceFromSnapshot(lichess, uci) : "REJECT";
      }
      const decision = ordinaryDecision(lichess, uci);
      if (decision === "ACCEPT") return choiceFromSnapshot(lichess, uci);
      if (decision === "REJECT") return "REJECT";
    }

    const chessDb = await resolveChessDb();
    if (chessDb) {
      const decision = ordinaryDecision(chessDb, uci);
      if (decision === "ACCEPT") return choiceFromSnapshot(chessDb, uci);
      if (decision === "REJECT") return "REJECT";
    }

    console.log(`\n[DEEP SEARCH] Verifying ${uci} with trusted Local Deep evidence...`);
    const local = await verifyLocalCandidate(fullFen, uci, getCpTolerance(moveNumber, true), defaultConfig, localSearchRunner);
    if (local.decision === "REJECT") return "REJECT";
    return localChoice(local.candidate, local.baseline.uci, local.evaluationProfile);
  };

  let choice: EngineChoice | null = null;
  let selectedStats: BlackHumanCandidate | null = null;
  for (const candidate of candidateMoves) {
    const result = await runWaterfall(candidate.uci);
    if (result !== "REJECT") {
      choice = result;
      selectedStats = candidate;
      break;
    }
  }

  // EW.03 and EW.10: no candidate qualified or passed --> the top engine move: Lichess, then ChessDB, then local Stockfish.
  let selectionMethod: ResponseSelectionMethod = "Ordinary API";
  let moveOrigin: ResponseMoveOrigin = "Human Move";
  if (!choice) {
    selectionMethod = candidateMoves.length === 0 ? "No Qualifying Candidates" : "Engine Fallback";
    moveOrigin = "Engine Move";
    for (const resolve of [resolveLichess, resolveChessDb]) {
      const snapshot = await resolve();
      if (snapshot && snapshot.evaluations.length > 0) {
        choice = choiceFromSnapshot(snapshot, topForBlack(snapshot.evaluations).uci);
        break;
      }
    }
    if (!choice) {
      console.log(`\n[DEEP SEARCH] Resolving Local Deep Stockfish fallback baseline...`);
      const baselineResult = await getOrCreateLocalBaseline(fullFen, defaultConfig, localSearchRunner);
      choice = localChoice(baselineResult.evaluation, baselineResult.evaluation.uci, baselineResult.evaluationProfile);
    }
    selectedStats = candidateMoves.find(candidate => candidate.uci === choice!.uci) ?? null;
  }

  // EW.11: a move chosen by either API is checked against local Stockfish before it is kept.
  if (choice.apiSnapshot) {
    const apiBaseline = topForBlack(choice.apiSnapshot.evaluations);
    const baselineResult = await getOrCreateLocalBaseline(fullFen, defaultConfig, localSearchRunner);
    const baseline = baselineResult.evaluation;
    const stockfish = baseline.uci === choice.uci
      ? baseline
      : (await getOrCreateLocalCandidate(fullFen, choice.uci, defaultConfig, localSearchRunner)).evaluation;

    let vetoed: boolean;
    if (choice.mate !== null) {
      // EW.11d and the mate cases: only the same mate as Stockfish's baseline passes.
      vetoed = baseline.mate !== choice.mate;
    } else if (baseline.mate !== null || stockfish.mate !== null) {
      vetoed = true; // EW.11c
    } else {
      vetoed = stockfish.cp! - baseline.cp! > getCpTolerance(moveNumber, true); // EW.11a, EW.11b
    }
    if (vetoed) {
      console.warn("[WARNING] Stockfish vetoed the API engine chosen move.");
      console.warn(`chosenResponse=${legalSan(chess, choice.uci)} (${choice.uci}); selectionMethod=${selectionMethod}; moveOrigin=${moveOrigin}; engineRank=${choice.engineRank}; ` +
        `${choice.source} eval=${evaluationText(choice)}; ${choice.source} baseline=${apiBaseline.uci} ${evaluationText(apiBaseline)}; ` +
        `Stockfish eval=${evaluationText(stockfish)}; Stockfish baseline=${baseline.uci} ${evaluationText(baseline)}`);
      throw new Error(`Stockfish vetoed the API engine chosen move ${choice.uci} at ${fullFen}`);
    }
    choice = { ...choice, deepVerified: true, localEvaluationProfile: baselineResult.evaluationProfile };
  }

  return finish({
    choice,
    selectionMethod,
    moveOrigin,
    selectedStats,
    candidateMoves,
    openingMetadata: pickExplorerOpening([mastersData, eliteData, amateurData]),
    totalMastersGames: mastersData.positionTotalGames,
    totalEliteGames: eliteData.positionTotalGames
  });
}
