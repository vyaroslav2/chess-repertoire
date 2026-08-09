import { PrismaClient } from "@prisma/client";
import { Chess } from "chess.js";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import * as fs from "fs";

// Try to load from C:\Files\.env first as user requested, then fallback to local .env
if (fs.existsSync("C:\\Files\\.env")) {
  dotenv.config({ path: "C:\\Files\\.env" });
  console.log("Loaded environment variables from C:\\Files\\.env");
}
dotenv.config();

const prisma = new PrismaClient();

const GEMINI_API_KEY = "DUMMY_KEY"; // Using your proxy trick!
const LICHESS_API_TOKEN = process.env.LICHESS_API_TOKEN;

if (!LICHESS_API_TOKEN) {
  console.error("LICHESS_API_TOKEN is missing in your .env file! Lichess API will fail.");
  process.exit(1);
}

// Route through your local proxy running on port 55555
const ai = new GoogleGenAI({ 
  apiKey: GEMINI_API_KEY,
  httpOptions: {
    baseUrl: "http://127.0.0.1:55555/gemini"
  }
});

// Delay helper to avoid hitting API rate limits too hard
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function getOrCreatePosition(fen: string) {
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  let pos = await prisma.position.findUnique({
    where: { fen: strippedFen },
  });
  if (!pos) {
    pos = await prisma.position.create({
      data: { fen: strippedFen },
    });
  }
  return pos;
}

