import { createHash } from 'crypto';

export type MoveBand = 'early' | 'middle' | 'late';
export type ProbabilityBand = 'deep' | 'medium' | 'shallow';

// Names and values follow new-docs/generation-config.md.
export interface Config {
    lockfileName: string;
    lockfileRetryLimit: number;
    probabilityTolerance: number;
    tinyThreshold: number;
    nodeTouchCountCap: number;
    // Last full move of each band, inclusive. Later moves use the late band.
    moveNumberBands: {
        early: number;
        middle: number;
    };
    popularityThresholds: Record<MoveBand, number>;
    // Lowest cumProb of each band, inclusive. Anything lower is shallow.
    probabilityBands: {
        deep: number;
        medium: number;
    };
    depthBudget: Record<ProbabilityBand, number>;
    explorerSpeeds: string[];
    explorerRatings: number[];
    apiRetryDelayMs: number;
    apiRequestGapMs: number;
    cloudEvalExtraGapMs: number;
    apiRequestTimeoutMs: number;
    explorerEliteSpeeds: string[];
    explorerEliteRatings: number[];
    mastersWeight: number;
    minimumWeightedGames: number;
    lichessCloudEvalMultiPv: number;
    apiToleranceCp: Record<MoveBand, number>;
    localToleranceCp: Record<MoveBand, number>;
    chessDbMaxAbsCp: number;
    anchorGames: number;
    repertoireSidePrior: number;
    localStockfishDepth: number;
    localStockfishMultiPv: number;
    hardcodedBlackResponses: string[];
    // Not in generation-config. Kept until AR, EW and EX are matched to their notes.
    api: {
        wikibooks: {
            retryAttempts: number;
            initialRetryDelayMs: number;
            retryBackoffMultiplier: number;
            minimumRequestIntervalMs: number;
            maxLagSeconds: number;
            requestTimeoutMs: number;
            userAgent: string;
        };
        lichessCloudEval: {
            retryAttempts: number;
        };
        lichessExplorer: {
            retryAttempts: number;
        };
        chessDb: {
            queryMode: "queryall";
            retryAttempts: number;
        };
        networkRetryDelayMs: number;
        rateLimitRetryAttempts: number;
        retryBackoffMultiplier: number;
        maximumRetryDelayMs: number;
    };
}

export const defaultConfig: Config = {
    lockfileName: "lockfile-never-remove-by-yourself-unless-stale",
    lockfileRetryLimit: 5,
    probabilityTolerance: 0.000001,
    tinyThreshold: 0.0000001,
    nodeTouchCountCap: 500,
    moveNumberBands: {
        early: 4,
        middle: 8
    },
    popularityThresholds: {
        early: 0.05,
        middle: 0.10,
        late: 0.15
    },
    probabilityBands: {
        deep: 0.02,
        medium: 0.005
    },
    depthBudget: {
        deep: 15,
        medium: 8,
        shallow: 5
    },
    explorerSpeeds: ["classical", "rapid"],
    explorerRatings: [1600, 1800, 2000],
    apiRetryDelayMs: 120_000,
    apiRequestGapMs: 2_000,
    cloudEvalExtraGapMs: 10_000,
    apiRequestTimeoutMs: 30_000,
    explorerEliteSpeeds: ["classical", "rapid"],
    explorerEliteRatings: [2500],
    mastersWeight: 5,
    minimumWeightedGames: 15,
    lichessCloudEvalMultiPv: 5,
    apiToleranceCp: {
        early: 80,
        middle: 50,
        late: 35
    },
    localToleranceCp: {
        early: 95,
        middle: 60,
        late: 40
    },
    chessDbMaxAbsCp: 1000,
    anchorGames: 50,
    repertoireSidePrior: 0.48,
    localStockfishDepth: 24,
    localStockfishMultiPv: 1,
    hardcodedBlackResponses: ["1. e4 c6", "1. d4 d5"],

    api: {
        wikibooks: {
            retryAttempts: 3,
            initialRetryDelayMs: 1000,
            retryBackoffMultiplier: 2,
            minimumRequestIntervalMs: 1000,
            maxLagSeconds: 5,
            requestTimeoutMs: 15000,
            userAgent: "chess-repertoire/0.1 (https://github.com/vyaroslav2/chess-repertoire) Wikibooks-opening-enrichment"
        },
        // Lichess Cloud Evaluation API
        // Guidance: https://lichess.org/api#tag/Chess-bot/operation/apiCloudEval
        // Last checked: 2026-08
        lichessCloudEval: {
            retryAttempts: 10
        },

        // Lichess Explorer API (Masters and Lichess databases)
        // Guidance: https://lichess.org/api#tag/Opening-Explorer
        // Last checked: 2026-08
        lichessExplorer: {
            retryAttempts: 10
        },

        // ChessDB request shape used for complete remote result snapshots.
        chessDb: {
            queryMode: "queryall",
            retryAttempts: 3
        },

        networkRetryDelayMs: 1000,
        rateLimitRetryAttempts: 3,
        retryBackoffMultiplier: 2,
        maximumRetryDelayMs: 30000
    }
};

