import { Engine } from 'node-uci';
import { Chess } from 'chess.js';
import * as path from 'path';

// Local Fluctuation Allowance: slightly more lenient for lower-depth local engine
export function getCpTolerance(moveNumber: number, isLocalEngine = false): number {
    if (moveNumber <= 4) return isLocalEngine ? 95 : 80;
    if (moveNumber <= 8) return isLocalEngine ? 60 : 50;
    return isLocalEngine ? 40 : 35; 
}

// Safely handles both CP and Forced Mates
export const getCp = (pv: any) => pv.cp !== undefined ? pv.cp : (pv.mate > 0 ? 10000 - pv.mate : -10000 - pv.mate);

export async function runLocalStockfish(fen: string, multiPv = 15, depth = 18): Promise<any[]> {
    const enginePath = path.resolve(process.cwd(), 'bin', 'stockfish.exe');
    const engine = new Engine(enginePath);
    
    await engine.init();
    await engine.setoption('MultiPV', multiPv.toString());
    await engine.position(fen);
    
    const result = await engine.go({ depth });
    await engine.quit();
    
    // Convert side-to-move perspective to absolute White perspective
    const isBlackToMove = fen.includes(' b ');
    const multiplier = isBlackToMove ? -1 : 1;
    
    return result.info
        .filter((info: any) => info.pv)
        .map((info: any) => ({
            cp: info.score.value !== undefined ? info.score.value * multiplier : 0,
            mate: info.score.unit === 'mate' ? info.score.value * multiplier : null,
            moves: info.pv
        }))
        .sort((a: any, b: any) => getCp(b) - getCp(a)); 
}

export function checkPvTolerance(candidateLan: string, pvs: any[], bestCp: number, tolerance: number): 'VALID' | 'REJECTED' | 'NEED_DEEPER_SEARCH' {
    if (!pvs || pvs.length === 0) return 'NEED_DEEPER_SEARCH';
    
    const matchedPv = pvs.find(pv => pv.moves.split(" ")[0] === candidateLan);
    
    if (matchedPv) {
        const diff = Math.abs(getCp(matchedPv) - bestCp);
        return diff <= tolerance ? 'VALID' : 'REJECTED';
    } else {
        const worstPv = pvs[pvs.length - 1]; 
        const worstDiff = Math.abs(getCp(worstPv) - bestCp);
        
        // If the worst move in our API limit is already worse than tolerance, 
        // the candidate is mathematically guaranteed to fail.
        if (worstDiff > tolerance) {
            return 'REJECTED';
        }
        return 'NEED_DEEPER_SEARCH';
    }
}
