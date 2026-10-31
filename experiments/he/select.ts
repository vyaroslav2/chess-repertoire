import { DatabaseSync } from "node:sqlite";
import { open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Chess } from "chess.js";
import { computeExplorerCacheProfile, defaultConfig } from "../../src/lib/core/config";
import { chances, random } from "./curve";
import { HeEngine, type Evaluation } from "./engine";
import { assertDataDirectory, DATA_ROOT, HE_ROOT, runPath } from "./paths";
import { explorerCounts, httpFetcher, DEFAULT_BASE, EXPLORER, type ExplorerAnswer, type Fetcher, type Months } from "./explorer";

// The selector (HES): in a position with Black to move, the tree's move (the champion) stays
// unless another move's human games show, at the chosen confidence, that it scores better by
// more than the margin, within the per-move cp limit.
export type Record3 = { wins: number; draws: number; losses: number };   // Black's view
export type Dials = { confidence: number; margin: number; cpLimit: number; draws: number; nearTie: number };
// HES.20. Score is a fraction: a margin of 0.01 is 1 point.
export const DIALS: Dials = { confidence: 0.9, margin: 0.01, cpLimit: 30, draws: 20_000, nearTie: 0.005 };
export type Curve = (cpWhite: number) => { win: number; draw: number; loss: number; score: number };

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

// HES.16: the gain at the unlucky end, e.g. its 5th percentile for 95%.
export function safeGain(contender: Float64Array, champion: Float64Array, confidence: number) {
  const gains = contender.map((score, i) => score - champion[i]).sort();
  return { mean: gains.reduce((sum, gain) => sum + gain, 0) / gains.length, safe: gains[Math.floor((1 - confidence) * gains.length)] };
}

const score = (r: Record3) => (r.wins + r.draws / 2) / (r.wins + r.draws + r.losses);
const games = (r: Record3) => r.wins + r.draws + r.losses;

// HES.13: whether a contender could pass at all, before its search: its real games with the best
// prior a contender can have, the champion's (HES.21). A worse eval only lowers its belief, so a
// contender this drops would fail its full search too. The slack covers the draws' own noise.
const BOUND_SLACK = 0.005;
export function couldPass(curve: Curve, championCp: number, champion: Float64Array, k: number, record: Record3, dials: Dials, seed: string) {
  const best = scoreDraws(curve, championCp, k, record, dials.draws, seed);
  return safeGain(best, champion, dials.confidence).safe > dials.margin - BOUND_SLACK;
}

export type Verdict = "passes" | "best-case" | "safe-gain" | "cp-limit" | "mate";
export type Judged = { uci: string; san: string; games: number; score: number; verdict: Verdict;
  cpWhite?: number | null; mateWhite?: number | null; cpLoss?: number; priorScore?: number; belief?: number; safeGain?: number };

// HES.14–17 for one contender. evaluate is called only when the contender could pass.
export async function judge(contender: { uci: string; san: string; record: Record3 }, champion: { cpWhite: number; draws: Float64Array },
  curve: Curve, k: number, dials: Dials, seed: string, evaluate: () => Promise<Evaluation>): Promise<Judged> {
  const base = { uci: contender.uci, san: contender.san, games: games(contender.record), score: score(contender.record) };
  if (!couldPass(curve, champion.cpWhite, champion.draws, k, contender.record, dials, seed)) return { ...base, verdict: "best-case" };
  const evaluation = await evaluate();
  if (evaluation.cpWhite === null) return { ...base, verdict: "mate", cpWhite: null, mateWhite: evaluation.mateWhite };
  // Black's view: a higher cpWhite is worse for Black. The champion is the engine's top move, so
  // a contender's prior is never better than its: a switch must come from the games, not from
  // the 2M search rating a move above the tree's deeper choice.
  const priorCp = Math.max(evaluation.cpWhite, champion.cpWhite), cpLoss = evaluation.cpWhite - champion.cpWhite;
  const draws = scoreDraws(curve, priorCp, k, contender.record, dials.draws, seed);
  const gain = safeGain(draws, champion.draws, dials.confidence);
  const verdict = gain.safe <= dials.margin ? "safe-gain" : cpLoss > dials.cpLimit ? "cp-limit" : "passes";
  return { ...base, verdict, cpWhite: evaluation.cpWhite, mateWhite: null, cpLoss, priorScore: curve(priorCp).score,
    belief: draws.reduce((sum, d) => sum + d, 0) / draws.length, safeGain: gain.safe };
}