const MOVE_BANDS = ['early', 'middle', 'late'] as const;
const PROBABILITY_BANDS = ['deep', 'medium', 'shallow'] as const;

function isFraction(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonNegative(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): boolean {
    return Number.isInteger(value) && (value as number) >= 1;
}

function isNonEmptyStringList(value: unknown): boolean {
    return Array.isArray(value) && value.length > 0 && value.every(s => typeof s === 'string' && s.trim() !== '');
}

function isRatingList(value: unknown): boolean {
    return Array.isArray(value) && value.length > 0 && value.every(r => Number.isInteger(r) && r > 0);
}

export function validateConfig(config: Config) {
    if (!config) throw new Error("Config is required");

    if (typeof config.lockfileName !== 'string' || config.lockfileName.trim() === '') throw new Error("Invalid lockfileName");
    if (!isPositiveInteger(config.lockfileRetryLimit)) throw new Error("Invalid lockfileRetryLimit");
    if (!isFraction(config.probabilityTolerance)) throw new Error("Invalid probabilityTolerance");
    if (!isFraction(config.tinyThreshold)) throw new Error("Invalid tinyThreshold");
    if (!isPositiveInteger(config.nodeTouchCountCap)) throw new Error("Invalid nodeTouchCountCap");

    if (!isPositiveInteger(config.moveNumberBands?.early)) throw new Error("Invalid moveNumberBands.early");
    if (!Number.isInteger(config.moveNumberBands?.middle) || config.moveNumberBands.middle <= config.moveNumberBands.early) throw new Error("Invalid moveNumberBands.middle");

    for (const key of MOVE_BANDS) {
        if (!isFraction(config.popularityThresholds?.[key])) throw new Error(`Invalid popularityThresholds.${key}`);
        if (!isNonNegative(config.apiToleranceCp?.[key])) throw new Error(`Invalid apiToleranceCp.${key}`);
        if (!isNonNegative(config.localToleranceCp?.[key])) throw new Error(`Invalid localToleranceCp.${key}`);
    }

    if (!isFraction(config.probabilityBands?.deep)) throw new Error("Invalid probabilityBands.deep");
    if (!isFraction(config.probabilityBands?.medium) || config.probabilityBands.medium >= config.probabilityBands.deep) throw new Error("Invalid probabilityBands.medium");
    for (const key of PROBABILITY_BANDS) {
        if (!isPositiveInteger(config.depthBudget?.[key])) throw new Error(`Invalid depthBudget.${key}`);
    }

    if (!isNonEmptyStringList(config.explorerSpeeds)) throw new Error("Invalid explorerSpeeds");
    if (!isRatingList(config.explorerRatings)) throw new Error("Invalid explorerRatings");
    if (!isNonEmptyStringList(config.explorerEliteSpeeds)) throw new Error("Invalid explorerEliteSpeeds");
    if (!isRatingList(config.explorerEliteRatings)) throw new Error("Invalid explorerEliteRatings");

    // Lichess asks API clients to wait at least a full minute after HTTP 429.
    if (!isNonNegative(config.apiRetryDelayMs) || config.apiRetryDelayMs < 60_000) throw new Error("Invalid apiRetryDelayMs");
    if (!isNonNegative(config.apiRequestGapMs)) throw new Error("Invalid apiRequestGapMs");
    if (!isNonNegative(config.cloudEvalExtraGapMs)) throw new Error("Invalid cloudEvalExtraGapMs");
    if (!isPositiveInteger(config.apiRequestTimeoutMs)) throw new Error("Invalid apiRequestTimeoutMs");

    if (!isPositiveInteger(config.mastersWeight)) throw new Error("Invalid mastersWeight");
    if (!isPositiveInteger(config.minimumWeightedGames)) throw new Error("Invalid minimumWeightedGames");
    if (!isPositiveInteger(config.lichessCloudEvalMultiPv)) throw new Error("Invalid lichessCloudEvalMultiPv");
    if (!isPositiveInteger(config.chessDbMaxAbsCp)) throw new Error("Invalid chessDbMaxAbsCp");
    if (!isPositiveInteger(config.anchorGames)) throw new Error("Invalid anchorGames");
    if (!isFraction(config.repertoireSidePrior)) throw new Error("Invalid repertoireSidePrior");

    if (!isPositiveInteger(config.localStockfishDepth)) throw new Error("Invalid localStockfishDepth");
    if (!isPositiveInteger(config.localStockfishMultiPv)) throw new Error("Invalid localStockfishMultiPv");
    if (config.localStockfishMultiPv !== 1) {
        throw new Error("Invalid localStockfishMultiPv: trusted Local Deep requires MultiPV 1");
    }

    if (!Array.isArray(config.hardcodedBlackResponses) || config.hardcodedBlackResponses.some(s => typeof s !== 'string' || s.trim() === '')) throw new Error("Invalid hardcodedBlackResponses");

    // Validate API settings not yet covered by generation-config
    if (!isPositiveInteger(config.api?.lichessCloudEval?.retryAttempts)) throw new Error("Invalid api.lichessCloudEval.retryAttempts");
    if (!isPositiveInteger(config.api?.lichessExplorer?.retryAttempts)) throw new Error("Invalid api.lichessExplorer.retryAttempts");
    if (config.api?.chessDb?.queryMode !== "queryall") throw new Error("Invalid api.chessDb.queryMode");
    if (!isPositiveInteger(config.api?.chessDb?.retryAttempts)) throw new Error("Invalid api.chessDb.retryAttempts");
    if (!isNonNegative(config.api?.networkRetryDelayMs)) throw new Error("Invalid api.networkRetryDelayMs");
    if (!isPositiveInteger(config.api?.rateLimitRetryAttempts)) throw new Error("Invalid api.rateLimitRetryAttempts");
    if (!isNonNegative(config.api?.retryBackoffMultiplier) || config.api.retryBackoffMultiplier < 1) throw new Error("Invalid api.retryBackoffMultiplier");
    if (!Number.isInteger(config.api?.maximumRetryDelayMs) || config.api.maximumRetryDelayMs < 0) throw new Error("Invalid api.maximumRetryDelayMs");

    const wikibooks = config.api?.wikibooks;
    if (!isPositiveInteger(wikibooks?.retryAttempts)) throw new Error("Invalid api.wikibooks.retryAttempts");
    if (!Number.isInteger(wikibooks?.initialRetryDelayMs) || wikibooks.initialRetryDelayMs < 0) throw new Error("Invalid api.wikibooks.initialRetryDelayMs");
    if (!isNonNegative(wikibooks?.retryBackoffMultiplier) || wikibooks.retryBackoffMultiplier < 1) throw new Error("Invalid api.wikibooks.retryBackoffMultiplier");
    if (!Number.isInteger(wikibooks?.minimumRequestIntervalMs) || wikibooks.minimumRequestIntervalMs < 0) throw new Error("Invalid api.wikibooks.minimumRequestIntervalMs");
    if (!isPositiveInteger(wikibooks?.maxLagSeconds)) throw new Error("Invalid api.wikibooks.maxLagSeconds");
    if (!isPositiveInteger(wikibooks?.requestTimeoutMs)) throw new Error("Invalid api.wikibooks.requestTimeoutMs");
    if (typeof wikibooks?.userAgent !== "string" || wikibooks.userAgent.trim() === "") throw new Error("Invalid api.wikibooks.userAgent");
}

function canonicalStringify(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
        return '[' + obj.map(canonicalStringify).join(',') + ']';
    }
    const record = obj as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(record[k])).join(',') + '}';
}

