import { Chess } from "chess.js";
import { readRemoteEngineResult, saveRemoteEngineResult, type RemoteEngineEvaluation } from "../db/operations";
import { fetchWithRetry, delay, GlobalState } from "../api/retry";
import {
  getCpTolerance,
  verifyOrdinaryCpSnapshot,
  type OrdinaryCpSnapshotEntry
} from "./verifier";
import {
  getOrCreateLocalBaseline,
  getOrCreateLocalCandidate,
  verifyLocalCandidate,
  runTrustedLocalSearch,
  type LocalSearchRunner
} from "./local-engine";
import { analyseLichessMateSnapshot, verifyCandidateAgainstLichessMate, type LichessMateContext } from "./lichess-mate";

import { parseFullFen } from "./fen";
import { computeRemoteEngineEvaluationProfile, defaultConfig, getMoveBand } from "./config";
import type { ResponseEvaluationSource, ResponseMoveOrigin, ResponseSelectionMethod } from "../db/operations";

function compareRemoteEvaluationsForBlack(a: RemoteEngineEvaluation, b: RemoteEngineEvaluation): number {
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

function toLegacyEnginePvs(evaluations: RemoteEngineEvaluation[]) {
  return [...evaluations]
    .sort(compareRemoteEvaluationsForBlack)
    .map(evaluation => ({ cp: evaluation.cp, mate: evaluation.mate, moves: evaluation.uci }));
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
    const requiredProbability = defaultConfig.whiteMoveFiltering.mainlinePopularity[band];
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

export function selectWhiteCandidates(currentMoveNumber: number, amateurList: any[], totalAmateurGames: number) {
  return amateurList
    .map(move => ({
      san: move.san,
      ...shouldIncludeWhiteMove(move.san, currentMoveNumber, amateurList, totalAmateurGames)
    }))
    .filter(move => move.include);
}

import { fetchAllDatabases } from "../api/lichess";
import { buildBlackHumanShortlist } from "./black-human-shortlist";


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
  deepVerified: boolean;
  localEvaluationProfile: string | null;
  selectedStats: any;
  candidateMoves: ReturnType<typeof buildBlackHumanShortlist>;
  enginePvs: any[];
  openingMetadata?: { eco?: string | null; name?: string | null } | null;
  openingMetadataRetrieval?: "CACHE" | "FRESH";
  /** @deprecated diagnostic compatibility; persistence uses source/cp/mate. */
  evalSource: ResponseEvaluationSource;
  /** @deprecated diagnostic compatibility; persistence uses cp. */
  selectedEngineCp: any;
  /** @deprecated diagnostic compatibility; persistence uses mate. */
  selectedMate: number | null;
};

export async function evaluateBlackMove(
  fen: string,
  chess: Chess,
  moveNumber: number,
  previousMovesSan: string[],
  snapshotId: string,
  dependencies: EvaluateBlackMoveDependencies = {}
): Promise<SelectedResponseResult> {
  const fullFen = parseFullFen(fen);
  const localSearchRunner = dependencies.localSearchRunner ?? runTrustedLocalSearch;
  let evalSource: ResponseEvaluationSource = 'Lichess Cloud Evaluation';

  // 1. Check Explorer Cache via lichess.ts
  const [mastersData, eliteData] = await fetchAllDatabases(fen, snapshotId);
  
  // 2. Compute Black human candidate shortlist (B1)
  const candidateMoves = buildBlackHumanShortlist(mastersData.moves || [], eliteData.moves || [], defaultConfig);

  const lichessProfile = computeRemoteEngineEvaluationProfile("LICHESS", defaultConfig);
  const chessDbProfile = computeRemoteEngineEvaluationProfile("CHESSDB", defaultConfig);

  // 2. Resolve Lichess for position
  let lichessResult = await readRemoteEngineResult(fullFen, "LICHESS", lichessProfile);
  let lichessUnavailable = false;

  if (lichessResult.status === "missing") {
    // Ordinary flow without GlobalState.lichessCloudEvals bypass
    try {
      const cloudUrl = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fullFen)}&multiPv=${defaultConfig.api.lichessCloudEval.multiPv}`;
      const cloudData = await fetchWithRetry(cloudUrl, defaultConfig.api.lichessCloudEval.retryAttempts, false, 'eval');
      
      if (cloudData && !cloudData.error) {
        if (!Array.isArray(cloudData.pvs)) throw new Error("Malformed successful Lichess engine snapshot");
        const evaluations: RemoteEngineEvaluation[] = cloudData.pvs.map((pv: any) => ({
          uci: typeof pv.moves === "string" ? pv.moves.split(" ")[0] : "",
          cp: pv.cp === undefined ? null : pv.cp,
          mate: pv.mate === undefined ? null : pv.mate
        }));
        await saveRemoteEngineResult(fullFen, "LICHESS", lichessProfile, evaluations);
        lichessResult = await readRemoteEngineResult(fullFen, "LICHESS", lichessProfile);
      } else {
        lichessUnavailable = true;
        await saveRemoteEngineResult(fullFen, "LICHESS", lichessProfile, []);
        lichessResult = await readRemoteEngineResult(fullFen, "LICHESS", lichessProfile);
      }
    } catch (e: any) {
      if (e instanceof Error && (e.message.startsWith("Malformed successful") || e.message.startsWith("Invalid remote engine result"))) throw e;
      console.log("Error fetching Lichess engine eval:", e.message);
      lichessUnavailable = true;
    }
  }

  let lichessMateContext: LichessMateContext = { kind: "NO_MATE" };
  let lichessOrdinarySnapshot: OrdinaryCpSnapshotEntry[] | null = null;
  let lichessPvs: any[] = [];

  if (lichessResult.status === "success") {
    lichessMateContext = analyseLichessMateSnapshot(lichessResult.evaluations);
    lichessOrdinarySnapshot = toOrdinaryCpSnapshot(lichessResult.evaluations);
    lichessPvs = toLegacyEnginePvs(lichessResult.evaluations);
  }

  // 3. Lazy ChessDB resolver
  let chessDbResult = await readRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile);
  let chessDbUnavailable = false;
  let chessDbOrdinarySnapshot: OrdinaryCpSnapshotEntry[] | null = null;
  
  if (chessDbResult.status === "success") {
    chessDbOrdinarySnapshot = toOrdinaryCpSnapshot(chessDbResult.evaluations);
  }

  const ensureChessDb = async () => {
    if (chessDbResult.status !== "missing" || chessDbUnavailable) return;
    const chessdbUrl = `https://www.chessdb.cn/cdb.php?action=${defaultConfig.api.chessDb.queryMode}&board=${encodeURIComponent(fullFen)}`;
    try {
      const text = await fetchWithRetry(chessdbUrl, defaultConfig.api.chessDb.retryAttempts, false, 'chessdb');
      if (text !== null) {
        const evaluations: RemoteEngineEvaluation[] = text.includes("move:")
          ? text.split("|").filter((row: string) => row.includes("move:")).map((row: string) => {
              const match = row.match(/move:([^,]+),score:([^,]+)/);
              if (!match || !/^-?\d+$/.test(match[2])) throw new Error("Malformed successful ChessDB engine snapshot");
              return { uci: match[1], cp: -Number(match[2]), mate: null };
            })
          : [];
        await saveRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile, evaluations);
        chessDbResult = await readRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile);
        if (chessDbResult.status === "success") {
          chessDbOrdinarySnapshot = toOrdinaryCpSnapshot(chessDbResult.evaluations);
        }
      } else {
        chessDbUnavailable = true;
        await saveRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile, []);
        chessDbResult = await readRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile);
      }
    } catch (e: any) {
      if (e instanceof Error && (e.message.startsWith("Malformed successful") || e.message.startsWith("Invalid remote engine result"))) throw e;
      console.log("Error fetching ChessDB engine eval:", e.message);
      chessDbUnavailable = true;
    }
  };

  // 4. Verification loop helper
  let selectedMoveSan: string | null = null;
  let selectedUci: string | null = null;
  let selectedStats: any = null;
  let selectedEngineCp: number | null = null;
  let selectedMate: number | null = null;
  let deepVerified = false;
  let localEvaluationProfile: string | null = null;
  let selectionMethod: ResponseSelectionMethod = "Ordinary API";
  let moveOrigin: ResponseMoveOrigin = "Human Move";

  const evaluateCandidateThroughWaterfall = async (candidate: any, isHardcoded: boolean = false) => {
    const lan = candidate.uci || (() => { const mr = chess.move(candidate.san); chess.undo(); return mr.lan; })();
    
    if (isHardcoded) {
      if (!lichessUnavailable && lichessResult.status === "success") {
        const found = lichessResult.evaluations.find(e => e.uci === lan);
        if (found) return { source: "Lichess Cloud Evaluation", cp: found.cp, mate: found.mate };
      }
      
      await ensureChessDb();
      if (!chessDbUnavailable && chessDbResult.status === "success") {
        const found = chessDbResult.evaluations.find(e => e.uci === lan);
        if (found) return { source: "ChessDB", cp: found.cp, mate: found.mate };
      }

      console.log(`\n[DEEP SEARCH] Resolving exact Local Deep evidence for hardcoded move ${lan}...`);
      const exactLocal = await getOrCreateLocalCandidate(fullFen, lan, defaultConfig, localSearchRunner);
      return {
        source: "Local Deep Stockfish",
        cp: exactLocal.evaluation.cp,
        mate: exactLocal.evaluation.mate,
        localEvaluationProfile: exactLocal.evaluationProfile,
        deepVerified: false
      };
    }

    const currentTolerance = getCpTolerance(moveNumber, false);

    // Lichess B3 Mate
    if (lichessMateContext.kind === "FORCED_MATE") {
      const mateDecision = verifyCandidateAgainstLichessMate(lan, lichessMateContext);
      if (mateDecision === "ACCEPT") {
        return { source: "Lichess Cloud Evaluation", cp: null, mate: lichessMateContext.fallbackMate };
      }
      return { decision: "REJECT" }; // Do not go to ChessDB if Lichess mate rejects!
    }

    // Lichess Ordinary CP
    let lichessDecision = 'INCONCLUSIVE';
    if (!lichessUnavailable && lichessOrdinarySnapshot !== null) {
      if (lichessResult.status === "success" && lichessResult.evaluations.length === 0) {
        // Successful empty is inconclusive
      } else {
        lichessDecision = verifyOrdinaryCpSnapshot(lan, lichessOrdinarySnapshot, currentTolerance);
      }
    }
    
    if (lichessDecision === "ACCEPT") {
      return { source: "Lichess Cloud Evaluation", cp: lichessOrdinarySnapshot!.find(entry => entry.uci === lan)!.cp, mate: null };
    }
    if (lichessDecision === "REJECT") return { decision: "REJECT" };

    // ChessDB Ordinary CP
    await ensureChessDb();
    let chessDbDecision = 'INCONCLUSIVE';
    if (!chessDbUnavailable && chessDbOrdinarySnapshot !== null) {
      if (chessDbResult.status === "success" && chessDbResult.evaluations.length === 0) {
        // Successful empty is inconclusive
      } else {
        chessDbDecision = verifyOrdinaryCpSnapshot(lan, chessDbOrdinarySnapshot, currentTolerance);
      }
    }
    
    if (chessDbDecision === "ACCEPT") {
      return { source: "ChessDB", cp: chessDbOrdinarySnapshot!.find(entry => entry.uci === lan)!.cp, mate: null };
    }
    if (chessDbDecision === "REJECT") return { decision: "REJECT" };

    // Local Deep Stockfish: unrestricted baseline plus exact target evidence.
    console.log(`\n[DEEP SEARCH] Verifying ${lan} with trusted Local Deep evidence...`);
    const localTolerance = getCpTolerance(moveNumber, true);
    const localResult = await verifyLocalCandidate(fullFen, lan, localTolerance, defaultConfig, localSearchRunner);
    if (localResult.decision === 'ACCEPT') {
      return {
        source: "Local Deep Stockfish",
        cp: localResult.candidate.cp,
        mate: localResult.candidate.mate,
        localEvaluationProfile: localResult.evaluationProfile,
        deepVerified: true
      };
    }

    return { decision: "REJECT" };
  };

  // 5. Hardcoded moves
  if (moveNumber === 1 && previousMovesSan.length === 1) {
    const whiteFirstMove = previousMovesSan[0];
    let forcedSan: string | null = null;
    if (whiteFirstMove === "e4") forcedSan = "c6";
    else if (whiteFirstMove === "d4") forcedSan = "d5";

    if (forcedSan) {
      const candidate = candidateMoves.find(m => m.san === forcedSan) || { san: forcedSan, uci: forcedSan === "c6" ? "c7c6" : "d7d5" };
      const res = await evaluateCandidateThroughWaterfall(candidate, true);
      selectedMoveSan = forcedSan;
      selectedUci = candidate.uci;
      selectionMethod = "Hardcoded Opening";
      moveOrigin = "Hardcoded Move";
      selectedStats = candidateMoves.find(m => m.san === forcedSan) || null;
      if (res.source) {
        selectedEngineCp = res.cp;
        selectedMate = res.mate;
        evalSource = res.source as ResponseEvaluationSource;
        deepVerified = res.deepVerified ?? false;
        localEvaluationProfile = res.localEvaluationProfile ?? null;
      } else {
        throw new Error(`Hardcoded forced response ${forcedSan} was rejected by all available engines.`);
      }
    }
  }

  // 6. Normal waterfall
  if (!selectedMoveSan) {
    for (const candidate of candidateMoves) {
      const res = await evaluateCandidateThroughWaterfall(candidate);
      if (res.source) {
        selectedMoveSan = candidate.san;
        selectedUci = candidate.uci;
        selectedStats = candidate;
        selectedEngineCp = res.cp;
        selectedMate = res.mate;
        evalSource = res.source as ResponseEvaluationSource;
        deepVerified = res.deepVerified ?? false;
        localEvaluationProfile = res.localEvaluationProfile ?? null;
        break;
      }
    }
  }

  // 7. Fallbacks (when all HCMs rejected or empty shortlist)
  if (!selectedMoveSan && lichessMateContext.kind === "FORCED_MATE") {
    const lan = lichessMateContext.fallbackUci;
    const fromSq = lan.substring(0, 2);
    const toSq = lan.substring(2, 4);
    const promotion = lan.length === 5 ? lan[4] : undefined;
    
    let moveResult;
    try {
      moveResult = chess.move({ from: fromSq, to: toSq, promotion } as any);
    } catch(e) {
      throw new Error(`Failed to apply Lichess mate fallback move '${lan}': ${e}`);
    }

    if (!moveResult) {
      throw new Error(`Lichess mate fallback move '${lan}' is illegal in this position.`);
    }

    chess.undo();
    selectedMoveSan = moveResult.san;
    selectedUci = lan;
    selectedMate = lichessMateContext.fallbackMate;
    selectedStats = candidateMoves.find(m => m.san === selectedMoveSan) || null;
    evalSource = "Lichess Cloud Evaluation";
    moveOrigin = "Engine Move";
  }

  if (!selectedMoveSan) {
    // Local Deep fallback reuses the same exact baseline/profile used by HCM checks.
    console.log(`\n[DEEP SEARCH] Resolving Local Deep Stockfish fallback baseline...`);
    const baselineResult = await getOrCreateLocalBaseline(fullFen, defaultConfig, localSearchRunner);
    const baseline = baselineResult.evaluation;
    if (baseline) {
      const lan = baseline.uci;
      const fromSq = lan.substring(0, 2);
      const toSq = lan.substring(2, 4);
      const promotion = lan.length === 5 ? lan[4] : undefined;
      let moveResult;
      try {
        moveResult = chess.move({ from: fromSq, to: toSq, promotion } as any);
      } catch(e) {
        throw new Error(`Failed to apply local fallback move '${lan}': ${e}`);
      }
      
      if (!moveResult) {
        throw new Error(`Local fallback move '${lan}' is illegal in this position.`);
      }
      
      chess.undo();
      selectedMoveSan = moveResult.san;
      selectedUci = lan;
      selectedEngineCp = baseline.cp;
      selectedMate = baseline.mate;
      selectedStats = candidateMoves.find(m => m.san === selectedMoveSan) || null;
      evalSource = "Local Deep Stockfish";
      deepVerified = true;
      localEvaluationProfile = baselineResult.evaluationProfile;
      selectionMethod = "Local Engine Fallback";
      moveOrigin = "Engine Move";
    } else {
      throw new Error(`Local Deep Stockfish fallback returned zero usable results for position ${fullFen}.`);
    }
  }

  if (!selectedMoveSan || !selectedUci) {
    throw new Error(`evaluateBlackMove failed to select a move for position ${fullFen}.`);
  }

  return {
    selectedUci,
    selectedMoveSan,
    cp: selectedEngineCp,
    mate: selectedMate,
    source: evalSource,
    selectionMethod,
    moveOrigin,
    deepVerified,
    localEvaluationProfile,
    evalSource,
    selectedEngineCp,
    selectedMate,
    selectedStats,
    candidateMoves,
    openingMetadata: mastersData.opening,
    openingMetadataRetrieval: mastersData.retrieval,
    enginePvs: lichessPvs.length > 0 ? lichessPvs : (chessDbOrdinarySnapshot ? toLegacyEnginePvs((chessDbResult as any).evaluations) : []) 
  };
}
