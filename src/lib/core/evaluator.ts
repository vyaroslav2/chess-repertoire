import { Chess } from "chess.js";
import { prisma, saveExplorerMoveCache, saveEngineEvalCache } from "../db/operations";
import { fetchWithRetry, delay, promptUser, GlobalState } from "../api/retry";
import { getSmoothedWinRate } from "./math";
import { runLocalStockfish, checkPvTolerance, getCpTolerance, getCp } from "./verifier";
import { fallbackGeminiMove } from "../api/gemini";
import { normalizeFen } from "./fen";

export function shouldIncludeWhiteMove(moveSan: string, currentMoveNumber: number, mastersList: any[], eliteList: any[], amateurList: any[], totalAmateurGames: number) {
    const amateurData = amateurList.find(m => m.san === moveSan) || { games: 0, white: 0, draws: 0, black: 0 };
    const aTotal = amateurData.games || (amateurData.white + amateurData.draws + amateurData.black);
    const mastersData = mastersList.find(m => m.san === moveSan);
    const eliteData = eliteList.find(m => m.san === moveSan);

    let include = false;
    let reason = "";
    let isTrap = false;
    let probability = totalAmateurGames > 0 ? aTotal / totalAmateurGames : 0;

    const mTotal = mastersData ? (mastersData.games || (mastersData.white + mastersData.draws + mastersData.black)) : 0;
    const mWin = mTotal > 0 ? mastersData.white / mTotal : 0;
    const mDraw = mTotal > 0 ? mastersData.draws / mTotal : 0;
    const mLoss = mTotal > 0 ? mastersData.black / mTotal : 0;

    const aWin = aTotal > 0 ? amateurData.white / aTotal : 0;
    const aDraw = aTotal > 0 ? amateurData.draws / aTotal : 0;
    const aLoss = aTotal > 0 ? amateurData.black / aTotal : 0;

    let isAmateurTrap = false;
    let isMasterThreat = false;
    
    const masterSmoothed = getSmoothedWinRate(
      mTotal > 0 ? mastersData.white : 0, 
      mTotal > 0 ? mastersData.draws : 0, 
      mTotal, 50, 0.52
    );

    if (mTotal >= 15 && masterSmoothed >= 0.58) {
        isMasterThreat = true;
    }
    
    if (isMasterThreat && probability < 0.01) {
        probability = 0.01;
    }

    if (totalAmateurGames > 0) {
      const amateurWhiteWinRate = aTotal > 0 ? amateurData.white / aTotal : 0;
      
      const amateurSmoothed = getSmoothedWinRate(
        aTotal > 0 ? amateurData.white : 0, 
        aTotal > 0 ? amateurData.draws : 0, 
        aTotal, 50, 0.52
      );

      if (aTotal >= 15 && amateurSmoothed >= 0.58 && !isMasterThreat) {
          isAmateurTrap = true;
      }

      let requiredProbability = 0.15; 
      if (currentMoveNumber <= 4) requiredProbability = 0.05;
      else if (currentMoveNumber <= 8) requiredProbability = 0.10;
      
      if (probability >= requiredProbability) {
          include = true;
          reason = "Mainline";
      } else if (isMasterThreat) {
          include = true;
          reason = "Master Threat";
          isTrap = true;
      } else if (isAmateurTrap || (probability >= 0.01 && amateurWhiteWinRate >= 0.55)) {
          include = true;
          reason = "Amateur Trap";
          isTrap = true;
          isAmateurTrap = true; // ensure it's flagged even if it only hit the 55% raw filter
      }
    }

    return { 
      include, reason, isTrap, isAmateurTrap, isMasterThreat, probability,
      mastersGames: mTotal, mastersWin: mWin, mastersDraw: mDraw, mastersLoss: mLoss,
      lichessGames: aTotal, lichessWin: aWin, lichessDraw: aDraw, lichessLoss: aLoss
    };
}

import { fetchAllDatabases } from "../api/lichess";

