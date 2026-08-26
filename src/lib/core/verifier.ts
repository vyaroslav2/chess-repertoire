import { Engine } from 'node-uci';
import { Chess } from 'chess.js';
import * as path from 'path';

import { defaultConfig, getMoveBand } from './config';

// Local Fluctuation Allowance: slightly more lenient for lower-depth local engine
export function getCpTolerance(moveNumber: number, isLocalEngine = false): number {
    const band = getMoveBand(moveNumber, defaultConfig);
    if (isLocalEngine) {
        return defaultConfig.engineVerification.localToleranceCp[band];
    }
    return defaultConfig.engineVerification.apiToleranceCp[band];
}

// Safely handles both CP and Forced Mates (using 30000 as extreme baseline)
export const getCp = (pv: any) => pv.mate !== null ? (pv.mate > 0 ? 30000 - pv.mate : -30000 - pv.mate) : (pv.cp !== undefined ? pv.cp : 0);

export async function runLocalStockfish(fen: string, multiPv: number, depth: number, searchmoves?: string): Promise<any[]> {
    const enginePath = path.resolve(process.cwd(), 'bin', 'stockfish.exe');
    const engine = new Engine(enginePath);
    
    await engine.init();
    await engine.setoption('MultiPV', multiPv.toString());
    await engine.position(fen);
    
    const goParams: any = { depth };
    if (searchmoves) {
        goParams.searchmoves = searchmoves;
    }
    
    const result = await engine.go(goParams);
    await engine.quit();
    
    // Convert side-to-move perspective to absolute White perspective
    const isBlackToMove = fen.includes(' b ');
    const multiplier = isBlackToMove ? -1 : 1;
    
    // 1. Map all valid info lines
    const allPvs = result.info
        .filter((info: any) => info.pv && info.score)
        .map((info: any) => ({
            cp: info.score.value !== undefined ? info.score.value * multiplier : 0,
            mate: info.score.unit === 'mate' ? info.score.value * multiplier : null,
            moves: info.pv
        }));

    // 2. Deduplicate: Keep only the deepest (latest) evaluation for each unique first move
    const uniquePvs = new Map<string, any>();
    for (const pv of allPvs) {
        const firstMove = pv.moves.split(' ')[0];
        uniquePvs.set(firstMove, pv); 
    }

    // 3. Sort by perspective and limit strictly to the requested multiPv amount
    return Array.from(uniquePvs.values())
        .sort((a: any, b: any) => isBlackToMove ? getCp(a) - getCp(b) : getCp(b) - getCp(a))
        .slice(0, multiPv);
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
