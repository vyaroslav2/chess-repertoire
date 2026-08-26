import { Chess } from "chess.js";
import { prisma, getOrCreatePositionCache, createRepertoireNode, createRepertoireMove, getOrCreateHumanDataSnapshot } from "../src/lib/db/operations";
import { fetchAllDatabases } from "../src/lib/api/lichess";
import { computeExplorerRequestProfile, defaultConfig } from "../src/lib/core/config";
import { evaluateBlackMove } from "../src/lib/core/evaluator";
import { GlobalState } from "../src/lib/api/retry";

async function main() {
  GlobalState.lichessCloudEvals = true;
  console.log("======================================================");
  console.log("           STARTING DEEP DIVE TEST (15 MOVES)         ");
  console.log("======================================================");
  console.log("Database:", process.env.DATABASE_URL);
  
  let user = await prisma.user.findUnique({ where: { username: "Yaroslav" } });
  if (!user) user = await prisma.user.create({ data: { username: "Yaroslav" } });
  let repertoire = await prisma.repertoire.findFirst({ where: { title: "Black Universal Repertoire", userId: user.id } });
  if (!repertoire) repertoire = await prisma.repertoire.create({ data: { title: "Black Universal Repertoire", color: "black", userId: user.id }});

  const reqProfile = computeExplorerRequestProfile(defaultConfig);
  const snapshot = await getOrCreateHumanDataSnapshot(repertoire.id, reqProfile);
  const snapshotId = snapshot.id;

  // Start from advance Caro-Kann (After White's 3. e5)
  // History: e4 c6 d4 d5 e5
  // Turn: Black to move
  const startFen = "rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3"; 
  const chess = new Chess(startFen);
  let history = ["e4", "c6", "d4", "d5", "e5"];
  
  let currentMoveNumber = 3; 
  let fen = startFen;

  // We loop 30 ply (15 full moves). Since we already played 5 ply (e4 c6 d4 d5 e5), 
  // we have 25 ply left to reach Move 15.
  // We start on ply index 5 (which is Black's turn).
  for (let step = 1; step <= 25; step++) {
    const isBlacksTurn = chess.turn() === 'b';

    console.log(`\n\n======================================================`);
    console.log(`STEP ${step} (Move ${currentMoveNumber} - ${isBlacksTurn ? "BLACK'S" : "WHITE'S"} TURN)`);
    console.log(`History: ${history.join(" ")}`);
    console.log(`FEN: ${fen}`);
    console.log(`======================================================`);

    if (isBlacksTurn) {
        const algoResult = await evaluateBlackMove(fen, chess, currentMoveNumber, history, snapshotId);
        
        console.log(`\n[CANDIDATE MOVES (Score Formula)]`);
        console.log(`Move  | Score   | Masters | Online  | Weighted`);
        for (const m of algoResult.candidateMoves || []) {
            console.log(`${m.san.padEnd(5)} | ${(m.score * 100).toFixed(1).padStart(6)}% | ${m.mastersCount.toString().padStart(7)} | ${m.onlineCount.toString().padStart(7)} | ${m.weightedCount.toString().padStart(8)}`);
        }

        console.log(`\n[ENGINE PVS (${algoResult.evalSource})]`);
        for (const pv of algoResult.enginePvs || []) {
            console.log(`Eval: ${(pv.cp/100).toFixed(2).padStart(6)} | Line: ${pv.moves}`);
        }

        console.log(`\n[ALGORITHM SELECTION]`);
        console.log(`Selected Move: ${algoResult.selectedMoveSan}`);
        console.log(`Engine Best Cp: ${algoResult.selectedEngineCp !== null ? (algoResult.selectedEngineCp/100).toFixed(2) : "N/A"}`);
        
        if (algoResult.selectedStats) {
            console.log(`Selection Rationale: Score ${(algoResult.selectedStats.score * 100).toFixed(2)}%, Weighted Games: ${algoResult.selectedStats.weightedCount}`);
        } else {
            console.log(`Selection Rationale: Fallback or Forced Engine Line`);
        }

        chess.move(algoResult.selectedMoveSan!);
        history.push(algoResult.selectedMoveSan!);
        fen = chess.fen();
        currentMoveNumber++;
    } else {
        const [masters, elite, amateur] = await fetchAllDatabases(fen, snapshotId);
      
        if (!amateur.moves || amateur.moves.length === 0) {
            console.log("No amateur moves found for White! Breaking test.");
            break;
        }
        
        console.log(`\n[WHITE LICHESS MOVES (1600-2000)]`);
        console.log(`Move  | Total Games | Win Rate (W/D/L)`);
        let validWhiteMoves = amateur.moves;
        for (let i = 0; i < Math.min(10, validWhiteMoves.length); i++) {
            const m = validWhiteMoves[i];
            const total = m.white + m.draws + m.black;
            console.log(`${m.san.padEnd(5)} | ${total.toString().padStart(11)} | ${Math.round((m.white/total)*100)}% / ${Math.round((m.draws/total)*100)}% / ${Math.round((m.black/total)*100)}%`);
        }
        
        let pickedMoveSan = "";
        let phase = "";
        if (step <= 8) { 
            // Step 1: B(Move 3)
            // Step 2: W(Move 4) -> top 1
            // Step 3: B(Move 4)
            // Step 4: W(Move 5) -> top 1
            // Step 5: B(Move 5)
            // Step 6: W(Move 6) -> top 1
            // Step 7: B(Move 6)
            // Step 8: W(Move 7) -> top 1
            pickedMoveSan = validWhiteMoves[0].san;
            phase = "Phase 1 (First 4 White Moves): Picking #1 most popular move";
        } else {
            // Pick randomly from top 3
            const maxIdx = Math.min(3, validWhiteMoves.length);
            const randIdx = Math.floor(Math.random() * maxIdx);
            pickedMoveSan = validWhiteMoves[randIdx].san;
            phase = `Phase 2 (Random Top 3): Picking option #${randIdx + 1}`;
        }
        
        console.log(`\n[SELECTION]`);
        console.log(`${phase} -> ${pickedMoveSan}`);

        chess.move(pickedMoveSan);
        history.push(pickedMoveSan);
        fen = chess.fen();
    }
  }

  console.log("\n\n======================================================");
  console.log("                    TEST COMPLETE                     ");
  console.log("======================================================");
  console.log(`Final Line: ${history.join(" ")}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