// HES.18: the highest safe gain wins; a near-tie goes to the better eval.
export function choose(judged: Judged[], dials: Dials) {
  const passing = judged.filter(j => j.verdict === "passes").sort((x, y) => y.safeGain! - x.safeGain!);
  if (!passing.length) return null;
  return passing.filter(j => passing[0].safeGain! - j.safeGain! <= dials.nearTie)
    .sort((x, y) => x.cpWhite! - y.cpWhite! || y.safeGain! - x.safeGain!)[0];
}

type TreeRow = { id: string; positionKey: string; fullFen: string; cumProb: number; displayPgn: string;
  san: string; uci: string; selectionMethod: string | null };
type ExplorerRow = { uci: string; san: string; whiteWins: number; draws: number; blackWins: number };
type ChampionInfo = { games: number; score: number | null; cpWhite: number | null; mateWhite: number | null; top2M: string | null };
// One line of selections.jsonl: a position, its champion, and what the selector did there.
export type SelectionRow = { line: string; fullFen: string; cumProb: number; moveNumber: number; champion: string; chosen: string;
  skipped?: "fixed" | "no-games" | "mate"; k?: number; championInfo?: ChampionInfo; contenders?: Judged[]; switched?: boolean };

// Runs the selector over every tree position with Black to move and a move already chosen,
// and writes data/selections/<name>/selections.jsonl and selections-summary.json. The curve comes
// from the pool; k's trend from kRun, the pool unless another run's k.json is named (HEK.81).
// Move counts come from the app's Explorer cache (all years), or with months from the Explorer
// for those months only (HES.90).
export async function selectMoves(name: string, pool: string, kChoice: "low" | "best", binary: string,
  database = path.resolve(HE_ROOT, "../../prisma/dev.db"), dials: Dials = DIALS, kRun = pool, months?: Months) {
  runPath(name);
  const directory = path.join(DATA_ROOT, "selections", name);
  await assertDataDirectory(directory);
  const curveFile = JSON.parse(await readFile(path.join(runPath(pool), "curve.json"), "utf8"));
  const kFile = JSON.parse(await readFile(path.join(runPath(kRun), "k.json"), "utf8"));
  if (!kFile.trend) throw new Error(kRun + "'s k.json has no trend: run k again on it.");
  const curve: Curve = cp => chances(curveFile.chosen.params, curveFile.chosen.knots, cp);
  const kFor = (move: number) => {
    const row = kFile.trend.moves.find((m: { move: number }) => m.move === Math.min(15, Math.max(2, move)));
    return kChoice === "best" ? row.k : row.range[0] ?? kFile.trend.kSearched[0];
  };
  const db = new DatabaseSync(database, { readOnly: true });
  const tree = db.prepare(`SELECT n.id, n.positionKey, n.fullFen, n.cumProb, n.displayPgn, m.san, m.uci, m.selectionMethod
    FROM RepertoireNode n JOIN RepertoireMove m ON m.fromNodeId = n.id AND m.playerTurn = 'RESPONSE'
    WHERE n.transposesTo IS NULL ORDER BY n.cumProb DESC`).all() as TreeRow[];
  const explorer = db.prepare(`SELECT m.uci, m.san, m.whiteWins, m.draws, m.blackWins FROM PositionCache c
    JOIN PositionCacheMove m ON m.cacheId = c.id WHERE c.positionKey = ? AND c.cacheProfile = ?`);
  const explorerProfile = computeExplorerCacheProfile(defaultConfig);
  // Exclusive destination protects an earlier selection.
  const destination = path.join(directory, "selections.jsonl"), summaryFile = path.join(directory, "selections-summary.json");
  const engine = await HeEngine.start(binary);
  const output = await open(destination, "wx").catch(error => { engine.close(); throw error; });
  const rows: SelectionRow[] = [];
  let searches = 0;
  try {
    for (const node of tree) {
      const moveNumber = Number(node.fullFen.split(" ")[5]);
      const base = { line: node.displayPgn, fullFen: node.fullFen, cumProb: node.cumProb, moveNumber, champion: node.san };
      const moves = months ? explorerMoves(node.fullFen, (await explorerCounts(node.fullFen, months)).answer)
        : (explorer.all(node.positionKey, explorerProfile) as ExplorerRow[]).map(m => ({ uci: m.uci, san: m.san,
          record: { wins: m.blackWins, draws: m.draws, losses: m.whiteWins } }));
      // HES.10: Black's first move is fixed; with no games there is nothing to judge.
      const skip = moveNumber === 1 || node.selectionMethod === "Hardcoded" ? "fixed" as const : !moves.some(m => games(m.record)) ? "no-games" as const : null;
      if (skip) { rows.push({ ...base, skipped: skip, chosen: node.san }); await output.write(JSON.stringify(rows.at(-1)) + "\n"); continue; }
      const k = kFor(moveNumber);
      const evaluate = (uci?: string) => { searches++; return engine.evaluate(node.fullFen, uci); };
      // HES.11: the champion's eval at 2M, and whether a 2M search would pick another top move.
      const championEval = await evaluate(node.uci), top = await evaluate();
      const record = moves.find(m => m.uci === node.uci)?.record ?? { wins: 0, draws: 0, losses: 0 };
      const championInfo = { games: games(record), score: games(record) ? score(record) : null, cpWhite: championEval.cpWhite,
        mateWhite: championEval.mateWhite, top2M: top.uci === node.uci ? null : new Chess(node.fullFen).move(top.uci).san };
      if (championEval.cpWhite === null) {
        rows.push({ ...base, k, championInfo, skipped: "mate", chosen: node.san });
        await output.write(JSON.stringify(rows.at(-1)) + "\n"); continue;
      }
      const seed = "select:" + node.positionKey;
      const champion = { cpWhite: championEval.cpWhite, draws: scoreDraws(curve, championEval.cpWhite, k, record, dials.draws, seed + ":" + node.uci) };
      const legal = new Set(new Chess(node.fullFen).moves({ verbose: true }).map(m => m.lan));
      const judged = [];
      for (const move of moves.filter(m => m.uci !== node.uci && games(m.record) && legal.has(m.uci)))
        judged.push(await judge(move, champion, curve, k, dials, seed + ":" + move.uci, () => evaluate(move.uci)));
      const winner = choose(judged, dials);
      rows.push({ ...base, k, championInfo, contenders: judged, chosen: winner?.san ?? node.san, switched: !!winner });
      await output.write(JSON.stringify(rows.at(-1)) + "\n");
      console.error(rows.length + "/" + tree.length + " " + node.displayPgn + ": " + (winner ? node.san + " --> " + winner.san : node.san));
    }
  } catch (error) {
    await output.close(); await unlink(destination); throw error;
  } finally { engine.close(); db.close(); }
  await output.close();
  const judgedRows = rows.filter(r => !r.skipped), switches = judgedRows.filter(r => r.switched);
  const cumProb = (list: SelectionRow[]) => list.reduce((sum, r) => sum + r.cumProb, 0);
  const byMove: Record<number, { judged: number; switches: number }> = {};
  for (const r of judgedRows) {
    byMove[r.moveNumber] ??= { judged: 0, switches: 0 };
    byMove[r.moveNumber].judged++;
    if (r.switched) byMove[r.moveNumber].switches++;
  }
  const verdicts: Record<string, number> = {};
  for (const r of judgedRows) for (const c of r.contenders ?? []) verdicts[c.verdict] = (verdicts[c.verdict] ?? 0) + 1;
  const summary = { name, pool, k: kChoice, kRun, dials, curve: curveFile.chosen.name, engine: engine.profile.id,
    counts: months ?? { explorerProfile, database },
    positions: rows.length, judged: judgedRows.length,
    skipped: Object.fromEntries(["fixed", "no-games", "mate"].map(s => [s, rows.filter(r => r.skipped === s).length])),
    searches, contenders: verdicts, switches: switches.length,
    switchedShare: cumProb(judgedRows) ? cumProb(switches) / cumProb(judgedRows) : 0, byMove,
    top2MDiffers: judgedRows.filter(r => r.championInfo?.top2M).length,
    switched: switches.map(r => ({ line: r.line, from: r.champion, to: r.chosen, cumProb: r.cumProb })),
    createdAt: new Date().toISOString() };
  const file = await open(summaryFile, "wx");
  await file.write(JSON.stringify(summary, null, 2) + "\n"); await file.close();
  return summary;
}

