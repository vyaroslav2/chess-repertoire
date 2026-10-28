import { open, readFile } from "node:fs/promises";
import path from "node:path";
import { chances } from "./curve";
import { assertDataDirectory, runPath } from "./paths";
import type { GroupEval } from "./results";

// k: how far real moves stray from the curve. Each move's true chances are taken to scatter
// around the curve's chances at its eval, like a Dirichlet worth k fake games: big k, little
// scatter. A group's counts then follow a Dirichlet-multinomial, and k is the value under which
// the groups with 2+ games are least surprising. One-game groups say nothing about scatter.
export type KGroup = { counts: number[]; centre: number[] };   // [loss, draw, win], Black's view
const K_MIN = 0.5, K_MAX = 100_000;

// Lanczos approximation, g = 7.
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let sum = LANCZOS[0];
  for (let i = 1; i < 9; i++) sum += LANCZOS[i] / (x + i);
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

// Log-likelihood of k, leaving out the multinomial coefficients, which do not depend on k.
export function kLikelihood(k: number, groups: KGroup[]): number {
  let value = 0;
  for (const { counts, centre } of groups) {
    const n = counts[0] + counts[1] + counts[2];
    value += logGamma(k) - logGamma(k + n);
    for (let c = 0; c < 3; c++) value += logGamma(k * centre[c] + counts[c]) - logGamma(k * centre[c]);
  }
  return value;
}

// The best k, searched on a log scale, and its 95% range: where the log-likelihood is 1.92 below
// its peak. A range that runs off the searched scale is open (null).
export function fitK(groups: KGroup[]) {
  const at = (logK: number) => kLikelihood(Math.exp(logK), groups);
  const low = Math.log(K_MIN), high = Math.log(K_MAX), steps = 200;
  const grid = Array.from({ length: steps + 1 }, (_, i) => low + (high - low) * i / steps);
  const values = grid.map(at);
  const top = values.indexOf(Math.max(...values));
  let a = grid[Math.max(0, top - 1)], b = grid[Math.min(steps, top + 1)];
  for (let i = 0; i < 60; i++) {
    const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618;
    if (at(m1) < at(m2)) a = m1; else b = m2;
  }
  const best = (a + b) / 2, peak = at(best);
  const edge = (from: number, to: number) => {
    if (at(to) > peak - 1.92) return null;
    for (let i = 0; i < 60; i++) { const mid = (from + to) / 2; if (at(mid) > peak - 1.92) from = mid; else to = mid; }
    return Math.exp((from + to) / 2);
  };
  return { k: Math.exp(best), range: [edge(best, low), edge(best, high)], logLikelihood: peak,
    // How much better the best k explains the groups than no scatter at all (k = K_MAX), in bits.
    bitsOverNoScatter: (peak - at(high)) / Math.LN2,
    groups: groups.length, games: groups.reduce((sum, g) => sum + g.counts[0] + g.counts[1] + g.counts[2], 0) };
}

// k as a trend over Black's move: k(move) = k2 × r^(move − 2), a straight line in log k. Two
// numbers fitted on all groups at once give a k for every move, even one with few groups.
const TREND = { first: 2, last: 15, low: Math.log(0.001), high: Math.log(1e7), step: 0.01, logR: [-3, 1] };
const CHI2_95 = [3.84, 5.99, 7.81, 9.49, 11.07, 12.59, 14.07, 15.51, 16.92, 18.31, 19.68, 21.03, 22.36, 23.68];

function golden(f: (x: number) => number, a: number, b: number) {
  for (let i = 0; i < 60; i++) {
    const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618;
    if (f(m1) < f(m2)) a = m1; else b = m2;
  }
  return (a + b) / 2;
}
// The ends of the 95% range of a profile log-likelihood on [low, high]: null where it runs off.
function profileRange(profile: (x: number) => number, peak: number, low: number, high: number) {
  const inside = (x: number) => profile(x) > peak - 1.92;
  const grid = Array.from({ length: Math.round((high - low) / 0.05) + 1 }, (_, i) => low + i * 0.05);
  const flags = grid.map(inside), first = flags.indexOf(true), last = flags.lastIndexOf(true);
  const edge = (from: number, to: number) => {
    for (let i = 0; i < 40; i++) { const mid = (from + to) / 2; if (inside(mid)) from = mid; else to = mid; }
    return (from + to) / 2;
  };
  return [first <= 0 ? null : edge(grid[first], grid[first - 1]), last < 0 || last === grid.length - 1 ? null : edge(grid[last], grid[last + 1])];
}

