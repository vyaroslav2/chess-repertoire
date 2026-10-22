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
// move number, and writes k.json.
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
  const result = { run: name, curve: curve.chosen.name, kSearched: [K_MIN, K_MAX], all, splits };
  // Exclusive destination protects an existing fit.
  const output = await open(path.join(directory, "k.json"), "wx");
  await output.write(JSON.stringify(result, null, 2) + "\n"); await output.close();
  return result;
}
