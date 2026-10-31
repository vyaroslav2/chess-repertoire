import { createHash } from "crypto";

// HES, HEG: the selector's maths. One copy for both users: the generator (HEG.80) and HE's
// `select` report, which imports it from here. In a position with Black to move, the champion
// (Stockfish's move) stays unless another move's human games show, at the chosen confidence,
// that it scores better by more than the margin, within the cp limits.

export type Record3 = { wins: number; draws: number; losses: number };   // Black's view
export type Dials = { confidence: number; margin: number; cpLimit: number; draws: number; nearTie: number };
// HES.20, HES.104. Score is a fraction: a margin of 0.01 is 1 point.
export const DIALS: Dials = { confidence: 0.9, margin: 0.01, cpLimit: 30, draws: 20_000, nearTie: 0.005 };
export type Chances = { win: number; draw: number; loss: number; score: number };
export type Curve = (cpWhite: number) => Chances;

// --- The curve: an eval's expected win, draw and loss for Black (HE) ---

const CLIP = 10;
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const cube = (z: number) => z > 0 ? z * z * z : 0;
// Harrell's restricted cubic spline: x, then one curved term per inner knot.
export function basis(x: number, knots: number[]): number[] {
  const k = knots.length, terms = [x];
  for (let j = 0; j < k - 2; j++) {
    const last = knots[k - 1], before = knots[k - 2], scale = (last - knots[0]) ** 2;
    terms.push((cube(x - knots[j]) - cube(x - before) * (last - knots[j]) / (last - before) +
      cube(x - last) * (before - knots[j]) / (last - before)) / scale);
  }
  return terms;
}
const pawns = (cpWhite: number) => Math.max(-CLIP, Math.min(CLIP, cpWhite / 100));

export function chances(params: number[], knots: number[], cpWhite: number): Chances {
  const terms = basis(pawns(cpWhite), knots);
  const f = terms.reduce((sum, term, j) => sum + term * params[2 + j], 0);
  const loss = sigmoid(params[0] + f), lossOrDraw = sigmoid(params[1] + f);
  return { win: 1 - lossOrDraw, draw: lossOrDraw - loss, loss, score: 1 - lossOrDraw + (lossOrDraw - loss) / 2 };
}

// A seeded generator, so a judgement is the same on every run.
export function random(seed: string) {
  let state = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- The cloud and the safe gain (HES.15–16) ---

// Marsaglia and Tsang; a shape below 1 is lifted by one and scaled back.
function gamma(next: () => number, shape: number): number {
  if (shape < 1) return gamma(next, shape + 1) * Math.pow(next(), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const z = Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()), v = (1 + c * z) ** 3;
    if (v > 0 && Math.log(next()) < z * z / 2 + d - d * v + d * Math.log(v)) return d * v;
  }
}

// HES.15: draws of a move's score from its cloud, Dirichlet(k × the curve's chances + its games).
export function scoreDraws(curve: Curve, cpWhite: number, k: number, record: Record3, count: number, seed: string) {
  const centre = curve(cpWhite), next = random(seed), draws = new Float64Array(count);
  const alpha = [k * centre.loss + record.losses, k * centre.draw + record.draws, k * centre.win + record.wins];
  for (let i = 0; i < count; i++) {
    const [loss, draw, win] = alpha.map(a => gamma(next, a));
    draws[i] = (win + draw / 2) / (loss + draw + win);
  }
  return draws;
}

// HES.16: the gain at the unlucky end, e.g. its 10th percentile for 90%.
export function safeGain(contender: Float64Array, champion: Float64Array, confidence: number) {
  const gains = contender.map((score, i) => score - champion[i]).sort();
  return { mean: gains.reduce((sum, gain) => sum + gain, 0) / gains.length, safe: gains[Math.floor((1 - confidence) * gains.length)] };
}

export const score = (r: Record3) => (r.wins + r.draws / 2) / (r.wins + r.draws + r.losses);
export const games = (r: Record3) => r.wins + r.draws + r.losses;

