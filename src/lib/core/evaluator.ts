import { Chess } from "chess.js";
import { prisma } from "../db/operations";
import { fetchWithRetry, delay, promptUser, GlobalState } from "../api/retry";
import { getCpTolerance, getSmoothedWinRate } from "./math";
import { fallbackGeminiMove } from "../api/gemini";

export function shouldIncludeWhiteMove(moveSan: string, currentMoveNumber: number, mastersList: any[], eliteList: any[], amateurList: any[], totalAmateurGames: number) {
    const amateurData = amateurList.find(m => m.san === moveSan) || { white: 0, draws: 0, black: 0 };
    const aTotal = amateurData.white + amateurData.draws + amateurData.black;
    const mastersData = mastersList.find(m => m.san === moveSan);
    const eliteData = eliteList.find(m => m.san === moveSan);

    let include = false;
    let reason = "";
    let isTrap = false;
    let probability = totalAmateurGames > 0 ? aTotal / totalAmateurGames : 0;

    const mTotal = mastersData ? (mastersData.white + mastersData.draws + mastersData.black) : 0;
    const mWin = mTotal > 0 ? mastersData.white / mTotal : 0;
    const mDraw = mTotal > 0 ? mastersData.draws / mTotal : 0;
    const mLoss = mTotal > 0 ? mastersData.black / mTotal : 0;

    const aWin = aTotal > 0 ? amateurData.white / aTotal : 0;
    const aDraw = aTotal > 0 ? amateurData.draws / aTotal : 0;
    const aLoss = aTotal > 0 ? amateurData.black / aTotal : 0;

    if (totalAmateurGames > 0) {
      const amateurWhiteWinRate = aTotal > 0 ? amateurData.white / aTotal : 0;

      let requiredProbability = 0.15; 
      if (currentMoveNumber <= 4) requiredProbability = 0.05;
      else if (currentMoveNumber <= 8) requiredProbability = 0.10;
      
      if (probability >= requiredProbability) {
          include = true;
          reason = "Mainline";
      } else if (probability >= 0.01 && amateurWhiteWinRate >= 0.55) {
          include = true;
          reason = "Amateur Trap (Pending Eval)";
      } else if (probability > 0) {
          const masterSmoothed = getSmoothedWinRate(
            mTotal > 0 ? mastersData.white : 0, 
            mTotal > 0 ? mastersData.draws : 0, 
            mTotal, 50, 0.52
          );
          if (mTotal >= 15 && masterSmoothed >= 0.58) {
              include = true;
              reason = "Master Threat (Pending Eval)";
          }
      }
    }

    return { 
      include, reason, isTrap, probability,
      mastersGames: mTotal, mastersWin: mWin, mastersDraw: mDraw, mastersLoss: mLoss,
      lichessGames: aTotal, lichessWin: aWin, lichessDraw: aDraw, lichessLoss: aLoss
    };
}

export async function evaluateBlackMove(fen: string, posId: string, chess: Chess, moveNumber: number, previousMovesSan: string[]): Promise<any> {
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  
  let mergedMoves: Record<string, any> = {};
  
  try {
    const mastersUrl = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(strippedFen)}`;
    const mastersData = await fetchWithRetry(mastersUrl);
    if (mastersData && mastersData.moves) {
      let rank = 1;
      for (const m of mastersData.moves) {
        const total = m.white + m.draws + m.black;
        mergedMoves[m.san] = {
          san: m.san, mastersCount: total,
          mastersBlackWin: m.black, mastersDraws: m.draws, mastersWhiteWin: m.white,
          onlineCount: 0, onlineBlackWin: 0, onlineDraws: 0, onlineWhiteWin: 0
        };
        await prisma.explorerMove.create({
          data: {
            positionId: posId, dbType: "masters", san: m.san, games: total, rank: rank++,
            win: total > 0 ? m.white/total : 0, draw: total > 0 ? m.draws/total : 0, loss: total > 0 ? m.black/total : 0
          }
        });
      }
    }
  } catch (e) {}

  await delay(1000);

  try {
    const onlineUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(strippedFen)}&speeds=classical,rapid&ratings=2500`;
    const onlineData = await fetchWithRetry(onlineUrl);
    if (onlineData && onlineData.moves) {
      let rank = 1;
      for (const m of onlineData.moves) {
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
        await prisma.explorerMove.create({
          data: {
            positionId: posId, dbType: "lichess", san: m.san, games: total, rank: rank++,
            win: total > 0 ? m.white/total : 0, draw: total > 0 ? m.draws/total : 0, loss: total > 0 ? m.black/total : 0
          }
        });
      }
    }
  } catch (e) {}

  const MIN_GAMES_THRESHOLD = 5;
  const candidateMoves = Object.values(mergedMoves).map(m => {
    const weightedCount = (m.mastersCount * 5) + m.onlineCount;
    const weightedBlackWins = (m.mastersBlackWin * 5) + m.onlineBlackWin;
    const weightedDraws = (m.mastersDraws * 5) + m.onlineDraws;
    
    const smoothedCount = weightedCount + 50;
    const score = (weightedBlackWins + (0.5 * weightedDraws)) / smoothedCount;
    
    return { ...m, weightedCount, score };
  }).filter(m => m.weightedCount >= MIN_GAMES_THRESHOLD);

  candidateMoves.sort((a, b) => b.score - a.score);

  await delay(1000);
  let lichessCp: number | null = null;
  let chessdbCp: number | null = null;
  let bestCp = 0;
  let enginePvs: any[] = [];
  let chessdbPvs: any[] = [];
  let evalSource = 'Lichess';
  try {
    let cloudData: any = null;
    if (GlobalState.useLichessEval) {
      const cloudUrl = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(strippedFen)}&multiPv=5`;
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
          
          await prisma.engineEval.create({
            data: {
              positionId: posId, san: moveResult.san, cp: pv.cp, mate: pv.mate || null, rank: rank++, source: "lichess"
            }
          });
        } catch(e) {}
      }
    } else {
      evalSource = 'ChessDB';
    }

    try {
      const chessdbUrl = `https://www.chessdb.cn/cdb.php?action=queryall&board=${encodeURIComponent(strippedFen)}`;
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
                
                await prisma.engineEval.create({
                  data: {
                    positionId: posId, san: moveResult.san, cp: whiteCp, mate: null, rank: rank++, source: "chessdb"
                  }
                });
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

  if (!selectedMoveSan && enginePvs.length > 0 && candidateMoves.length > 0) {
    for (const candidate of candidateMoves) {
      try {
        const moveResult = chess.move(candidate.san);
        chess.undo();
        const lan = moveResult.lan; 
        const enginePv = enginePvs.find(pv => pv.moves.split(" ")[0] === lan);
        const currentTolerance = getCpTolerance(moveNumber);
        
        if (enginePv && Math.abs(enginePv.cp - bestCp) <= currentTolerance) {
          selectedMoveSan = candidate.san;
          selectedStats = candidate;
          selectedEngineCp = enginePv.cp;
          break;
        }
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

  if (selectedEngineCp === null) {
      const answer = await promptUser(`\n[N/A EVAL] API limits reached for ${fen}. Turn on VPN and press Enter to retry, or type 's' to skip: `);
      if (answer.toLowerCase() !== 's') {
          return await evaluateBlackMove(fen, posId, chess, moveNumber, previousMovesSan);
      }
  }

  return { selectedMoveSan, selectedStats, selectedEngineCp, lichessCp, chessdbCp, evalSource };
}
