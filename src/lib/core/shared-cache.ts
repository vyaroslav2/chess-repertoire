// SC.50–56: the shared eval cache's exchange file. Export writes this project's deep evals to it;
// import checks the other person's file and adds the evals not yet cached here.
import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { Chess } from "chess.js";
import { computeLocalEngineEvaluationProfile, defaultConfig, LOCAL_ENGINE_RECORD, type Config } from "./config";
import { parseFullFen } from "./fen";
import { isValidUciMove } from "./uci";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const EXCHANGE_FORMAT = "shared-eval-cache";
export const EXCHANGE_FORMAT_VERSION = 1;
/** SC.12: `Nodes searched` from `stockfish.exe bench` on the user's PC. */
export const STOCKFISH_BENCH_NODES = 2497913;

export type ExchangeSettings = {
  engine: string;
  bench: number;
  nodes: number;
  threads: number;
  hashMb: number;
  multiPv: number;
  record: number;
};

/** SC.21: the shared fields, in the file's order (SC.50). */
export type SharedEval = {
  fullFen: string;
  uci: string;
  san: string;
  cp: number | null;
  mate: number | null;
  depth: number;
  nodes: number;
  pv: string;
};

const SETTINGS_KEYS = ["engine", "bench", "nodes", "threads", "hashMb", "multiPv", "record"] as const;
const EVAL_KEYS = ["fullFen", "uci", "san", "cp", "mate", "depth", "nodes", "pv"] as const;
const FILE_KEYS = ["format", "formatVersion", "settings", "evals"] as const;
/** SC.52: the fields compared when a position is already cached. */
const COMPARED_KEYS = ["uci", "san", "cp", "mate", "depth", "nodes", "pv"] as const;
const MAX_PROBLEMS_SHOWN = 20;

/** SC.10: this side's settings, written out in plain form. */
export function exchangeSettings(config: Config = defaultConfig): ExchangeSettings {
  return {
    engine: `Stockfish ${config.localStockfishVersion}`,
    bench: STOCKFISH_BENCH_NODES,
    nodes: config.localStockfishNodes,
    threads: config.localStockfishThreads,
    hashMb: config.localStockfishHashMb,
    multiPv: config.localStockfishMultiPv,
    record: LOCAL_ENGINE_RECORD,
  };
}

function sameKeys(value: object, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every(key => own.includes(key));
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function playUci(chess: Chess, uci: string) {
  if (!isValidUciMove(uci)) return null;
  try {
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length === 5 ? uci[4] : undefined });
    return move.lan === uci ? move : null;
  } catch {
    return null;
  }
}

/** SC.55: the rules one eval must pass. Returns the first rule it breaks, or null. */
export function sharedEvalProblem(value: unknown, nodeLimit: number): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "not an object";
  if (!sameKeys(value, EVAL_KEYS)) return `fields must be exactly ${EVAL_KEYS.join(", ")}`;
  const e = value as Record<string, unknown>;

  if (typeof e.fullFen !== "string") return "fullFen is not a string";
  let canonical: string;
  try {
    canonical = parseFullFen(e.fullFen);
  } catch (error) {
    return `fullFen is not a legal position (${(error as Error).message})`;
  }
  if (canonical !== e.fullFen) return `fullFen is not canonical; canonical: ${canonical}`;

  const cpSet = e.cp !== null;
  const mateSet = e.mate !== null;
  if (cpSet === mateSet) return "exactly one of cp and mate must be set";
  if (cpSet && !isWholeNumber(e.cp)) return "cp is not a whole number";
  if (mateSet && !isWholeNumber(e.mate)) return "mate is not a whole number";
  if (e.mate === 0) return "mate is 0";

  if (!isWholeNumber(e.depth) || e.depth < 1) return "depth is not a whole number, 1 or more";
  if (!isWholeNumber(e.nodes) || e.nodes < 1) return "nodes is not a whole number, 1 or more";
  if (e.nodes >= nodeLimit) return `nodes is at or above the node limit, ${nodeLimit}`;

  if (typeof e.uci !== "string" || typeof e.san !== "string" || typeof e.pv !== "string") return "uci, san and pv must be strings";
  const chess = new Chess(canonical);
  const move = playUci(chess, e.uci);
  if (!move) return `uci ${e.uci} is not legal here`;
  if (move.san !== e.san) return `san ${e.san} is not ${e.uci}; it should be ${move.san}`;

  const pv = e.pv.split(" ");
  if (pv[0] !== e.uci) return "pv does not start with uci";
  for (let i = 1; i < pv.length; i++) {
    if (!playUci(chess, pv[i])) return `pv move ${i + 1}, "${pv[i]}", is not legal; the pv may be cut short`;
  }
  return null;
}