export function computeConfigHash(config: Config): string {
    const canonical = canonicalStringify(config);
    return createHash('sha256').update(canonical).digest('hex');
}

export type ExplorerDataset = "MASTERS" | "ELITE" | "AMATEUR";

// DB.31: the dataset is part of the cache profile, so each dataset has its own.
export function computeExplorerCacheProfile(dataset: ExplorerDataset, config: Config): string {
    const requestShape = dataset === "MASTERS"
        ? { dataset, source: "masters" }
        : dataset === "ELITE"
            ? { dataset, source: "lichess", speeds: config.explorerEliteSpeeds, ratings: config.explorerEliteRatings }
            : { dataset, source: "lichess", speeds: config.explorerSpeeds, ratings: config.explorerRatings };
    return createHash('sha256').update(canonicalStringify(requestShape)).digest('hex');
}

// The old all-datasets request shape. Only used to carry old Explorer caches over.
export function computeExplorerRequestProfile(config: Config): string {
    const requestShape = {
        masters: { source: "masters" },
        elite: { source: "lichess", speeds: config.explorerEliteSpeeds, ratings: config.explorerEliteRatings },
        amateur: { source: "lichess", speeds: config.explorerSpeeds, ratings: config.explorerRatings }
    };
    return createHash('sha256').update(canonicalStringify(requestShape)).digest('hex');
}

