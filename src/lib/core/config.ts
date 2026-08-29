import { createHash } from 'crypto';

export interface Config {
    moveBands: {
        earlyThrough: number;
        middleThrough: number;
    };
    whiteMoveFiltering: {
        mainlinePopularity: {
            early: number;
            middle: number;
            late: number;
        };
    };
    humanMoves: {
        mastersWeight: number;
        minimumWeightedGames: number;
    };
    humanExplorerRequest: {
        masters: {
            source: string;
        };
        elite: {
            source: string;
            speeds: string[];
            ratings: number[];
        };
        amateur: {
            source: string;
            speeds: string[];
            ratings: number[];
        };
    };
    smoothing: {
        anchorGames: number;
        blackPrior: number;
    };
    engineVerification: {
        apiToleranceCp: {
            early: number;
            middle: number;
            late: number;
        };
        localToleranceCp: {
            early: number;
            middle: number;
            late: number;
        };
    };
    engine: {
        localVerification: {
            depth: number;
            multiPv: number;
        };
        localFallback: {
            depth: number;
            multiPv: number;
        };
        deepVerification: {
            depth: number;
            multiPv: number;
        };
    };
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
            multiPv: number;
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
        rateLimitRetryDelayMs: number;
        betweenRequestDelayMs: number;
        requestTimeoutMs: number;
        retryBackoffMultiplier: number;
        maximumRetryDelayMs: number;
    };
    generation: {
        commonProbability: number;
        uncommonProbability: number;
        commonDepthBudget: number;
        uncommonDepthBudget: number;
        rareDepthBudget: number;
    };
}

export const defaultConfig: Config = {
    // ---------------------------------------------------------
    // CORE MOVE BANDS
    // Defines the boundary move numbers for early and middle bands.
    // ---------------------------------------------------------
    moveBands: {
        earlyThrough: 4,
        middleThrough: 8
    },

    // ---------------------------------------------------------
    // WHITE MOVE FILTERING
    // Minimum percentage (0.0 to 1.0) of games a move must appear in
    // to be considered a 'Mainline' for White.
    // ---------------------------------------------------------
    whiteMoveFiltering: {
        mainlinePopularity: {
            early: 0.05,
            middle: 0.10,
            late: 0.15
        }
    },

    // ---------------------------------------------------------
    // HUMAN EVIDENCE WEIGHTS
    // Masters multiplier and the minimum weighted game threshold.
    // ---------------------------------------------------------
    humanMoves: {
        mastersWeight: 5,
        minimumWeightedGames: 15
    },

    // ---------------------------------------------------------
    // HUMAN EXPLORER REQUEST
    // Defines the precise dataset parameters queried from Lichess.
    // These define the explorerRequestProfile for snapshot compatibility.
    // ---------------------------------------------------------
    humanExplorerRequest: {
        masters: {
            source: "masters"
        },
        elite: {
            source: "lichess",
            speeds: ["classical", "rapid"],
            ratings: [2500]
        },
        amateur: {
            source: "lichess",
            speeds: ["classical", "rapid"],
            ratings: [1600, 1800, 2000]
        }
    },

    // ---------------------------------------------------------
    // BLACK SMOOTHING
    // Anchor games and prior probability for smoothing low-volume moves.
    // ---------------------------------------------------------
    smoothing: {
        anchorGames: 50,
        blackPrior: 0.48
    },

    // ---------------------------------------------------------
    // ENGINE VERIFICATION TOLERANCES (cp)
    // Maximum centipawn drop allowed compared to the best engine move.
    // ---------------------------------------------------------
    engineVerification: {
        apiToleranceCp: {
            early: 80,
            middle: 50,
            late: 35
        },
        localToleranceCp: {
            early: 95,
            middle: 60,
            late: 40
        }
    },

    // ---------------------------------------------------------
    // LOCAL STOCKFISH SETTINGS
    // Search depths and MultiPV line counts by engine role.
    // ---------------------------------------------------------
    engine: {
        localVerification: {
            depth: 18,
            multiPv: 15
        },
        localFallback: {
            depth: 18,
            multiPv: 15
        },
        deepVerification: {
            depth: 24,
            multiPv: 1
        }
    },

    // ---------------------------------------------------------
    // API LIMITS AND TIMING
    // Controls retries, rate-limits, and multi-PV for external services.
    // ---------------------------------------------------------
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
            multiPv: 5,
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

        // Delay durations (in milliseconds)
        networkRetryDelayMs: 1000,
        rateLimitRetryDelayMs: 2000,
        betweenRequestDelayMs: 1000,
        requestTimeoutMs: 15000,
        retryBackoffMultiplier: 2,
        maximumRetryDelayMs: 30000
    },

    generation: {
        commonProbability: 0.02,
        uncommonProbability: 0.005,
        commonDepthBudget: 15,
        uncommonDepthBudget: 8,
        rareDepthBudget: 5
    }
};

