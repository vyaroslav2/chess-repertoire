import { Chess } from "chess.js";
import { readRemoteEngineResult, saveRemoteEngineResult, type RemoteEngineEvaluation } from "../db/operations";
import { fetchWithRetry, delay, GlobalState } from "../api/retry";
import {
  runLocalStockfish,
  checkLegacyLocalPvTolerance,
  getCpTolerance,
  getLegacyLocalCp,
  verifyOrdinaryCpSnapshot,
  type OrdinaryCpSnapshotEntry
} from "./verifier";
import { fallbackGeminiMove } from "../api/gemini";
import { parseFullFen } from "./fen";
import { computeRemoteEngineEvaluationProfile, defaultConfig, getMoveBand } from "./config";

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

export function selectWhiteCandidates(currentMoveNumber: number, mastersList: any[], eliteList: any[], amateurList: any[], totalAmateurGames: number) {
  const allWhiteSan = new Set<string>();
  for (const move of [...mastersList, ...eliteList, ...amateurList]) {
    allWhiteSan.add(move.san);
  }

  return Array.from(allWhiteSan)
    .map(san => ({
      san,
      ...shouldIncludeWhiteMove(san, currentMoveNumber, amateurList, totalAmateurGames)
    }))
    .filter(move => move.include);
}

import { fetchAllDatabases } from "../api/lichess";