function fail(title: string, problems: string[]): never {
  const shown = problems.slice(0, MAX_PROBLEMS_SHOWN);
  const more = problems.length > shown.length ? `\n  ...and ${problems.length - shown.length} more` : "";
  throw new Error(`${title}:\n  ${shown.join("\n  ")}${more}`);
}

/** SC.55: every eval passes, and no position appears twice. */
function checkEvals(evals: unknown[], nodeLimit: number, title: string): asserts evals is SharedEval[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  evals.forEach((value, index) => {
    const fullFen = value && typeof value === "object" ? (value as { fullFen?: unknown }).fullFen : undefined;
    const where = typeof fullFen === "string" ? fullFen : `eval ${index + 1}`;
    const problem = sharedEvalProblem(value, nodeLimit);
    if (problem) problems.push(`${where}: ${problem}`);
    if (typeof fullFen === "string") {
      if (seen.has(fullFen)) problems.push(`${where}: appears more than once`);
      seen.add(fullFen);
    }
  });
  if (problems.length > 0) fail(title, problems);
}

function byFullFen(a: SharedEval, b: SharedEval): number {
  return a.fullFen < b.fullFen ? -1 : a.fullFen > b.fullFen ? 1 : 0;
}

/** SC.50: the file's text. Evals sorted by fullFen, fields in a fixed order, so two exports of one cache are equal byte for byte. */
export function buildExchangeFile(evals: SharedEval[], settings: ExchangeSettings = exchangeSettings()): string {
  checkEvals(evals, settings.nodes, "Export refused, no file written");
  const sorted = [...evals].sort(byFullFen).map(e => ({
    fullFen: e.fullFen, uci: e.uci, san: e.san, cp: e.cp, mate: e.mate, depth: e.depth, nodes: e.nodes, pv: e.pv,
  }));
  const settingsOut = Object.fromEntries(SETTINGS_KEYS.map(key => [key, settings[key]]));
  const file = { format: EXCHANGE_FORMAT, formatVersion: EXCHANGE_FORMAT_VERSION, settings: settingsOut, evals: sorted };
  return JSON.stringify(file, null, 2) + "\n";
}

/** SC.52, SC.55: reads the other person's file. Refuses it whole on any fault. */
export function parseExchangeFile(text: string, settings: ExchangeSettings = exchangeSettings()): SharedEval[] {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch (error) {
    throw new Error(`File refused: not valid JSON (${(error as Error).message})`);
  }
  if (!file || typeof file !== "object" || Array.isArray(file)) throw new Error("File refused: not a JSON object");
  if (!sameKeys(file, FILE_KEYS)) throw new Error(`File refused: top-level fields must be exactly ${FILE_KEYS.join(", ")}`);
  const f = file as Record<string, unknown>;
  if (f.format !== EXCHANGE_FORMAT) throw new Error(`File refused: format is ${JSON.stringify(f.format)}, not "${EXCHANGE_FORMAT}"`);
  if (f.formatVersion !== EXCHANGE_FORMAT_VERSION) throw new Error(`File refused: formatVersion is ${JSON.stringify(f.formatVersion)}, not ${EXCHANGE_FORMAT_VERSION}`);

  const theirs = f.settings;
  if (!theirs || typeof theirs !== "object" || Array.isArray(theirs)) throw new Error("File refused: settings is not an object");
  if (!sameKeys(theirs, SETTINGS_KEYS)) throw new Error(`File refused: settings fields must be exactly ${SETTINGS_KEYS.join(", ")}`);
  for (const key of SETTINGS_KEYS) {
    const value = (theirs as Record<string, unknown>)[key];
    if (value !== settings[key]) throw new Error(`File refused: settings.${key} is ${JSON.stringify(value)}, but ours is ${JSON.stringify(settings[key])}`);
  }

  if (!Array.isArray(f.evals)) throw new Error("File refused: evals is not a list");
  checkEvals(f.evals, settings.nodes, "File refused, nothing written");
  return f.evals;
}

