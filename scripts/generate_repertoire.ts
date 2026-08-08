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
  currentPositionId: string
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
          newPos.id
        );

        // Undo move to process next branch
        tempChess.undo();
        await delay(1000); // Small delay to be gentle to Lichess API
      } catch (e) {
        console.error(`Error processing move ${moveSan}:`, e);
      }
    }
  } else {
    // BLACK'S TURN - ENGINE VERIFICATION + GEMINI API
    console.log(`Fetching Stockfish Cloud Eval for: ${pgn}`);
    
    const strippedFen = fen.split(" ").slice(0, 4).join(" ");
    let candidateMoves: string[] = [];
    
    try {
      // 1. Try Lichess Cloud Eval first (cached Stockfish 16.1 depth 30+)
      const cloudUrl = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(strippedFen)}&multiPv=5`;
      const cloudRes = await fetch(cloudUrl, { headers: { 'Accept': 'application/json' }});
      const cloudData = await cloudRes.json();
      
      if (!cloudData.error && cloudData.pvs && cloudData.pvs.length > 0) {
        const bestCp = cloudData.pvs[0].cp;
        // Keep moves within ~0.4 pawns (40 centipawns) of the best move
        const acceptablePvs = cloudData.pvs.filter((pv: any) => Math.abs(pv.cp - bestCp) <= 40);
        candidateMoves = acceptablePvs.map((pv: any) => pv.moves.split(" ")[0]);
        console.log(`Stockfish Candidate Moves: ${candidateMoves.join(", ")}`);
      }
    } catch (e) {
      console.warn("Cloud eval failed, falling back to Masters database.");
    }

    if (candidateMoves.length === 0) {
      // 2. Fallback to Lichess Masters Database
      try {
        const mastersUrl = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(strippedFen)}`;
        const mastersRes = await fetch(mastersUrl, { headers: { 'Accept': 'application/json' }});
        const mastersData = await mastersRes.json();
        
        if (mastersData.moves && mastersData.moves.length > 0) {
          candidateMoves = mastersData.moves.slice(0, 5).map((m: any) => m.san);
          console.log(`Masters Candidate Moves: ${candidateMoves.join(", ")}`);
        }
      } catch (e) {
        console.warn("Masters fallback failed.");
      }
    }

    // 3. Prompt Gemini to pick and explain
    console.log(`Asking Gemini to select best human response from candidates...`);
    
    const prompt = `You are an expert chess coach and Grandmaster. I am building a highly practical opening repertoire for Black in the Caro-Kann Defense.
The current position FEN is: ${fen}
The game so far is: ${pgn}
It is Black's turn to move. 

Stockfish 16.1 has verified that the following moves are mathematically sound and equal: [${candidateMoves.join(", ")}]

Out of these candidate moves, select the single most practical, solid, and logical response for a human player (avoid overly complex engine lines).
Provide a detailed strategic explanation of the main plan and IDEAS behind this chosen move so a human can memorize the logic, not just the move.
If you are not 100% confident in the specific theoretical plan for this exact position, DO NOT make things up. Instead, simply state the fundamental opening principles this move achieves (e.g., controlling the center, developing a piece).

You must return a JSON object strictly matching this format:
{
  "san": "The chosen move in standard algebraic notation (e.g. d5, Nf6, cxd4)",
  "explanation": "Your strategic explanation of the idea/plan here. Do not leave this null or empty."
}`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      
      const responseText = response.text;
      if (!responseText) throw new Error("Empty response from Gemini");
      
      const parsed = JSON.parse(responseText);
      const moveSan = parsed.san;
      const explanation = parsed.explanation;

      console.log(`Gemini suggested: ${moveSan}`);

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
        newPos.id
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