export async function evaluateBlackMove(fen: string, chess: Chess, moveNumber: number, previousMovesSan: string[], snapshotId: string): Promise<any> {
  const fullFen = parseFullFen(fen);
  
  // 1. Check Explorer Cache via lichess.ts
  const [mastersData, eliteData, amateurData] = await fetchAllDatabases(fen, snapshotId);

  let mergedMoves: Record<string, any> = {};

  if (mastersData && mastersData.moves) {
    for (const m of mastersData.moves) {
      const total = m.white + m.draws + m.black;
      mergedMoves[m.san] = {
        san: m.san, mastersCount: total,
        mastersBlackWin: m.black, mastersDraws: m.draws, mastersWhiteWin: m.white,
        onlineCount: 0, onlineBlackWin: 0, onlineDraws: 0, onlineWhiteWin: 0
      };
    }
  }

  if (eliteData && eliteData.moves) {
    for (const m of eliteData.moves) {
      const total = m.white + m.draws + m.black;
      if (mergedMoves[m.san]) {
        mergedMoves[m.san].onlineCount = total;
        mergedMoves[m.san].onlineBlackWin = m.black;
        mergedMoves[m.san].onlineDraws = m.draws;
        mergedMoves[m.san].onlineWhiteWin = m.white;
      } else {
        mergedMoves[m.san] = {
          san: m.san, mastersCount: 0, mastersBlackWin: 0, mastersDraws: 0, mastersWhiteWin: 0,
          onlineCount: total, onlineBlackWin: m.black, onlineDraws: m.draws, onlineWhiteWin: m.white
        };
      }
    }
  }

  const MIN_GAMES_THRESHOLD = defaultConfig.humanMoves.minimumWeightedGames;
  const candidateMoves = Object.values(mergedMoves).map(m => {
    const mastersWeight = defaultConfig.humanMoves.mastersWeight;
    const weightedCount = (m.mastersCount * mastersWeight) + m.onlineCount;
    const weightedBlackWins = (m.mastersBlackWin * mastersWeight) + m.onlineBlackWin;
    const weightedDraws = (m.mastersDraws * mastersWeight) + m.onlineDraws;
    
    const priorWins = defaultConfig.smoothing.anchorGames * defaultConfig.smoothing.blackPrior;
    const smoothedCount = weightedCount + defaultConfig.smoothing.anchorGames;
    const score = (weightedBlackWins + (0.5 * weightedDraws) + priorWins) / smoothedCount;
    
    return { ...m, weightedCount, score };
  }).filter(m => m.weightedCount >= MIN_GAMES_THRESHOLD);

  candidateMoves.sort((a, b) => b.score - a.score);

  // 2. Reuse or fetch coherent remote engine results.
  let lichessCp: number | null = null;
  let chessdbCp: number | null = null;
  let bestCp = 0;
  let enginePvs: any[] = [];
  let chessdbPvs: any[] = [];
  let lichessOrdinarySnapshot: OrdinaryCpSnapshotEntry[] | null = [];
  let chessDbOrdinarySnapshot: OrdinaryCpSnapshotEntry[] | null = [];
  let evalSource = 'Lichess';
  const lichessProfile = computeRemoteEngineEvaluationProfile("LICHESS", defaultConfig);
  const chessDbProfile = computeRemoteEngineEvaluationProfile("CHESSDB", defaultConfig);

  let lichessResult = await readRemoteEngineResult(fullFen, "LICHESS", lichessProfile);
  let chessDbResult = await readRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile);

  if (lichessResult.status === "missing" && GlobalState.lichessCloudEvals) {
    await delay(1000);
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
    }
  }

  if (chessDbResult.status === "missing") {
    const chessdbUrl = `https://www.chessdb.cn/cdb.php?action=${defaultConfig.api.chessDb.queryMode}&board=${encodeURIComponent(fullFen)}`;
    try {
      const chessdbRes = await fetch(chessdbUrl);
      if (chessdbRes.ok) {
        const text = await chessdbRes.text();
        const evaluations: RemoteEngineEvaluation[] = text.includes("move:")
          ? text.split("|").filter(row => row.includes("move:")).map(row => {
              const match = row.match(/move:([^,]+),score:([^,]+)/);
              if (!match || !/^-?\d+$/.test(match[2])) throw new Error("Malformed successful ChessDB engine snapshot");
              return { uci: match[1], cp: -Number(match[2]), mate: null };
            })
          : [];
        await saveRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile, evaluations);
        chessDbResult = await readRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile);
      }
    } catch (error) {
      if (error instanceof Error &&
          (error.message.startsWith("Invalid remote engine result") || error.message.startsWith("Malformed successful"))) throw error;
      console.log("Error fetching ChessDB engine eval:", error);
    }
  }

  if (lichessResult.status === "success") {
    enginePvs = toLegacyEnginePvs(lichessResult.evaluations);
    lichessOrdinarySnapshot = toOrdinaryCpSnapshot(lichessResult.evaluations);
    lichessCp = enginePvs.find(pv => typeof pv.cp === "number")?.cp ?? null;
    if (lichessCp !== null) bestCp = lichessCp;
  }
  if (chessDbResult.status === "success") {
    chessdbPvs = toLegacyEnginePvs(chessDbResult.evaluations);
    chessDbOrdinarySnapshot = toOrdinaryCpSnapshot(chessDbResult.evaluations);
    chessdbCp = chessdbPvs.find(pv => typeof pv.cp === "number")?.cp ?? null;
  }
  if (enginePvs.length === 0 && chessdbPvs.length > 0) {
    evalSource = 'ChessDB';
    enginePvs = chessdbPvs;
    if (chessdbCp !== null) bestCp = chessdbCp;
  }

  // --- KILL MODE (Forced Mate Detection) ---
  let baselinePvs = enginePvs.length > 0 ? enginePvs : (chessdbPvs.length > 0 ? chessdbPvs : []);
  if (baselinePvs.length === 0) {
      console.log(`[KILL MODE] APIs down, running shallow Local Stockfish baseline...`);
      baselinePvs = await runLocalStockfish(fullFen, defaultConfig.engine.localFallback.multiPv, defaultConfig.engine.localFallback.depth);
  }

  const bestBaseline = baselinePvs[0];
  if (bestBaseline && bestBaseline.mate !== null && bestBaseline.mate < 0) {
      console.log(`[KILL MODE] Forced mate detected (Mate in ${Math.abs(bestBaseline.mate)}). Bypassing human candidates and running deep search...`);
      
      const deepPvs = await runLocalStockfish(fullFen, defaultConfig.engine.deepVerification.multiPv, defaultConfig.engine.deepVerification.depth);
      const bestDeep = deepPvs[0];
      
      if (bestDeep) {
          const tempChess = new Chess(fen);
          const lan = bestDeep.moves.split(' ')[0];
          const moveResult = tempChess.move({ from: lan.substring(0, 2), to: lan.substring(2, 4), promotion: lan.length === 5 ? lan[4] : undefined } as any);
          
          const finalCp = getLegacyLocalCp(bestDeep);
          
          return {
              selectedMoveSan: moveResult.san,
              selectedStats: candidateMoves.find(m => m.san === moveResult.san) || null,
              selectedEngineCp: finalCp,
              lichessCp,
              chessdbCp,
              evalSource: 'Local Deep Stockfish',
              candidateMoves,
              enginePvs: deepPvs
          };
      }
  }
  // --- END KILL MODE ---

  let selectedMoveSan: string | null = null;
  let selectedStats: any = null;
  let selectedEngineCp: number | null = null;

  if (moveNumber === 1 && previousMovesSan.length === 1) {
    const whiteFirstMove = previousMovesSan[0];
    if (whiteFirstMove === "e4") { selectedMoveSan = "c6"; selectedStats = candidateMoves.find(m => m.san === "c6"); selectedEngineCp = bestCp; }
    else if (whiteFirstMove === "d4") { selectedMoveSan = "d5"; selectedStats = candidateMoves.find(m => m.san === "d5"); selectedEngineCp = bestCp; }
    else {
        const geminiRes = await fallbackGeminiMove(whiteFirstMove, chess, candidateMoves);
        if (geminiRes) {
            selectedMoveSan = geminiRes.san;
            selectedStats = geminiRes.stats;
            selectedEngineCp = bestCp;
        }
    }
  }

  if (!selectedMoveSan && candidateMoves.length > 0) {
      let localEngineRun = false;
      let localEnginePvs: any[] = [];
      
      // Separate the baseline CP for each engine source
      const lichessBestCp = enginePvs.length > 0 ? getLegacyLocalCp(enginePvs[0]) : 0;
      
      for (const candidate of candidateMoves) {
          const moveResult = chess.move(candidate.san);
          chess.undo();
          const lan = moveResult.lan;
          const currentTolerance = getCpTolerance(moveNumber, false);
  
          // Remote ordinary snapshots use strict PV semantics. A Lichess mate
          // snapshot stays outside this cp verifier until the B3 mate slice.
          const lichessDecision = lichessOrdinarySnapshot === null
              ? 'INCONCLUSIVE'
              : verifyOrdinaryCpSnapshot(lan, lichessOrdinarySnapshot, currentTolerance);
          if (lichessDecision === 'ACCEPT') {
                  selectedMoveSan = candidate.san;
                  selectedStats = candidate;
                  selectedEngineCp = lichessOrdinarySnapshot!.find(entry => entry.uci === lan)!.cp;
                  break;
          }
          if (lichessDecision === 'REJECT') continue;
  
          const chessDbDecision = chessDbOrdinarySnapshot === null
              ? 'INCONCLUSIVE'
              : verifyOrdinaryCpSnapshot(lan, chessDbOrdinarySnapshot, currentTolerance);
          if (chessDbDecision === 'ACCEPT') {
                  selectedMoveSan = candidate.san;
                  selectedStats = candidate;
                  selectedEngineCp = chessDbOrdinarySnapshot!.find(entry => entry.uci === lan)!.cp;
                  evalSource = 'ChessDB';
                  break;
          }
          if (chessDbDecision === 'REJECT') continue;
  
          // Local Stockfish remains on its legacy mate-aware adapter in this slice.
          if (!localEngineRun) {
                  console.log(`\n[DEEP SEARCH] Candidate '${candidate.san}' exceeds API depth. Running Local Stockfish...`);
                  localEnginePvs = await runLocalStockfish(fullFen, defaultConfig.engine.localVerification.multiPv, defaultConfig.engine.localVerification.depth);
                  localEngineRun = true;
          }
  
          const localTolerance = getCpTolerance(moveNumber, true);
          const localBestCp = localEnginePvs.length > 0 ? getLegacyLocalCp(localEnginePvs[0]) : lichessBestCp;
              
          const localStatus = checkLegacyLocalPvTolerance(lan, localEnginePvs, localBestCp, localTolerance);
          if (localStatus === 'VALID') {
                  selectedMoveSan = candidate.san;
                  selectedStats = candidate;
                  selectedEngineCp = getLegacyLocalCp(localEnginePvs.find(pv => pv.moves.split(" ")[0] === lan));
                  evalSource = 'Local Stockfish';
                  break;
          }
      }
  }

  if (!selectedMoveSan && enginePvs.length > 0) {
    try {
      const lan = enginePvs[0].moves.split(" ")[0];
      const fromSq = lan.substring(0, 2);
      const toSq = lan.substring(2, 4);
      const promotion = lan.length === 5 ? lan[4] : undefined;
      const moveResult = chess.move({ from: fromSq, to: toSq, promotion } as any);
      chess.undo();
      selectedMoveSan = moveResult.san;
      selectedEngineCp = bestCp;
      selectedStats = candidateMoves.find(m => m.san === selectedMoveSan) || null;
    } catch(e) {}
  }

  if (!selectedMoveSan && candidateMoves.length > 0) {
    selectedMoveSan = candidateMoves[0].san;
    selectedStats = candidateMoves[0];
  }


  return { selectedMoveSan, selectedStats, selectedEngineCp, lichessCp, chessdbCp, evalSource, candidateMoves, enginePvs };
}
