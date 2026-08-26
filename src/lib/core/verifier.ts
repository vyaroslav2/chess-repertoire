import { Engine } from 'node-uci';
import { Chess } from 'chess.js';
import * as path from 'path';

import { defaultConfig, getMoveBand } from './config';
import { isValidUciMove } from './uci';

export type PvDecision = 'ACCEPT' | 'REJECT' | 'INCONCLUSIVE';

export type OrdinaryCpSnapshotEntry = {
    uci: string;
    cp: number;
    san?: string | null;
    mate?: null;
};

export function verifyOrdinaryCpSnapshot(
    candidateUci: string,
    snapshot: readonly OrdinaryCpSnapshotEntry[],
    toleranceCp: number
): PvDecision {
    if (!isValidUciMove(candidateUci)) {
        throw new Error('Invalid PV candidate UCI/LAN move');
    }
    if (typeof toleranceCp !== 'number' || !Number.isFinite(toleranceCp) || toleranceCp < 0) {
        throw new Error('Invalid PV tolerance: expected a finite non-negative number');
    }
    if (!Array.isArray(snapshot)) {
        throw new Error('Invalid ordinary cp snapshot: expected an array');
    }

    const seenUci = new Set<string>();
    const validated = snapshot.map((entry) => {
        if (!entry || typeof entry !== 'object') {
            throw new Error('Invalid ordinary cp snapshot entry');
        }
        if (!isValidUciMove(entry.uci)) {
            throw new Error('Invalid ordinary cp snapshot UCI/LAN move');
        }
        if (seenUci.has(entry.uci)) {
            throw new Error(`Duplicate UCI move in ordinary cp snapshot: ${entry.uci}`);
        }
        seenUci.add(entry.uci);
        if (entry.mate !== undefined && entry.mate !== null) {
            throw new Error('Wrong evaluation kind for ordinary cp verifier: mate evaluation supplied');
        }
        if (typeof entry.cp !== 'number' || !Number.isFinite(entry.cp)) {
            throw new Error(`Invalid ordinary cp evaluation for ${entry.uci}`);
        }
        return { uci: entry.uci, cp: entry.cp };
    });

    if (validated.length === 0) return 'INCONCLUSIVE';

    const ordered = [...validated].sort((a, b) => a.cp - b.cp || a.uci.localeCompare(b.uci));
    const bestCp = ordered[0].cp;
    const candidate = ordered.find(entry => entry.uci === candidateUci);

    if (candidate) {
        const candidateLoss = candidate.cp - bestCp;
        if (candidateLoss < 0) {
            throw new Error('Invalid ordinary cp snapshot: candidate loss is negative');
        }
        return candidateLoss <= toleranceCp ? 'ACCEPT' : 'REJECT';
    }

    const boundaryLoss = ordered[ordered.length - 1].cp - bestCp;
    if (boundaryLoss < 0) {
        throw new Error('Invalid ordinary cp snapshot: returned boundary loss is negative');
    }
    return boundaryLoss > toleranceCp ? 'REJECT' : 'INCONCLUSIVE';
}

// Local Fluctuation Allowance: slightly more lenient for lower-depth local engine
export function getCpTolerance(moveNumber: number, isLocalEngine = false): number {
    const band = getMoveBand(moveNumber, defaultConfig);
    if (isLocalEngine) {
        return defaultConfig.engineVerification.localToleranceCp[band];
    }
    return defaultConfig.engineVerification.apiToleranceCp[band];
}

// Legacy local-engine ordering only. Strict remote PV verification never uses this
// mate-to-cp compatibility mapping.
export const getLegacyLocalCp = (pv: any) => pv.mate !== null ? (pv.mate > 0 ? 30000 - pv.mate : -30000 - pv.mate) : (pv.cp !== undefined ? pv.cp : 0);

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
        .sort((a: any, b: any) => isBlackToMove ? getLegacyLocalCp(a) - getLegacyLocalCp(b) : getLegacyLocalCp(b) - getLegacyLocalCp(a))
        .slice(0, multiPv);
}

// Legacy local-engine adapter. Remote coherent snapshots use
// verifyOrdinaryCpSnapshot directly.
export function checkLegacyLocalPvTolerance(candidateLan: string, pvs: any[], bestCp: number, tolerance: number): 'VALID' | 'REJECTED' | 'NEED_DEEPER_SEARCH' {
    if (!pvs || pvs.length === 0) return 'NEED_DEEPER_SEARCH';
    
    const matchedPv = pvs.find(pv => pv.moves.split(" ")[0] === candidateLan);
    
    if (matchedPv) {
        const diff = Math.abs(getLegacyLocalCp(matchedPv) - bestCp);
        return diff <= tolerance ? 'VALID' : 'REJECTED';
    } else {
        const worstPv = pvs[pvs.length - 1]; 
        const worstDiff = Math.abs(getLegacyLocalCp(worstPv) - bestCp);
        
        // If the worst move in our API limit is already worse than tolerance, 
        // the candidate is mathematically guaranteed to fail.
        if (worstDiff > tolerance) {
            return 'REJECTED';
        }
        return 'NEED_DEEPER_SEARCH';
    }
}