// HES.13: whether a contender could pass at all, before its search: its real games with the best
// prior a contender can have, the champion's (HES.21). A worse eval only lowers its belief, so a
// contender this drops would fail its full search too. The slack covers the draws' own noise.
const BOUND_SLACK = 0.005;
export function couldPass(curve: Curve, championCp: number, champion: Float64Array, k: number, record: Record3, dials: Dials, seed: string) {
  const best = scoreDraws(curve, championCp, k, record, dials.draws, seed);
  return safeGain(best, champion, dials.confidence).safe > dials.margin - BOUND_SLACK;
}

// --- One contender, and the choice (HES.14–18) ---

export type Evaluation2M = { cpWhite: number | null; mateWhite: number | null };
export type Verdict = "passes" | "best-case" | "safe-gain" | "cp-limit" | "mate";
export type Judged = { uci: string; san: string; games: number; score: number; verdict: Verdict;
  cpWhite?: number | null; mateWhite?: number | null; cpLoss?: number | null; priorScore?: number; belief?: number; safeGain?: number };
/**
 * The engine check (HES.17). By default the cp loss is the 2M evals' difference, as HE's report
 * measures it. The generator measures it at 200M instead (HEG.32), and allows less than the cp
 * limit when the line budget has less left (HEG.31). A null cp loss (a mate score) never passes.
 */
export type EngineCheck = { cpAllowed?: number; cpLoss?: () => Promise<number | null> };

// HES.14–17 for one contender. evaluate is called only when the contender could pass.
export async function judge(contender: { uci: string; san: string; record: Record3 }, champion: { cpWhite: number; draws: Float64Array },
  curve: Curve, k: number, dials: Dials, seed: string, evaluate: () => Promise<Evaluation2M>, check: EngineCheck = {}): Promise<Judged> {
  const base = { uci: contender.uci, san: contender.san, games: games(contender.record), score: score(contender.record) };
  if (!couldPass(curve, champion.cpWhite, champion.draws, k, contender.record, dials, seed)) return { ...base, verdict: "best-case" };
  const evaluation = await evaluate();
  if (evaluation.cpWhite === null) return { ...base, verdict: "mate", cpWhite: null, mateWhite: evaluation.mateWhite };
  // Black's view: a higher cpWhite is worse for Black. The champion is the engine's top move, so
  // a contender's prior is never better than its: a switch must come from the games, not from
  // the 2M search rating a move above the tree's deeper choice.
  const priorCp = Math.max(evaluation.cpWhite, champion.cpWhite);
  const draws = scoreDraws(curve, priorCp, k, contender.record, dials.draws, seed);
  const gain = safeGain(draws, champion.draws, dials.confidence);
  const scored = { ...base, cpWhite: evaluation.cpWhite, mateWhite: null, priorScore: curve(priorCp).score,
    belief: draws.reduce((sum, d) => sum + d, 0) / draws.length, safeGain: gain.safe };
  if (gain.safe <= dials.margin) return { ...scored, verdict: "safe-gain", cpLoss: evaluation.cpWhite - champion.cpWhite };
  const cpLoss = check.cpLoss ? await check.cpLoss() : evaluation.cpWhite - champion.cpWhite;
  const verdict = cpLoss === null ? "mate" : cpLoss > (check.cpAllowed ?? dials.cpLimit) ? "cp-limit" : "passes";
  return { ...scored, verdict, cpLoss };
}

// HES.18: the highest safe gain wins; a near-tie goes to the better eval.
export function choose(judged: Judged[], dials: Dials) {
  const passing = judged.filter(j => j.verdict === "passes").sort((x, y) => y.safeGain! - x.safeGain!);
  if (!passing.length) return null;
  return passing.filter(j => passing[0].safeGain! - j.safeGain! <= dials.nearTie)
    .sort((x, y) => x.cpWhite! - y.cpWhite! || y.safeGain! - x.safeGain!)[0];
}
