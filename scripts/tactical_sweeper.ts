import { PrismaClient } from '@prisma/client';
import { runLocalStockfish, getLegacyLocalCp } from '../src/lib/core/verifier';
import { isLocked, createLockfile, removeLockfile } from '../src/lib/core/lockfile';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const REPORT_PATH = path.resolve(process.cwd(), 'Tactical_Audit_Report.md');

// Helper to convert SAN to LAN using chess.js
import { Chess } from 'chess.js';
function sanToLan(fen: string, san: string): string | null {
    const chess = new Chess(fen);
    try {
        const move = chess.move(san);
        return move.lan;
    } catch {
        return null;
    }
}

async function main() {
    if (isLocked()) {
        console.error("Tree Generator is currently running. Please wait for it to finish before running the Sweeper.");
        process.exit(1);
    }
    
    createLockfile();

    try {
        if (!fs.existsSync(REPORT_PATH)) {
            fs.writeFileSync(REPORT_PATH, "# Tactical Audit Report\n\n", { encoding: 'utf-8' });
        }

        const unverifiedMoves = await prisma.repertoireMove.findMany({
            where: {
                playerTurn: "RESPONSE",
                isDeepVerified: false
            },
            include: {
                fromNode: true,
                toNode: true
            }
        });

        console.log(`[Sweeper] Found ${unverifiedMoves.length} unverified RESPONSE moves.`);

        for (const move of unverifiedMoves) {
            const fen = move.fromNode.fullFen;
            console.log(`\nAuditing Move: ${move.san} in FEN ${fen}`);

            // 1. Run Stockfish at Depth 24 (MultiPV 1) to find the absolute #1 best engine move
            const topPv = await runLocalStockfish(fen, 1, 24);
            const bestDeepMove = topPv[0];

            if (!bestDeepMove) {
                console.log(`[Sweeper] Engine failed to evaluate ${fen}. Skipping.`);
                continue;
            }

            const bestLan = bestDeepMove.moves.split(' ')[0];
            const fastLan = sanToLan(fen, move.san);

            if (!fastLan) {
                console.error(`[Sweeper] Could not convert SAN ${move.san} to LAN. Skipping.`);
                continue;
            }

            // 2. If the Fast Pick matches the #1 Deep Move, mark it verified.
            if (bestLan === fastLan) {
                console.log(`[Sweeper] ${move.san} is the absolute best move. Verified.`);
                await prisma.repertoireMove.update({
                    where: { id: move.id },
                    data: { isDeepVerified: true }
                });
                continue;
            }

            // 3. If it doesn't match, use searchmoves to evaluate only the Fast Pick at Depth 24.
            console.log(`[Sweeper] Fast pick (${move.san}) differs from #1 Deep Move. Running specific deep evaluation...`);
            const specificPv = await runLocalStockfish(fen, 1, 24, fastLan);
            const fastPickEval = specificPv[0];

            if (!fastPickEval) {
                console.log(`[Sweeper] Engine failed to evaluate specific move ${fastLan}. Skipping.`);
                continue;
            }

            // 4. Subtract the CPs. If difference > 150 CP, flag it.
            const bestCp = getLegacyLocalCp(bestDeepMove);
            const fastCp = getLegacyLocalCp(fastPickEval);
            
            // Because the CP is always from White's perspective.
            // Since Black wants a lower CP, if the Fast Move (played by Black) is worse, its CP will be HIGHER.
            // So if `fastCp - bestCp > 150`, it's a blunder!
            
            const diff = fastCp - bestCp;
            console.log(`[Sweeper] Best CP: ${bestCp}, Fast Pick CP: ${fastCp}, Difference: ${diff}`);

            if (diff > 150) {
                console.log(`[Sweeper] 🚨 Severe Tactical Blunder detected! Diff: ${diff}`);
                
                // Convert bestLan to SAN for report
                const tempChess = new Chess(fen);
                let bestSan = bestLan;
                try {
                    const m = tempChess.move({ from: bestLan.substring(0, 2), to: bestLan.substring(2, 4), promotion: bestLan.length === 5 ? bestLan[4] : undefined } as any);
                    bestSan = m.san;
                } catch (e) {}

                let reportBlock = `## Position Review: \`${move.fromNodeId}\`\n`;
                reportBlock += `**FEN:** \`${fen}\`\n`;
                reportBlock += `**PGN:** ${move.fromNode.pgn}\n\n`;
                reportBlock += `* **Fast Pick:** \`${move.san}\` (Deep Score: ${fastCp})\n`;
                reportBlock += `* **Deep Engine Truth:** \`${bestSan}\` (Score: ${bestCp})\n`;
                reportBlock += `* **Reason Flagged:** Severe Tactical Blunder (${diff} CP difference)\n\n---\n\n`;

                fs.appendFileSync(REPORT_PATH, reportBlock);
                
                // Do not mark as verified, leave for manual review.
            } else {
                console.log(`[Sweeper] Move is sub-optimal but acceptable. Verified.`);
                await prisma.repertoireMove.update({
                    where: { id: move.id },
                    data: { isDeepVerified: true }
                });
            }
        }
        
        console.log("\n[Sweeper] Audit complete.");
    } catch (e) {
        console.error("Sweeper Fatal Error:", e);
    } finally {
        removeLockfile();
        await prisma.$disconnect();
    }
}

main();