// Explorer answers name castling e8h8; the tree and the engine use e8g8, so the move is read from its SAN.
export function explorerMoves(fen: string, answer: ExplorerAnswer) {
  const chess = new Chess(fen);
  return answer.moves.map(m => { const uci = chess.move(m.san).lan; chess.undo();
    return { uci, san: m.san, record: { wins: m.black, draws: m.draws, losses: m.white } }; });
}

// A score and its standard error: each game scores 1, ½ or 0.
function scored(record: Record3) {
  const n = games(record);
  if (!n) return { games: 0, score: null, se: null };
  const s = score(record), square = (record.wins + record.draws / 4) / n;
  return { games: n, score: s, se: Math.sqrt(Math.max(0, square - s * s) / n) };
}

// HES.90: a selection made on some months' counts, checked on later months'. For each switch,
// the champion's and the chosen move's scores then, and the gain. The pooled gain weighs each
// switch by its precision; a selection that rode on luck shows a gain near zero here. With a
// rating, only that Explorer rating group counts (HES.95).
export async function checkSelection(name: string, months: Months, fetcher: Fetcher = httpFetcher, cache?: string, rating?: number) {
  if (rating !== undefined && !(EXPLORER.ratings as readonly number[]).includes(rating))
    throw new Error("Rating must be one of " + EXPLORER.ratings.join(", ") + ".");
  const slice: Months = rating === undefined ? months : { ...months, ratings: [rating] };
  const directory = path.join(DATA_ROOT, "selections", name);
  await assertDataDirectory(directory);
  const summary = JSON.parse(await readFile(path.join(directory, "selections-summary.json"), "utf8"));
  if (!summary.counts?.until) throw new Error(name + " used the app's counts, which include every year: run select with --months.");
  if (summary.counts.until >= months.since) throw new Error("The check's months must come after " + summary.counts.until + ".");
  const rows: SelectionRow[] = (await readFile(path.join(directory, "selections.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const empty = { wins: 0, draws: 0, losses: 0 };
  const switches = [];
  for (const row of rows.filter(r => r.switched)) {
    const moves = explorerMoves(row.fullFen, (await explorerCounts(row.fullFen, slice, DEFAULT_BASE, fetcher, cache)).answer);
    const record = (san: string) => moves.find(m => m.san === san)?.record ?? empty;
    const champion = scored(record(row.champion)), chosen = scored(record(row.chosen));
    const picked = row.contenders!.find(c => c.san === row.chosen)!;
    const gain = champion.score === null || chosen.score === null ? null
      : { value: chosen.score - champion.score, se: Math.hypot(champion.se!, chosen.se!) };
    switches.push({ line: row.line, cumProb: row.cumProb, from: row.champion, to: row.chosen,
      fit: { champion: { games: row.championInfo!.games, score: row.championInfo!.score }, chosen: { games: picked.games, score: picked.score },
        gain: picked.score - row.championInfo!.score!, safeGain: picked.safeGain },
      check: { champion, chosen, gain } });
  }
  const measured = switches.filter(s => s.check.gain && s.check.gain.se > 0);
  const weights = measured.map(s => 1 / s.check.gain!.se ** 2), total = weights.reduce((sum, w) => sum + w, 0);
  const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const result = { name, selectedOn: summary.counts, checkedOn: slice, switches: switches.length, measured: measured.length,
    better: measured.filter(s => s.check.gain!.value > 0).length,
    meanGain: { fit: mean(measured.map(s => s.fit.gain)), safe: mean(measured.map(s => s.fit.safeGain!)), check: mean(measured.map(s => s.check.gain!.value)) },
    pooledGain: total ? { value: measured.reduce((sum, s, i) => sum + weights[i] * s.check.gain!.value, 0) / total, se: Math.sqrt(1 / total) } : null,
    details: switches };
  const output = await open(path.join(directory, "check-" + months.since + "-" + months.until + (rating === undefined ? "" : "-" + rating) + ".json"), "wx");
  await output.write(JSON.stringify(result, null, 2) + "\n"); await output.close();
  return result;
}