async function expandNode(
  fen: string,
  pgn: string,
  currentDepth: number,
  maxDepth: number,
  repertoireId: string,
  currentPositionId: string,
  openingName: string = "Caro-Kann Defense"
) {
  if (currentDepth >= maxDepth) {
    return;
  }

  const chess = new Chess(fen);
  // Re-load the moves to maintain PGN history accurately
  const tempChess = new Chess();
  tempChess.loadPgn(pgn);
  
  const isBlackTurn = chess.turn() === "b";

  console.log(`[Depth ${currentDepth}] Evaluating ${isBlackTurn ? "Black" : "White"} turn. FEN: ${fen}`);

  if (!isBlackTurn) {
    // WHITE'S TURN - LICHESS API
    // Lichess API requires the FEN to be stripped of move counters for exact matching
    const strippedFen = fen.split(" ").slice(0, 4).join(" ");
    const url = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(strippedFen)}&speeds=rapid,classical&ratings=1800,2000,2200`;
    
    let retries = 3;
    let data = null;
    while (retries > 0) {
      try {
        const response = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${LICHESS_API_TOKEN}`,
            "Accept": "application/json"
          }
        });
        
        if (response.status === 429) {
          console.log("Rate limited by Lichess. Waiting 60 seconds...");
          await delay(60000);
          retries--;
          continue;
        }
        
        if (!response.ok) {
          throw new Error(`Lichess API error: ${response.status} ${response.statusText}`);
        }
        
        data = await response.json();
        break;
      } catch (e) {
        console.error("Lichess fetch error:", e);
        await delay(5000);
        retries--;
      }
    }

    let nextOpeningName = openingName;
    if (data && data.opening && data.opening.name) {
      nextOpeningName = data.opening.name;
    }

    if (!data || !data.moves) {
      console.log("No valid data from Lichess. Stopping branch.");
      return;
    }

    const totalGames = data.white + data.draws + data.black;
    if (totalGames === 0) return;

    // Filter moves with >10% probability
    const threshold = 0.10;
    const popularMoves = data.moves.filter((m: any) => {
      const moveGames = m.white + m.draws + m.black;
      return (moveGames / totalGames) > threshold;
    });

    console.log(`Found ${popularMoves.length} moves above 10% threshold.`);

    for (const moveData of popularMoves) {
      const moveSan = moveData.san;
      
      try {
        const moveResult = tempChess.move(moveSan);
        if (!moveResult) continue;

        const newPos = await getOrCreatePosition(tempChess.fen());
        
        // Create Move in DB if it doesn't exist
        let dbMove = await prisma.move.findFirst({
          where: {
            fromPositionId: currentPositionId,
            toPositionId: newPos.id,
            san: moveSan
          }
        });

        if (!dbMove) {
          dbMove = await prisma.move.create({
            data: {
              san: moveSan,
              fromPositionId: currentPositionId,
              toPositionId: newPos.id
            }
          });
        }

        // Recursively expand
        await expandNode(
          tempChess.fen(),
          tempChess.pgn(),
          currentDepth + 1,
          maxDepth,
          repertoireId,
          newPos.id,
          nextOpeningName
        );

        // Undo move to process next branch
        tempChess.undo();
        await delay(1000); // Small delay to be gentle to Lichess API
      } catch (e) {
        console.error(`Error processing move ${moveSan}:`, e);
      }
    }
  } else {
    // BLACK'S TURN - HUMAN-FIRST + ENGINE VERIFIED
    console.log(`Evaluating Black moves for FEN: ${fen}`);
    
    const strippedFen = fen.split(" ").slice(0, 4).join(" ");
    
    // 1. Fetch Masters Data
    let mergedMoves: Record<string, any> = {};
    try {
      const mastersUrl = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(strippedFen)}`;
      const mastersRes = await fetch(mastersUrl, { headers: { 'Authorization': `Bearer ${LICHESS_API_TOKEN}`, 'Accept': 'application/json' }});
      const mastersData = await mastersRes.json();
      if (mastersData.moves) {
        for (const m of mastersData.moves) {
          mergedMoves[m.san] = {
            san: m.san,
            mastersCount: m.white + m.draws + m.black,
            mastersBlackWin: m.black,
            mastersDraws: m.draws,
            onlineCount: 0, onlineBlackWin: 0, onlineDraws: 0
          };
        }
      }
    } catch (e) {
      console.warn("Failed fetching Masters data.");
    }

    // 2. Fetch 2500+ Online Data
    try {
      const onlineUrl = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(strippedFen)}&speeds=classical,blitz,rapid&ratings=2500`;
      const onlineRes = await fetch(onlineUrl, { headers: { 'Authorization': `Bearer ${LICHESS_API_TOKEN}`, 'Accept': 'application/json' }});
      const onlineData = await onlineRes.json();
      if (onlineData.moves) {
        for (const m of onlineData.moves) {
          const totalOnline = m.white + m.draws + m.black;
          if (mergedMoves[m.san]) {
            mergedMoves[m.san].onlineCount = totalOnline;
            mergedMoves[m.san].onlineBlackWin = m.black;
            mergedMoves[m.san].onlineDraws = m.draws;
          } else {
            mergedMoves[m.san] = {
              san: m.san, mastersCount: 0, mastersBlackWin: 0, mastersDraws: 0,
              onlineCount: totalOnline, onlineBlackWin: m.black, onlineDraws: m.draws
            };
          }
        }
      }
    } catch (e) {
      console.warn("Failed fetching Online data.");
    }

    // 3. Apply Laplace Smoothing and 5x Weighting
    const MIN_GAMES_THRESHOLD = 5; // Minimum weighted volume required to consider a human move

    const candidateMoves = Object.values(mergedMoves).map(m => {
      const weightedCount = (m.mastersCount * 5) + m.onlineCount;
      const weightedBlackWins = (m.mastersBlackWin * 5) + m.onlineBlackWin;
      const weightedDraws = (m.mastersDraws * 5) + m.onlineDraws;
      
      // Laplace smoothing (add 20 draws to penalize low volume)
      const smoothedCount = weightedCount + 20;
      const smoothedDraws = weightedDraws + 20;
      
      const score = (weightedBlackWins + (0.5 * smoothedDraws)) / smoothedCount;
      return { ...m, weightedCount, score };
    }).filter(m => m.weightedCount >= MIN_GAMES_THRESHOLD);

    candidateMoves.sort((a, b) => b.score - a.score);
    
    if (candidateMoves.length === 0) {
      console.log("No human moves passed the minimum volume threshold.");
    }

    // 4. Fetch Stockfish Cloud Eval
    let bestCp = 0;
    let enginePvs: any[] = [];
    try {
      const cloudUrl = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(strippedFen)}&multiPv=5`;
      const cloudRes = await fetch(cloudUrl, { headers: { 'Authorization': `Bearer ${LICHESS_API_TOKEN}`, 'Accept': 'application/json' }});
      const cloudData = await cloudRes.json();
      if (!cloudData.error && cloudData.pvs && cloudData.pvs.length > 0) {
        enginePvs = cloudData.pvs;
        bestCp = enginePvs[0].cp;
      }
    } catch (e) {
      console.warn("Cloud eval failed.");
    }

    // 5. Select move (Golden Threshold: 0.8 pawns / 80 cp)
    let selectedMoveSan: string | null = null;
    let selectedStats: any = null;
    let selectedEngineCp: number | null = null;

    if (enginePvs.length > 0) {
      for (const candidate of candidateMoves) {
        try {
          const moveResult = tempChess.move(candidate.san);
          tempChess.undo();
          const lan = moveResult.lan; // e.g. f8e7
          
          const enginePv = enginePvs.find(pv => pv.moves.split(" ")[0] === lan);
          if (enginePv && Math.abs(enginePv.cp - bestCp) <= 80) {
            selectedMoveSan = candidate.san;
            selectedStats = candidate;
            selectedEngineCp = enginePv.cp;
            break;
          }
        } catch(e) {}
      }
      
      if (!selectedMoveSan) {
         console.log("All top human moves were refuted by Stockfish (or none existed). Defaulting to absolute best engine move.");
         try {
           const lan = enginePvs[0].moves.split(" ")[0];
           const fromSq = lan.substring(0, 2);
           const toSq = lan.substring(2, 4);
           const promotion = lan.length === 5 ? lan[4] : undefined;
           
           const moveResult = tempChess.move({ from: fromSq, to: toSq, promotion } as any);
           tempChess.undo();
           selectedMoveSan = moveResult.san;
           selectedEngineCp = bestCp;
           selectedStats = candidateMoves.find(m => m.san === selectedMoveSan) || { weightedCount: 0, score: 0 };
         } catch(e) {}
      }
    } else {
      if (candidateMoves.length > 0) {
        selectedMoveSan = candidateMoves[0].san;
        selectedStats = candidateMoves[0];
      }
    }

    if (!selectedMoveSan) {
      console.log("No valid move found. Stopping branch.");
      return;
    }

    let explanation;
    if (selectedStats.weightedCount === 0) {
       explanation = `Engine Fallback | Eval: ${selectedEngineCp !== null ? (selectedEngineCp/100).toFixed(2) : "N/A"}`;
    } else {
       explanation = `Score: ${(selectedStats.score * 100).toFixed(1)}% | Weighted Vol: ${selectedStats.weightedCount} | Eval: ${selectedEngineCp !== null ? (selectedEngineCp/100).toFixed(2) : "N/A"}`;
    }
    console.log(`Algorithm Selected: ${selectedMoveSan} -> ${explanation}`);
    const moveSan = selectedMoveSan;

    try {

      const moveResult = tempChess.move(moveSan);
      if (!moveResult) {
        throw new Error(`Gemini suggested illegal move: ${moveSan}`);
      }

      const newPos = await getOrCreatePosition(tempChess.fen());

      // Create Move
      let dbMove = await prisma.move.findFirst({
        where: {
          fromPositionId: currentPositionId,
          toPositionId: newPos.id,
          san: moveSan
        }
      });

      if (!dbMove) {
        dbMove = await prisma.move.create({
          data: {
            san: moveSan,
            fromPositionId: currentPositionId,
            toPositionId: newPos.id
          }
        });
      }

      // Create SRS Card
      await prisma.repertoirePositionStat.upsert({
        where: {
          repertoireId_positionId: {
            repertoireId: repertoireId,
            positionId: currentPositionId
          }
        },
        update: {
          targetMoveId: dbMove.id,
          explanation: explanation
        },
        create: {
          repertoireId: repertoireId,
          positionId: currentPositionId,
          targetMoveId: dbMove.id,
          explanation: explanation
        }
      });

      // Recursively expand
      await expandNode(
        tempChess.fen(),
        tempChess.pgn(),
        currentDepth + 1,
        maxDepth,
        repertoireId,
        newPos.id,
        openingName
      );

      tempChess.undo();
      await delay(2000); // Be gentle to Gemini API
    } catch (e) {
      console.error("Error with Gemini suggestion:", e);
    }
  }
}

async function main() {
  console.log("Starting Repertoire Generation Pipeline...");

  // Ensure user and repertoire exist
  let user = await prisma.user.findUnique({ where: { username: "Yaroslav" } });
  if (!user) {
    user = await prisma.user.create({ data: { username: "Yaroslav" } });
  }

  let repertoire = await prisma.repertoire.findFirst({
    where: { title: "Caro-Kann Defense (Black)", userId: user.id }
  });
  if (!repertoire) {
    repertoire = await prisma.repertoire.create({
      data: {
        title: "Caro-Kann Defense (Black)",
        color: "black",
        userId: user.id
      }
    });
  }

  // Initial sequence: 1. e4 c6
  const chess = new Chess();
  chess.move("e4");
  chess.move("c6");

  // Get or create position up to c6
  let currentPosId: string | null = null;
  const tempChess = new Chess();
  const initPos = await getOrCreatePosition(tempChess.fen());
  currentPosId = initPos.id;

  tempChess.move("e4");
  const posAfterE4 = await getOrCreatePosition(tempChess.fen());
  await prisma.move.findFirst({ where: { fromPositionId: currentPosId, toPositionId: posAfterE4.id, san: "e4" } }) 
    || await prisma.move.create({ data: { san: "e4", fromPositionId: currentPosId, toPositionId: posAfterE4.id } });
  
  tempChess.move("c6");
  const posAfterC6 = await getOrCreatePosition(tempChess.fen());
  const moveC6 = await prisma.move.findFirst({ where: { fromPositionId: posAfterE4.id, toPositionId: posAfterC6.id, san: "c6" } })
    || await prisma.move.create({ data: { san: "c6", fromPositionId: posAfterE4.id, toPositionId: posAfterC6.id } });

  // Add the base SRS card for Black's very first move (c6 against e4)
  await prisma.repertoirePositionStat.upsert({
    where: {
      repertoireId_positionId: {
        repertoireId: repertoire.id,
        positionId: posAfterE4.id
      }
    },
    update: { targetMoveId: moveC6.id },
    create: {
      repertoireId: repertoire.id,
      positionId: posAfterE4.id,
      targetMoveId: moveC6.id,
      explanation: "The Caro-Kann defense. Solid and fights for the center."
    }
  });

  // Now expand!
  console.log("Initial setup complete. Branching out to depth 6...");
  
  // Starting depth is 2 (e4 and c6 are 2 plies). Max depth is 6 (3 full moves).
  await expandNode(
    tempChess.fen(),
    tempChess.pgn(),
    2,
    6,
    repertoire.id,
    posAfterC6.id
  );

  console.log("Pipeline Finished!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