export function fitKTrend(byMove: Map<number, KGroup[]>) {
  const size = Math.round((TREND.high - TREND.low) / TREND.step);
  // Each move's log-likelihood on a fine grid of log k, so the fit only adds up tables.
  const tables = [...byMove].filter(([, groups]) => groups.length).map(([move, groups]) => ({ move, groups,
    values: Array.from({ length: size + 1 }, (_, i) => kLikelihood(Math.exp(TREND.low + i * TREND.step), groups)) }));
  const lookup = (values: number[], logK: number) => {
    const x = (Math.min(TREND.high, Math.max(TREND.low, logK)) - TREND.low) / TREND.step;
    const i = Math.min(size - 1, Math.floor(x)), t = x - i;
    return values[i] * (1 - t) + values[i + 1] * t;
  };
  const at = (logK2: number, logR: number) =>
    tables.reduce((sum, { move, values }) => sum + lookup(values, logK2 + logR * (move - 2)), 0);
  // k2 and r trade off against each other; k at the games' mean move does not, so it is
  // searched for each r, and r around it.
  const games = (groups: KGroup[]) => groups.reduce((sum, g) => sum + g.counts[0] + g.counts[1] + g.counts[2], 0);
  const middle = tables.reduce((sum, t) => sum + t.move * games(t.groups), 0) / tables.reduce((sum, t) => sum + games(t.groups), 0);
  const atMiddle = (logK: number, logR: number) => at(logK - logR * (middle - 2), logR);
  const bestMiddle = (logR: number) => golden(logK => atMiddle(logK, logR), TREND.low, TREND.high);
  const logR = golden(x => atMiddle(bestMiddle(x), x), TREND.logR[0], TREND.logR[1]);
  const best = { logK2: bestMiddle(logR) - logR * (middle - 2), logR };
  const peak = at(best.logK2, best.logR);
  const overR = (k: (logR: number) => number) => (logR: number) => at(k(logR), logR);
  const profileK2 = (logK2: number) => at(logK2, golden(logR => at(logK2, logR), TREND.logR[0], TREND.logR[1]));
  const profileR = (logR: number) => atMiddle(bestMiddle(logR), logR);
  const exp = (range: (number | null)[]) => range.map(x => x === null ? null : Math.exp(x));
  // The same fit with each move free to have its own k: the trend holds if it does about as well.
  const free = tables.reduce((sum, { values }) => sum + Math.max(...values), 0);
  const df = tables.length - 2, chiSquare = 2 * (free - peak);
  const moves = [];
  for (let move = TREND.first; move <= TREND.last; move++) {
    const groups = byMove.get(move) ?? [];
    // k at this move, with every trend through it allowed: log k2 = log k − (move − 2) log r.
    const profile = (logK: number) => { const through = overR(logR => logK - logR * (move - 2));
      return through(golden(through, TREND.logR[0], TREND.logR[1])); };
    moves.push({ move, groups: groups.length, games: games(groups),
      k: Math.exp(best.logK2 + best.logR * (move - 2)), range: exp(profileRange(profile, peak, TREND.low, TREND.high)) });
  }
  return { model: "k(move) = k2 × r^(move − 2)", kSearched: [Math.exp(TREND.low), Math.exp(TREND.high)],
    k2: { value: Math.exp(best.logK2), range: exp(profileRange(profileK2, peak, TREND.low, TREND.high)) },
    r: { value: Math.exp(best.logR), range: exp(profileRange(profileR, peak, TREND.logR[0], TREND.logR[1])) },
    logLikelihood: peak,
    check: { freeLogLikelihood: free, chiSquare, df, critical95: df > 0 ? CHI2_95[df - 1] : null, holds: df <= 0 || chiSquare <= CHI2_95[df - 1] },
    moves };
}

const mainMove = (row: GroupEval) => Number(Object.entries(row.moveNumbers).sort((x, y) => y[1] - x[1])[0][0]);
const SPLITS: Record<string, { label: string; keep: (row: GroupEval) => boolean }[]> = {
  size: [[2, 9], [10, 49], [50, 199], [200, Infinity]].map(([lo, hi]) =>
    ({ label: hi === Infinity ? lo + "+" : lo + "–" + hi, keep: (row: GroupEval) => row.games >= lo && row.games <= hi })),
  eval: [[-Infinity, -150], [-150, -50], [-50, 50], [50, 150], [150, Infinity]].map(([lo, hi]) =>
    ({ label: lo + " to " + hi, keep: (row: GroupEval) => row.cpWhite! >= lo && row.cpWhite! < hi })),
  move: [[2, 3], [4, 6], [7, 10], [11, 15]].map(([lo, hi]) =>
    ({ label: lo + "–" + hi, keep: (row: GroupEval) => mainMove(row) >= lo && mainMove(row) <= hi })),
};

// Fits k on all groups with 2+ games and a cp eval, then separately by group size, eval and
// move number, then as a trend over the move, and writes k.json.
export async function writeK(name: string) {
  const directory = runPath(name);
  await assertDataDirectory(directory);
  const curve = JSON.parse(await readFile(path.join(directory, "curve.json"), "utf8"));
  const rows: GroupEval[] = (await readFile(path.join(directory, "evals.jsonl"), "utf8")).trim().split("\n")
    .map(line => JSON.parse(line)).filter((row: GroupEval) => row.cpWhite !== null && row.games >= 2);
  const toGroup = (row: GroupEval): KGroup => {
    const c = chances(curve.chosen.params, curve.chosen.knots, row.cpWhite!);
    return { counts: [row.losses, row.draws, row.wins], centre: [c.loss, c.draw, c.win] };
  };
  const all = fitK(rows.map(toGroup));
  const splits = Object.fromEntries(Object.entries(SPLITS).map(([split, parts]) =>
    [split, parts.map(part => ({ part: part.label, ...fitK(rows.filter(part.keep).map(toGroup)) }))]));
  const byMove = new Map<number, KGroup[]>();
  for (const row of rows) byMove.set(mainMove(row), [...byMove.get(mainMove(row)) ?? [], toGroup(row)]);
  const trend = fitKTrend(byMove);
  const result = { run: name, curve: curve.chosen.name, kSearched: [K_MIN, K_MAX], all, splits, trend };
  // Exclusive destination protects an existing fit.
  const output = await open(path.join(directory, "k.json"), "wx");
  await output.write(JSON.stringify(result, null, 2) + "\n"); await output.close();
  return result;
}