/** SC.51: every eval of the current deep profile, in shared form. Throws, naming each fault, if any row cannot be shared. */
export async function readSharedEvals(client: DbClient, config: Config = defaultConfig): Promise<SharedEval[]> {
  const engineProfile = computeLocalEngineEvaluationProfile(config);
  const caches = await client.engineCache.findMany({
    where: { engine: "LOCAL", engineProfile },
    include: { evaluations: true },
  });
  const problems: string[] = [];
  const evals: SharedEval[] = [];
  for (const cache of caches) {
    const [row, ...extra] = cache.evaluations;
    if (!row || extra.length > 0) {
      problems.push(`${cache.fullFen}: has ${cache.evaluations.length} evals; it must have exactly one`);
      continue;
    }
    if (row.rank !== 1) {
      problems.push(`${cache.fullFen}: its eval has rank ${row.rank}, not 1`);
      continue;
    }
    if (row.san === null || row.depth === null || row.nodes === null || row.pv === null) {
      const empty = (["san", "depth", "nodes", "pv"] as const).filter(key => row[key] === null);
      problems.push(`${cache.fullFen}: ${empty.join(", ")} empty`);
      continue;
    }
    evals.push({ fullFen: cache.fullFen, uci: row.uci, san: row.san, cp: row.cp, mate: row.mate, depth: row.depth, nodes: row.nodes, pv: row.pv });
  }
  if (problems.length > 0) fail("Export refused, no file written", problems);
  return evals;
}

/** SC.56: exports/evals-YYYY-MM-DD.json, today's local date, under the project root. */
export function defaultExportPath(projectRoot: string, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return path.join(projectRoot, "exports", `evals-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`);
}

/** SC.51: reads, checks and writes the whole cache. Writes nothing if any eval is refused. Returns the number written. */
export async function writeSharedEvalExport(client: DbClient, outPath: string, config: Config = defaultConfig): Promise<number> {
  const evals = await readSharedEvals(client, config);
  const text = buildExchangeFile(evals, exchangeSettings(config));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, text, "utf8");
  return evals.length;
}

export type ImportResult = { added: number; alreadyCached: number };

/** SC.52, SC.53: adds the evals not cached here, after checking those that are. All or nothing. */
export async function importSharedEvals(client: PrismaClient, evals: SharedEval[], config: Config = defaultConfig): Promise<ImportResult> {
  checkEvals(evals, config.localStockfishNodes, "File refused, nothing written");
  const engineProfile = computeLocalEngineEvaluationProfile(config);
  const caches = await client.engineCache.findMany({
    where: { engine: "LOCAL", engineProfile },
    include: { evaluations: true },
  });
  const cached = new Map(caches.map(cache => [cache.fullFen, cache]));

  const problems: string[] = [];
  const toAdd: Array<{ eval: SharedEval; cacheId: string | null }> = [];
  let alreadyCached = 0;
  for (const e of evals) {
    const cache = cached.get(e.fullFen);
    if (!cache) {
      toAdd.push({ eval: e, cacheId: null });
      continue;
    }
    if (cache.evaluations.length === 0) {
      toAdd.push({ eval: e, cacheId: cache.id });
      continue;
    }
    const [row, ...extra] = cache.evaluations;
    if (extra.length > 0 || row.rank !== 1) {
      problems.push(`${e.fullFen}: our cache has ${cache.evaluations.length} evals here, or one not ranked 1; fix ours first`);
      continue;
    }
    const differ = COMPARED_KEYS.filter(key => row[key] !== e[key]);
    if (differ.length > 0) {
      const detail = differ.map(key => `${key} ours ${JSON.stringify(row[key])}, theirs ${JSON.stringify(e[key])}`).join("; ");
      problems.push(`${e.fullFen}: ${detail}`);
      continue;
    }
    alreadyCached++;
  }
  if (problems.length > 0) fail("File refused, nothing written: these positions differ from our cache", problems);

  const importedAt = new Date();
  await client.$transaction(async tx => {
    for (const { eval: e, cacheId } of toAdd) {
      const evaluation = { uci: e.uci, san: e.san, cp: e.cp, mate: e.mate, depth: e.depth, nodes: e.nodes, pv: e.pv, rank: 1, importedAt };
      if (cacheId) {
        await tx.engineCacheEvaluation.create({ data: { cacheId, ...evaluation } });
      } else {
        await tx.engineCache.create({ data: { fullFen: e.fullFen, engineProfile, engine: "LOCAL", evaluations: { create: evaluation } } });
      }
    }
  }, { timeout: 10 * 60 * 1000 });

  return { added: toAdd.length, alreadyCached };
}
