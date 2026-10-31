import { createHash } from "node:crypto";
import { open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertDataDirectory, runPath } from "./paths";
import type { GroupEval } from "./results";

// The curve: eval after Black's move (White's view) → Black's chance to win, draw or lose.
// An ordered logistic model, fitted on every game with a cp eval (mates stay out):
//   P(Black loses)            = σ(a1 + f(x))
//   P(Black loses or draws)   = σ(a2 + f(x)),   a1 < a2
// x is cpWhite in pawns, clipped to ±10. f is a natural cubic spline through the knots
// (a straight line beyond the outer knots), or a straight line when there are no knots.
export type Model = { name: string; knots: number[] };
export const MODELS: Model[] = [
  { name: "straight", knots: [] },
  { name: "spline-5", knots: [-6, -2, 0, 2, 6] },
  { name: "spline-7", knots: [-6, -3, -1, 0, 1, 3, 6] },
];
const CLIP = 10;
export type Group = { basis: number[]; losses: number; draws: number; wins: number };

// The spline and the curve's chances live in the app, which reads the frozen curve (HEG.22, HEG.80).
import { basis, chances, random, type Chances } from "../../src/lib/core/selector";
export { basis, chances, random, type Chances };
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const pawns = (cpWhite: number) => Math.max(-CLIP, Math.min(CLIP, cpWhite / 100));

// Log-likelihood and its gradient, each group counted `weight` times.
function logLikelihood(params: number[], groups: Group[], weights?: number[]): { value: number; gradient: number[] } {
  const gradient = new Array(params.length).fill(0);
  let value = 0;
  for (let i = 0; i < groups.length; i++) {
    const weight = weights ? weights[i] : 1;
    if (!weight) continue;
    const g = groups[i];
    const f = g.basis.reduce((sum, term, j) => sum + term * params[2 + j], 0);
    const s1 = sigmoid(params[0] + f), s2 = sigmoid(params[1] + f), draw = s2 - s1;
    if (!(draw > 0)) return { value: -Infinity, gradient };
    value += weight * (g.losses * Math.log(s1) + g.draws * Math.log(draw) + g.wins * Math.log(1 - s2));
    const d1 = s1 * (1 - s1), d2 = s2 * (1 - s2);
    const byA1 = g.losses * (1 - s1) - g.draws * d1 / draw;
    const byA2 = g.draws * d2 / draw - g.wins * s2;
    gradient[0] += weight * byA1; gradient[1] += weight * byA2;
    for (let j = 0; j < g.basis.length; j++) gradient[2 + j] += weight * (byA1 + byA2) * g.basis[j];
  }
  return { value, gradient };
}