export async function evaluateBlackMove(fen: string, chess: Chess, moveNumber: number, previousMovesSan: string[]): Promise<any> {
  const normFen = normalizeFen(fen);
  
  // 1. Check Explorer Cache via lichess.ts
  const [mastersData, eliteData, amateurData] = await fetchAllDatabases(fen);

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

  const MIN_GAMES_THRESHOLD = 15;
  const candidateMoves = Object.values(mergedMoves).map(m => {
    const weightedCount = (m.mastersCount * 5) + m.onlineCount;
    const weightedBlackWins = (m.mastersBlackWin * 5) + m.onlineBlackWin;
    const weightedDraws = (m.mastersDraws * 5) + m.onlineDraws;
    
    const priorWins = 50 * 0.52; // 26
    const smoothedCount = weightedCount + 50;
    const score = (weightedBlackWins + (0.5 * weightedDraws) + priorWins) / smoothedCount;
    
    return { ...m, weightedCount, score };
  }).filter(m => m.weightedCount >= MIN_GAMES_THRESHOLD);

  candidateMoves.sort((a, b) => b.score - a.score);

  // 2. Check Engine Eval Cache
  let lichessCp: number | null = null;
  let chessdbCp: number | null = null;
  let bestCp = 0;
  let enginePvs: any[] = [];
  let chessdbPvs: any[] = [];
  let evalSource = 'Lichess';

  const cachedEvals = await prisma.engineEvalCache.findMany({ where: { positionId: normFen }, orderBy: { rank: 'asc' } });
  
  if (cachedEvals.length > 0) {
    const lichessCached = cachedEvals.filter(e => e.source === "lichess");
    const chessdbCached = cachedEvals.filter(e => e.source === "chessdb");
    
    if (lichessCached.length > 0) {
      lichessCp = lichessCached[0].cp;
      bestCp = lichessCp;
      // Reconstruct PVs
      enginePvs = lichessCached.map(c => {
        try {
          const tempChess = new Chess(fen);
          const res = tempChess.move(c.san);
          return { cp: c.cp, mate: c.mate, moves: res.lan };
        } catch(e) { return null; }
      }).filter(Boolean);
    } else if (chessdbCached.length > 0) {
      evalSource = 'ChessDB';
      chessdbCp = chessdbCached[0].cp;
      bestCp = chessdbCp;
      enginePvs = chessdbCached.map(c => {
        try {
          const tempChess = new Chess(fen);
          const res = tempChess.move(c.san);
          return { cp: c.cp, mate: c.mate, moves: res.lan };
        } catch(e) { return null; }
      }).filter(Boolean);
    }
  } else {
    // Missing Cache: Fetch from Engine APIs
    await delay(1000);
    try {
      let cloudData: any = null;
      if (GlobalState.useLichessEval) {
        const cloudUrl = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(normFen)}&multiPv=5`;
        cloudData = await fetchWithRetry(cloudUrl, 10, false, 'eval');
      }
      
      if (cloudData && !cloudData.error && cloudData.pvs && cloudData.pvs.length > 0) {
        enginePvs = cloudData.pvs;
        lichessCp = enginePvs[0].cp;
        bestCp = lichessCp!;
        
        let rank = 1;
        for (const pv of enginePvs) {
          const lan = pv.moves.split(" ")[0];
          try {
            const tempChess = new Chess(fen);
            const fromSq = lan.substring(0, 2);
            const toSq = lan.substring(2, 4);
            const promotion = lan.length === 5 ? lan[4] : undefined;
            const moveResult = tempChess.move({ from: fromSq, to: toSq, promotion } as any);
            
            await saveEngineEvalCache(fen, "lichess", { san: moveResult.san, cp: pv.cp, mate: pv.mate || null, rank: rank++ });
          } catch(e) {}
        }
      } else {
        evalSource = 'ChessDB';
      }

      try {
        const chessdbUrl = `https://www.chessdb.cn/cdb.php?action=queryall&board=${encodeURIComponent(normFen)}`;
        const chessdbRes = await fetch(chessdbUrl);
        if (chessdbRes.ok) {
          const text = await chessdbRes.text();
          if (text.includes("move:")) {
            const moves = text.split("|");
            let rank = 1;
            for (const m of moves) {
              const moveMatch = m.match(/move:([^,]+),score:([^,]+)/);
              if (moveMatch) {
                const lan = moveMatch[1];
                const scoreCp = parseInt(moveMatch[2], 10);
                const whiteCp = -scoreCp; 
                chessdbPvs.push({ cp: whiteCp, moves: lan });
                
                try {
                  const tempChess = new Chess(fen);
                  const fromSq = lan.substring(0, 2);
                  const toSq = lan.substring(2, 4);
                  const promotion = lan.length === 5 ? lan[4] : undefined;
                  const moveResult = tempChess.move({ from: fromSq, to: toSq, promotion } as any);
                  
                  await saveEngineEvalCache(fen, "chessdb", { san: moveResult.san, cp: whiteCp, mate: null, rank: rank++ });
                } catch(e) {}
              }
            }
            if (chessdbPvs.length > 0) {
              chessdbPvs.sort((a, b) => a.cp - b.cp);
              chessdbCp = chessdbPvs[0].cp;
              if (evalSource === 'ChessDB') {
                enginePvs = chessdbPvs;
                bestCp = chessdbCp;
              }
            }
          }
        }
      } catch (e) {}
    } catch (e) {
      console.log("Error fetching engine eval:", e);
    }
  }

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
      const currentBestCp = enginePvs.length > 0 ? getCp(enginePvs[0]) : 0;
      
      for (const candidate of candidateMoves) {
          try {
              const moveResult = chess.move(candidate.san);
              chess.undo();
              const lan = moveResult.lan; 
              const currentTolerance = getCpTolerance(moveNumber, false);
  
              // 1. Check Lichess PVs
              let status = checkPvTolerance(lan, enginePvs, currentBestCp, currentTolerance);
              if (status === 'VALID') {
                  selectedMoveSan = candidate.san;
                  selectedStats = candidate;
                  selectedEngineCp = getCp(enginePvs.find(pv => pv.moves.split(" ")[0] === lan));
                  break;
              }
              if (status === 'REJECTED') continue;
  
              // 2. Check ChessDB PVs
              status = checkPvTolerance(lan, chessdbPvs, currentBestCp, currentTolerance);
              if (status === 'VALID') {
                  selectedMoveSan = candidate.san;
                  selectedStats = candidate;
                  selectedEngineCp = getCp(chessdbPvs.find(pv => pv.moves.split(" ")[0] === lan));
                  evalSource = 'ChessDB';
                  break;
              }
              if (status === 'REJECTED') continue;
  
              // 3. Waterfall to Local Stockfish
              if (!localEngineRun) {
                  console.log(`\n[DEEP SEARCH] Candidate '${candidate.san}' exceeds API depth. Running Local Stockfish...`);
                  localEnginePvs = await runLocalStockfish(normFen, 15, 18);
                  localEngineRun = true;
              }
  
              const localTolerance = getCpTolerance(moveNumber, true); // Fluctuation allowance active
              const localBestCp = localEnginePvs.length > 0 ? getCp(localEnginePvs[0]) : currentBestCp;
              
              status = checkPvTolerance(lan, localEnginePvs, localBestCp, localTolerance);
              if (status === 'VALID') {
                  selectedMoveSan = candidate.san;
                  selectedStats = candidate;
                  selectedEngineCp = getCp(localEnginePvs.find(pv => pv.moves.split(" ")[0] === lan));
                  evalSource = 'Local Stockfish';
                  break;
              }
              
              // If REJECTED or still NEED_DEEPER_SEARCH (highly unlikely at MultiPV 15), move to next candidate.
          } catch(e) {}
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