export function validateConfig(config: Config) {
    if (!config) throw new Error("Config is required");
    // Validate move bands
    if (!Number.isInteger(config.moveBands?.earlyThrough) || config.moveBands.earlyThrough < 1) throw new Error("Invalid moveBands.earlyThrough");
    if (!Number.isInteger(config.moveBands?.middleThrough) || config.moveBands.middleThrough <= config.moveBands.earlyThrough) throw new Error("Invalid moveBands.middleThrough");

    // Validate probabilities
    for (const key of ['early', 'middle', 'late'] as const) {
        const val = config.whiteMoveFiltering?.mainlinePopularity?.[key];
        if (typeof val !== 'number' || val < 0 || val > 1 || !Number.isFinite(val)) throw new Error(`Invalid probability for mainlinePopularity.${key}`);
    }
    if (typeof config.smoothing?.blackPrior !== 'number' || config.smoothing.blackPrior < 0 || config.smoothing.blackPrior > 1 || !Number.isFinite(config.smoothing.blackPrior)) throw new Error("Invalid probability for smoothing.blackPrior");

    // Validate counts and depths
    if (!Number.isInteger(config.humanMoves?.mastersWeight) || config.humanMoves.mastersWeight < 1) throw new Error("Invalid humanMoves.mastersWeight");
    if (!Number.isInteger(config.humanMoves?.minimumWeightedGames) || config.humanMoves.minimumWeightedGames < 1) throw new Error("Invalid humanMoves.minimumWeightedGames");
    if (!Number.isInteger(config.smoothing?.anchorGames) || config.smoothing.anchorGames < 1) throw new Error("Invalid smoothing.anchorGames");

    // Validate human explorer request
    const her = config.humanExplorerRequest;
    if (!her) throw new Error("Missing humanExplorerRequest");
    if (her.masters?.source !== "masters") throw new Error("Invalid humanExplorerRequest.masters.source");
    if (her.elite?.source !== "lichess") throw new Error("Invalid humanExplorerRequest.elite.source");
    if (her.amateur?.source !== "lichess") throw new Error("Invalid humanExplorerRequest.amateur.source");
    if (!Array.isArray(her.elite?.speeds) || her.elite.speeds.length === 0 || her.elite.speeds.some(s => typeof s !== 'string' || s.trim() === '')) throw new Error("Invalid humanExplorerRequest.elite.speeds");
    if (!Array.isArray(her.elite?.ratings) || her.elite.ratings.length === 0 || her.elite.ratings.some(r => typeof r !== 'number' || !Number.isInteger(r) || r <= 0)) throw new Error("Invalid humanExplorerRequest.elite.ratings");
    if (!Array.isArray(her.amateur?.speeds) || her.amateur.speeds.length === 0 || her.amateur.speeds.some(s => typeof s !== 'string' || s.trim() === '')) throw new Error("Invalid humanExplorerRequest.amateur.speeds");
    if (!Array.isArray(her.amateur?.ratings) || her.amateur.ratings.length === 0 || her.amateur.ratings.some(r => typeof r !== 'number' || !Number.isInteger(r) || r <= 0)) throw new Error("Invalid humanExplorerRequest.amateur.ratings");

    // Validate engine tolerances
    for (const key of ['early', 'middle', 'late'] as const) {
        const valApi = config.engineVerification?.apiToleranceCp?.[key];
        if (typeof valApi !== 'number' || valApi < 0 || !Number.isFinite(valApi)) throw new Error(`Invalid apiToleranceCp.${key}`);

        const valLocal = config.engineVerification?.localToleranceCp?.[key];
        if (typeof valLocal !== 'number' || valLocal < 0 || !Number.isFinite(valLocal)) throw new Error(`Invalid localToleranceCp.${key}`);
    }

    // Validate engine settings
    for (const key of ['localVerification', 'localFallback', 'deepVerification'] as const) {
        const engineSetting = config.engine?.[key];
        if (!Number.isInteger(engineSetting?.depth) || engineSetting.depth < 1) throw new Error(`Invalid engine.${key}.depth`);
        if (!Number.isInteger(engineSetting?.multiPv) || engineSetting.multiPv < 1) throw new Error(`Invalid engine.${key}.multiPv`);
    }
    if (config.engine.deepVerification.multiPv !== 1) {
        throw new Error("Invalid engine.deepVerification.multiPv: trusted Local Deep requires MultiPV 1");
    }

    // Validate API settings
    if (!Number.isInteger(config.api?.lichessCloudEval?.multiPv) || config.api.lichessCloudEval.multiPv < 1) throw new Error("Invalid api.lichessCloudEval.multiPv");
    if (!Number.isInteger(config.api?.lichessCloudEval?.retryAttempts) || config.api.lichessCloudEval.retryAttempts < 1) throw new Error("Invalid api.lichessCloudEval.retryAttempts");
    if (!Number.isInteger(config.api?.lichessExplorer?.retryAttempts) || config.api.lichessExplorer.retryAttempts < 1) throw new Error("Invalid api.lichessExplorer.retryAttempts");
    if (config.api?.chessDb?.queryMode !== "queryall") throw new Error("Invalid api.chessDb.queryMode");
    if (!Number.isInteger(config.api?.chessDb?.retryAttempts) || config.api.chessDb.retryAttempts < 1) throw new Error("Invalid api.chessDb.retryAttempts");

    if (typeof config.api?.networkRetryDelayMs !== 'number' || config.api.networkRetryDelayMs < 0 || !Number.isFinite(config.api.networkRetryDelayMs)) throw new Error("Invalid api.networkRetryDelayMs");
    if (typeof config.api?.rateLimitRetryDelayMs !== 'number' || config.api.rateLimitRetryDelayMs < 0 || !Number.isFinite(config.api.rateLimitRetryDelayMs)) throw new Error("Invalid api.rateLimitRetryDelayMs");
    if (typeof config.api?.betweenRequestDelayMs !== 'number' || config.api.betweenRequestDelayMs < 0 || !Number.isFinite(config.api.betweenRequestDelayMs)) throw new Error("Invalid api.betweenRequestDelayMs");
    if (!Number.isInteger(config.api?.requestTimeoutMs) || config.api.requestTimeoutMs < 1) throw new Error("Invalid api.requestTimeoutMs");
    if (typeof config.api?.retryBackoffMultiplier !== 'number' || config.api.retryBackoffMultiplier < 1 || !Number.isFinite(config.api.retryBackoffMultiplier)) throw new Error("Invalid api.retryBackoffMultiplier");
    if (!Number.isInteger(config.api?.maximumRetryDelayMs) || config.api.maximumRetryDelayMs < 0) throw new Error("Invalid api.maximumRetryDelayMs");

    const wikibooks = config.api?.wikibooks;
    if (!Number.isInteger(wikibooks?.retryAttempts) || wikibooks.retryAttempts < 1) throw new Error("Invalid api.wikibooks.retryAttempts");
    if (!Number.isInteger(wikibooks?.initialRetryDelayMs) || wikibooks.initialRetryDelayMs < 0) throw new Error("Invalid api.wikibooks.initialRetryDelayMs");
    if (typeof wikibooks?.retryBackoffMultiplier !== 'number' || wikibooks.retryBackoffMultiplier < 1 || !Number.isFinite(wikibooks.retryBackoffMultiplier)) throw new Error("Invalid api.wikibooks.retryBackoffMultiplier");
    if (!Number.isInteger(wikibooks?.minimumRequestIntervalMs) || wikibooks.minimumRequestIntervalMs < 0) throw new Error("Invalid api.wikibooks.minimumRequestIntervalMs");
    if (!Number.isInteger(wikibooks?.maxLagSeconds) || wikibooks.maxLagSeconds < 1) throw new Error("Invalid api.wikibooks.maxLagSeconds");
    if (!Number.isInteger(wikibooks?.requestTimeoutMs) || wikibooks.requestTimeoutMs < 1) throw new Error("Invalid api.wikibooks.requestTimeoutMs");
    if (typeof wikibooks?.userAgent !== "string" || wikibooks.userAgent.trim() === "") throw new Error("Invalid api.wikibooks.userAgent");

    const generation = config.generation;
    for (const key of ["commonProbability", "uncommonProbability"] as const) {
        if (typeof generation?.[key] !== "number" || generation[key] < 0 || generation[key] > 1 || !Number.isFinite(generation[key])) throw new Error(`Invalid generation.${key}`);
    }
    for (const key of ["commonDepthBudget", "uncommonDepthBudget", "rareDepthBudget"] as const) {
        if (!Number.isInteger(generation?.[key]) || generation[key] < 1) throw new Error(`Invalid generation.${key}`);
    }
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

export function computeExplorerRequestProfile(config: Config): string {
    const canonical = canonicalStringify(config.humanExplorerRequest);
    return createHash('sha256').update(canonical).digest('hex');
}

export type RemoteEngineProfileSource = "LICHESS" | "CHESSDB";

export function computeRemoteEngineEvaluationProfile(source: RemoteEngineProfileSource, config: Config): string {
    const requestShape = source === "LICHESS"
        ? { source, multiPv: config.api.lichessCloudEval.multiPv }
        : { source, queryMode: config.api.chessDb.queryMode };
    return createHash('sha256').update(canonicalStringify(requestShape)).digest('hex');
}

export function computeLocalEngineEvaluationProfile(config: Config): string {
    const searchShape = {
        role: "deep-local",
        depth: config.engine.deepVerification.depth,
        multiPv: config.engine.deepVerification.multiPv
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

export function getMoveBand(moveNumber: number, config: Config): 'early' | 'middle' | 'late' {
    if (moveNumber <= config.moveBands.earlyThrough) return 'early';
    if (moveNumber <= config.moveBands.middleThrough) return 'middle';
    return 'late';
}
