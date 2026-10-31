import { chances, type Curve } from "./selector";

// HEG.22–23: what the selector measured, frozen here so the generator never reads experiments/.
// These are measurements, not settings: they change only with a new measurement.

/**
 * HEG.22: the pool's chosen curve, from experiments/he/data/runs/2024-02-03/curve.json
 * (Feb and Mar 2024 games, average 1600–2199, rapid and classical, gap under 100; HE).
 */
export const SELECTOR_CURVE = {
  name: "spline-7",
  knots: [-6, -3, -1, 0, 1, 3, 6],
  params: [0.45158060992151344, 0.6890026105789812, 0.30049705487510137, -1.065967626485443,
    5.847533992761052, -12.502596932706808, 3.3560015306514486, 8.73065281443183],
  source: "experiments/he/data/runs/2024-02-03/curve.json"
} as const;

/**
 * HEG.23: k(move) = k2 × r^(move − 2), the best fit on Explorer groups
 * (experiments/he/data/runs/explorer-k/k.json; HEK.83).
 */
export const SELECTOR_K_TREND = {
  k2: 264.9093189593961,
  r: 0.8793507485905065,
  firstMove: 2,
  lastMove: 15,
  source: "experiments/he/data/runs/explorer-k/k.json"
} as const;

export const selectorCurve: Curve = cpWhite =>
  chances([...SELECTOR_CURVE.params], [...SELECTOR_CURVE.knots], cpWhite);

/** k for Black's move number; moves outside the trend's range take its nearest end, as HE's `select` does. */
export function selectorK(moveNumber: number): number {
  const move = Math.min(SELECTOR_K_TREND.lastMove, Math.max(SELECTOR_K_TREND.firstMove, moveNumber));
  return SELECTOR_K_TREND.k2 * SELECTOR_K_TREND.r ** (move - SELECTOR_K_TREND.firstMove);
}
