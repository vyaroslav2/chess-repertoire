import { DatabaseSync } from "node:sqlite";
import { open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Chess } from "chess.js";
import { computeExplorerCacheProfile, defaultConfig } from "../../src/lib/core/config";
import { chances, choose, DIALS, games, judge, score, scoreDraws, type Curve, type Dials, type Judged, type Record3 } from "../../src/lib/core/selector";
import { HeEngine, type Evaluation } from "./engine";
import { assertDataDirectory, DATA_ROOT, HE_ROOT, runPath } from "./paths";
import { explorerCounts, httpFetcher, DEFAULT_BASE, EXPLORER, type ExplorerAnswer, type Fetcher, type Months } from "./explorer";

// The selector (HES). Its maths lives in the app, so this report and the generator share one copy
// (HEG.80): in a position with Black to move, the tree's move (the champion) stays unless another
// move's human games show, at the chosen confidence, that it scores better by more than the margin,
// within the per-move cp limit.
export { choose, couldPass, DIALS, judge, safeGain, scoreDraws, type Curve, type Dials, type Judged, type Record3, type Verdict } from "../../src/lib/core/selector";

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
