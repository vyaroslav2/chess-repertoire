import { createHash } from "crypto";

// Names and values follow new-docs/generation-config.md.
export interface Config {
  lockfileName: string;
  lockfileRetryLimit: number;
  probabilityTolerance: number;
  tinyThreshold: number;
  nodeTouchCountCap: number;
  // HM.21: a White move whose node's cumProb is below this is too rare.
  minCumProb: number;
  depthCap: number;
  explorerSpeeds: string[];
  explorerRatings: number[];
  apiRetryDelayMs: number;
  apiRequestGapMs: number;
  apiRequestTimeoutMs: number;
  localStockfishVersion: number;
  localStockfishNodes: number;
  localStockfishThreads: number;
  localStockfishHashMb: number;
  localStockfishMultiPv: number;
  hardcodedBlackResponses: string[];
  // HEG.30: the selector. Off rebuilds the tree with Stockfish's move only (HEG.50).
  humanEvidence: boolean;
  /** HEG.20: the months of Explorer counts, written out so a cache profile never moves under a run. */
  selectorMonths: { since: string; until: string };
  selectorConfidence: number;
  /** A fraction of score: 0.01 is 1 point. */
  selectorMargin: number;
  /** cp, measured at localStockfishNodes (HEG.32). */
  selectorCpLimit: number;
  /** HEG.31: the most cp the switches along one route may give up between them. */
  selectorLineBudget: number;
  selectorNearTie: number;
  selectorDraws: number;
  /** HEG.21: the prior's evals, searched as the curve's were. */
  selectorNodes: number;
  selectorHashMb: number;
  // Not in generation-config: the request shapes. Retries, gaps and timeouts follow AR.
  api: {
    wikibooks: {
      maxLagSeconds: number;
      userAgent: string;
    };
  };
}

export const defaultConfig: Config = {
  lockfileName: "lockfile-never-remove-by-yourself-unless-stale",
  lockfileRetryLimit: 5,
  probabilityTolerance: 0.000001,
  tinyThreshold: 0.0000001,
  nodeTouchCountCap: 500,
  minCumProb: 0.001,
  depthCap: 15,
  explorerSpeeds: ["classical", "rapid"],
  explorerRatings: [1600, 1800, 2000],
  apiRetryDelayMs: 120_000,
  apiRequestGapMs: 2_000,
  apiRequestTimeoutMs: 30_000,
  localStockfishVersion: 19,
  localStockfishNodes: 200_000_000,
  localStockfishThreads: 1,
  localStockfishHashMb: 1024,
  localStockfishMultiPv: 1,
  hardcodedBlackResponses: ["1. e4 c6", "1. d4 d5"],
  humanEvidence: false,
  selectorMonths: { since: "2023-06", until: "2026-05" },
  selectorConfidence: 0.9,
  selectorMargin: 0.01,
  selectorCpLimit: 30,
  selectorLineBudget: 50,
  selectorNearTie: 0.005,
  selectorDraws: 20_000,
  selectorNodes: 2_000_000,
  selectorHashMb: 64,

  api: {
    wikibooks: {
      maxLagSeconds: 5,
      userAgent:
        "chess-repertoire/0.1 (https://github.com/vyaroslav2/chess-repertoire) Wikibooks-opening-enrichment",
    },
  },
};

function isFraction(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isNonNegative(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 1;
}

function isNonEmptyStringList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((s) => typeof s === "string" && s.trim() !== "")
  );
}

function isRatingList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((r) => Number.isInteger(r) && r > 0)
  );
}