function solve(matrix: number[][], vector: number[]): number[] {
  const n = vector.length, a = matrix.map((row, i) => [...row, vector[i]]);
  for (let c = 0; c < n; c++) {
    const pivot = a.slice(c).reduce((best, row, r) => Math.abs(row[c]) > Math.abs(a[best][c]) ? c + r : best, c);
    [a[c], a[pivot]] = [a[pivot], a[c]];
    for (let r = 0; r < n; r++) if (r !== c) {
      const factor = a[r][c] / a[c][c];
      for (let k = c; k <= n; k++) a[r][k] -= factor * a[c][k];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

// Newton's method, with the second derivatives taken numerically from the gradient.
export function fit(groups: Group[], knots: number[], weights?: number[], start?: number[]): { params: number[]; logLikelihood: number } {
  let params = start ? [...start] : (() => {
    const total = groups.reduce((t, g) => [t[0] + g.losses, t[1] + g.draws, t[2] + g.wins], [0, 0, 0]);
    const n = total[0] + total[1] + total[2], logit = (p: number) => Math.log(p / (1 - p));
    return [logit(total[0] / n), logit((total[0] + total[1]) / n), ...new Array(knots.length ? knots.length - 1 : 1).fill(0)];
  })();
  let current = logLikelihood(params, groups, weights);
  for (let iteration = 0; iteration < 100; iteration++) {
    const h = 1e-5, hessian = params.map((_, j) => {
      const up = [...params], down = [...params];
      up[j] += h; down[j] -= h;
      const gUp = logLikelihood(up, groups, weights).gradient, gDown = logLikelihood(down, groups, weights).gradient;
      return gUp.map((value, k) => (value - gDown[k]) / (2 * h));
    });
    const symmetric = hessian.map((row, j) => row.map((value, k) => (value + hessian[k][j]) / 2));
    const step = solve(symmetric, current.gradient.map(value => -value));
    let scale = 1, next = params, trial = current;
    while (scale > 1e-6) {
      next = params.map((value, j) => value + scale * step[j]);
      trial = logLikelihood(next, groups, weights);
      if (trial.value >= current.value) break;
      scale /= 2;
    }
    if (scale <= 1e-6) break;
    const gain = trial.value - current.value;
    params = next; current = trial;
    if (gain < 1e-9 && Math.max(...step.map(Math.abs)) < 1e-7) break;
  }
  return { params, logLikelihood: current.value };
}


const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
};
const BANDS = [-Infinity, -1000, -600, -400, -300, -200, -150, -100, -50, -25, 0, 25, 50, 100, 150, 200, 300, 400, 600, 1000, Infinity];

// Fits each model, compares them on games they did not see (5 folds, split by group), keeps the
// best, measures its uncertainty by refitting on resampled groups, and writes curve.json and curve.svg.
export async function writeCurve(name: string, resamples = 200) {
  const directory = runPath(name);
  await assertDataDirectory(directory);
  const rows: GroupEval[] = (await readFile(path.join(directory, "evals.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const usable = rows.filter(row => row.cpWhite !== null);
  const games = usable.reduce((sum, row) => sum + row.games, 0);
  const groupsFor = (knots: number[]) => usable.map(row => ({ basis: basis(pawns(row.cpWhite!), knots),
    losses: row.losses, draws: row.draws, wins: row.wins }));

  const fold = (row: GroupEval) => createHash("sha256").update("fold:" + row.id).digest().readUInt8(0) % 5;
  const comparison = MODELS.map(model => {
    const groups = groupsFor(model.knots);
    const whole = fit(groups, model.knots);
    let heldOut = 0;
    for (let k = 0; k < 5; k++) {
      const trained = fit(groups, model.knots, usable.map(row => fold(row) === k ? 0 : 1), whole.params);
      heldOut += logLikelihood(trained.params, groups, usable.map(row => fold(row) === k ? 1 : 0)).value;
    }
    return { ...model, params: whole.params, logLikelihood: whole.logLikelihood, parameters: whole.params.length,
      // Average surprise per unseen game, in bits: lower is better.
      heldOutBitsPerGame: -heldOut / games / Math.LN2 };
  });
  const noEval = (() => {
    const t = usable.reduce((s, r) => [s[0] + r.losses, s[1] + r.draws, s[2] + r.wins], [0, 0, 0]);
    return -(t[0] * Math.log(t[0] / games) + t[1] * Math.log(t[1] / games) + t[2] * Math.log(t[2] / games)) / games / Math.LN2;
  })();
  const best = comparison.reduce((x, y) => y.heldOutBitsPerGame < x.heldOutBitsPerGame ? y : x);

  const groups = groupsFor(best.knots), draw = random("curve:" + name);
  const grid = Array.from({ length: 81 }, (_, i) => -1000 + 25 * i);
  const samples: Chances[][] = [];
  for (let r = 0; r < resamples; r++) {
    const weights = new Array(groups.length).fill(0);
    for (let i = 0; i < groups.length; i++) weights[Math.floor(draw() * groups.length)]++;
    const refit = fit(groups, best.knots, weights, best.params);
    samples.push(grid.map(cp => chances(refit.params, best.knots, cp)));
    console.error("resample " + (r + 1) + " of " + resamples);
  }
  const table = grid.map((cp, i) => {
    const centre = chances(best.params, best.knots, cp);
    const range = (key: keyof Chances) => [percentile(samples.map(s => s[i][key]), 0.025), percentile(samples.map(s => s[i][key]), 0.975)];
    return { cpWhite: cp, ...centre, scoreRange: range("score"), drawRange: range("draw") };
  });
  const bands = BANDS.slice(0, -1).map((low, i) => {
    const high = BANDS[i + 1], inBand = usable.filter(row => row.cpWhite! >= low && row.cpWhite! < high);
    const n = inBand.reduce((sum, row) => sum + row.games, 0);
    const sum = (pick: (row: GroupEval) => number) => inBand.reduce((total, row) => total + pick(row), 0);
    const predicted = (key: keyof Chances) => sum(row => row.games * chances(best.params, best.knots, row.cpWhite!)[key]) / n;
    return { low, high, games: n, meanCp: sum(row => row.cpWhite! * row.games) / n,
      observed: { win: sum(row => row.wins) / n, draw: sum(row => row.draws) / n, loss: sum(row => row.losses) / n,
        score: (sum(row => row.wins) + sum(row => row.draws) / 2) / n },
      predicted: { win: predicted("win"), draw: predicted("draw"), loss: predicted("loss"), score: predicted("score") } };
  });
  const result = { run: name, games, groups: usable.length, mates: rows.length - usable.length, clipPawns: CLIP,
    noEvalBitsPerGame: noEval, comparison,
    chosen: { name: best.name, knots: best.knots, params: best.params }, resamples, table, bands };
  // Exclusive destination protects an existing curve.
  const output = await open(path.join(directory, "curve.json"), "wx");
  await output.write(JSON.stringify(result, null, 2) + "\n"); await output.close();
  await writeFile(path.join(directory, "curve.svg"), drawCurve(table, bands, name), { flag: "wx" });
  return { destination: path.join(directory, "curve.json"), chosen: best.name, noEvalBitsPerGame: noEval,
    comparison: comparison.map(m => ({ name: m.name, parameters: m.parameters, heldOutBitsPerGame: m.heldOutBitsPerGame })) };
}

type Row = { cpWhite: number; score: number; scoreRange: number[] };
type Band = { games: number; meanCp: number; observed: { score: number } };
function drawCurve(table: Row[], bands: Band[], name: string): string {
  const left = 80, right = 690, top = 40, bottom = 370;
  const x = (cp: number) => left + (cp + 1000) / 2000 * (right - left);
  const y = (score: number) => bottom - score * (bottom - top);
  const line = (points: [number, number][]) => points.map(([px, py], i) => (i ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1)).join("");
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 440" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="13" fill="#333">',
    '<rect width="720" height="440" fill="#ffffff"/>',
    '<text x="80" y="24" font-size="15" font-weight="600">Eval → Black’s score, ' + name + '</text>'];
  for (const score of [0, 0.25, 0.5, 0.75, 1])
    parts.push('<line x1="' + left + '" x2="' + right + '" y1="' + y(score) + '" y2="' + y(score) + '" stroke="#e3e3e3"/><text x="70" y="' + (y(score) + 4) + '" text-anchor="end">' + score * 100 + '%</text>');
  for (let cp = -1000; cp <= 1000; cp += 250)
    parts.push('<line y1="' + top + '" y2="' + bottom + '" x1="' + x(cp) + '" x2="' + x(cp) + '" stroke="#e3e3e3"/><text x="' + x(cp) + '" y="390" text-anchor="middle">' + (cp > 0 ? "+" : "") + cp + '</text>');
  parts.push('<path d="' + line(table.map(r => [x(r.cpWhite), y(r.scoreRange[1])])) + line(table.slice().reverse().map(r => [x(r.cpWhite), y(r.scoreRange[0])])).replace("M", "L") + 'Z" fill="#1c64b4" fill-opacity="0.18"/>');
  parts.push('<path d="' + line(table.map(r => [x(r.cpWhite), y(r.score)])) + '" fill="none" stroke="#1c64b4" stroke-width="3"/>');
  for (const band of bands) if (band.games && Math.abs(band.meanCp) <= 1000)
    parts.push('<circle cx="' + x(band.meanCp).toFixed(1) + '" cy="' + y(band.observed.score).toFixed(1) + '" r="' + Math.max(2, Math.sqrt(band.games) / 12).toFixed(1) + '" fill="#d9480f" fill-opacity="0.7"/>');
  parts.push('<text x="' + (right - 4) + '" y="58" text-anchor="end">line: fitted · shade: 95% range · dots: games in each band</text>',
    '<text x="385" y="420" text-anchor="middle">Eval after Black’s move, cp, White’s view (+ = good for White)</text>',
    '<text transform="translate(22 205) rotate(-90)" text-anchor="middle">Black’s score (win + ½ draw)</text>', "</svg>");
  return parts.join("\n") + "\n";
}
