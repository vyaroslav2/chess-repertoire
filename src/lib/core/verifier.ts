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

export function verifyLocalOrdinaryCp(
    bestCp: number,
    candidateCp: number,
    toleranceCp: number
): Exclude<PvDecision, 'INCONCLUSIVE'> {
    for (const [name, value] of [['bestCp', bestCp], ['candidateCp', candidateCp], ['toleranceCp', toleranceCp]] as const) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(`Invalid local ordinary verifier ${name}`);
        }
    }
    if (toleranceCp < 0) throw new Error('Invalid local ordinary verifier toleranceCp');

    const candidateLoss = candidateCp - bestCp;
    if (candidateLoss < 0) {
        throw new Error('Invalid local ordinary evidence: candidate evaluates better than baseline best');
    }
    return candidateLoss <= toleranceCp ? 'ACCEPT' : 'REJECT';
}