export function validateConfig(config: Config) {
  if (!config) throw new Error("Config is required");

  if (
    typeof config.lockfileName !== "string" ||
    config.lockfileName.trim() === ""
  )
    throw new Error("Invalid lockfileName");
  if (!isPositiveInteger(config.lockfileRetryLimit))
    throw new Error("Invalid lockfileRetryLimit");
  if (!isFraction(config.probabilityTolerance))
    throw new Error("Invalid probabilityTolerance");
  if (!isFraction(config.tinyThreshold))
    throw new Error("Invalid tinyThreshold");
  if (!isPositiveInteger(config.nodeTouchCountCap))
    throw new Error("Invalid nodeTouchCountCap");

  if (!isFraction(config.minCumProb)) throw new Error("Invalid minCumProb");
  if (!isPositiveInteger(config.depthCap)) throw new Error("Invalid depthCap");

  if (!isNonEmptyStringList(config.explorerSpeeds))
    throw new Error("Invalid explorerSpeeds");
  if (!isRatingList(config.explorerRatings))
    throw new Error("Invalid explorerRatings");

  // Lichess asks API clients to wait at least a full minute after HTTP 429.
  if (!isNonNegative(config.apiRetryDelayMs) || config.apiRetryDelayMs < 60_000)
    throw new Error("Invalid apiRetryDelayMs");
  if (!isNonNegative(config.apiRequestGapMs))
    throw new Error("Invalid apiRequestGapMs");
  if (!isPositiveInteger(config.apiRequestTimeoutMs))
    throw new Error("Invalid apiRequestTimeoutMs");

  if (!isPositiveInteger(config.localStockfishVersion))
    throw new Error("Invalid localStockfishVersion");
  if (!isPositiveInteger(config.localStockfishNodes))
    throw new Error("Invalid localStockfishNodes");
  if (!isPositiveInteger(config.localStockfishThreads))
    throw new Error("Invalid localStockfishThreads");
  if (!isPositiveInteger(config.localStockfishHashMb))
    throw new Error("Invalid localStockfishHashMb");
  if (!isPositiveInteger(config.localStockfishMultiPv))
    throw new Error("Invalid localStockfishMultiPv");
  if (config.localStockfishMultiPv !== 1) {
    throw new Error(
      "Invalid localStockfishMultiPv: trusted Local Deep requires MultiPV 1",
    );
  }

  if (
    !Array.isArray(config.hardcodedBlackResponses) ||
    config.hardcodedBlackResponses.some(
      (s) => typeof s !== "string" || s.trim() === "",
    )
  )
    throw new Error("Invalid hardcodedBlackResponses");

  // HEG.30
  if (typeof config.humanEvidence !== "boolean") throw new Error("Invalid humanEvidence");
  const month = /^\d{4}-(0[1-9]|1[0-2])$/;
  const months = config.selectorMonths;
  if (!months || !month.test(months.since) || !month.test(months.until) || months.since > months.until)
    throw new Error("Invalid selectorMonths");
  if (!(typeof config.selectorConfidence === "number" && config.selectorConfidence > 0.5 && config.selectorConfidence < 1))
    throw new Error("Invalid selectorConfidence");
  if (!(isFraction(config.selectorMargin) && config.selectorMargin < 0.5)) throw new Error("Invalid selectorMargin");
  if (!isNonNegative(config.selectorCpLimit)) throw new Error("Invalid selectorCpLimit");
  if (!isNonNegative(config.selectorLineBudget)) throw new Error("Invalid selectorLineBudget");
  if (!isFraction(config.selectorNearTie)) throw new Error("Invalid selectorNearTie");
  if (!isPositiveInteger(config.selectorDraws)) throw new Error("Invalid selectorDraws");
  if (!isPositiveInteger(config.selectorNodes)) throw new Error("Invalid selectorNodes");
  if (!isPositiveInteger(config.selectorHashMb)) throw new Error("Invalid selectorHashMb");

  const wikibooks = config.api?.wikibooks;
  if (!isPositiveInteger(wikibooks?.maxLagSeconds))
    throw new Error("Invalid api.wikibooks.maxLagSeconds");
  if (
    typeof wikibooks?.userAgent !== "string" ||
    wikibooks.userAgent.trim() === ""
  )
    throw new Error("Invalid api.wikibooks.userAgent");
}

function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalStringify).join(",") + "]";
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalStringify(record[k]))
      .join(",") +
    "}"
  );
}

export function computeConfigHash(config: Config): string {
  const canonical = canonicalStringify(config);
  return createHash("sha256").update(canonical).digest("hex");
}

// DB.31: the dataset is part of the cache profile. Only Amateur is fetched (EX).
// The shape is unchanged, so Amateur rows cached before still match.
export function computeExplorerCacheProfile(config: Config): string {
  const requestShape = {
    dataset: "AMATEUR",
    source: "lichess",
    speeds: config.explorerSpeeds,
    ratings: config.explorerRatings,
  };
  return createHash("sha256")
    .update(canonicalStringify(requestShape))
    .digest("hex");
}

// DB.32: the profile is the version and every search setting, so an eval from another version or setting is never reused.
export function computeLocalEngineEvaluationProfile(config: Config): string {
  const searchShape = {
    role: "deep-local",
    version: config.localStockfishVersion,
    nodes: config.localStockfishNodes,
    threads: config.localStockfishThreads,
    hashMb: config.localStockfishHashMb,
    multiPv: config.localStockfishMultiPv,
  };
  return createHash("sha256")
    .update(canonicalStringify(searchShape))
    .digest("hex");
}

// HEG.20: the selector's counts: the generator's speeds and ratings, but only selectorMonths, and
// every move (HE asked for 100). A profile of its own, so the generator's Explorer cache stays as it is.
export const SELECTOR_EXPLORER_MOVES = 100;
export function computeSelectorExplorerCacheProfile(config: Config): string {
  const requestShape = {
    dataset: "AMATEUR",
    source: "lichess",
    speeds: config.explorerSpeeds,
    ratings: config.explorerRatings,
    since: config.selectorMonths.since,
    until: config.selectorMonths.until,
    moves: SELECTOR_EXPLORER_MOVES,
  };
  return createHash("sha256")
    .update(canonicalStringify(requestShape))
    .digest("hex");
}

// HEG.21: the prior's evals. HE's search: one root move (searchmoves), the last exact score,
// the stop line included, as the curve's evals were read. Never mixed with the generator's own.
export function computeSelectorEngineProfile(config: Config): string {
  const searchShape = {
    role: "he-prior",
    version: config.localStockfishVersion,
    nodes: config.selectorNodes,
    threads: 1,
    hashMb: config.selectorHashMb,
    multiPv: 1,
    read: "last-exact-line",
  };
  return createHash("sha256")
    .update(canonicalStringify(searchShape))
    .digest("hex");
}

export function createRuntimeConfig(configSource: Config) {
  validateConfig(configSource);

  const config = JSON.parse(JSON.stringify(configSource)) as Config;

  function deepFreeze<T>(obj: T): T {
    Object.freeze(obj);
    if (obj !== null && typeof obj === "object") {
      for (const key of Object.getOwnPropertyNames(obj)) {
        const prop = (obj as Record<string, unknown>)[key];
        if (
          prop !== null &&
          (typeof prop === "object" || typeof prop === "function") &&
          !Object.isFrozen(prop)
        ) {
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
    configHash,
  };
}