export type RemoteEngineProfileSource = "LICHESS" | "CHESSDB";

export function computeRemoteEngineEvaluationProfile(source: RemoteEngineProfileSource, config: Config): string {
    const requestShape = source === "LICHESS"
        ? { source, multiPv: config.lichessCloudEvalMultiPv }
        : { source, queryMode: config.api.chessDb.queryMode };
    return createHash('sha256').update(canonicalStringify(requestShape)).digest('hex');
}

export function computeLocalEngineEvaluationProfile(config: Config): string {
    const searchShape = {
        role: "deep-local",
        depth: config.localStockfishDepth,
        multiPv: config.localStockfishMultiPv
    };
    return createHash('sha256').update(canonicalStringify(searchShape)).digest('hex');
}

export function createRuntimeConfig(configSource: Config) {
    validateConfig(configSource);

    const config = JSON.parse(JSON.stringify(configSource)) as Config;

    function deepFreeze<T>(obj: T): T {
        Object.freeze(obj);
        if (obj !== null && typeof obj === 'object') {
            for (const key of Object.getOwnPropertyNames(obj)) {
                const prop = (obj as Record<string, unknown>)[key];
                if (prop !== null && (typeof prop === "object" || typeof prop === "function") && !Object.isFrozen(prop)) {
                    deepFreeze(prop);
                }
            }
        }
        return obj;
    }

    const frozenConfig = deepFreeze(config);
    const configHash = computeConfigHash(frozenConfig);

    return {
        config: frozenConfig,
        configHash
    };
}

export function getMoveBand(moveNumber: number, config: Config): MoveBand {
    if (moveNumber <= config.moveNumberBands.early) return 'early';
    if (moveNumber <= config.moveNumberBands.middle) return 'middle';
    return 'late';
}

export function getProbabilityBand(cumProb: number, config: Config): ProbabilityBand {
    if (cumProb >= config.probabilityBands.deep) return 'deep';
    if (cumProb >= config.probabilityBands.medium) return 'medium';
    return 'shallow';
}
