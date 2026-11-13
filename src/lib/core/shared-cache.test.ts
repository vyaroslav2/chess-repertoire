// SC.50–55: the exchange file, export and import. Runs on test.db only: npx tsx scripts/run_db_tests.ts src/lib/core/shared-cache.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createPrismaClient } from "../db/client";

import { computeLocalEngineEvaluationProfile, defaultConfig } from "./config";
import {
  buildExchangeFile,
  exchangeSettings,
  importSharedEvals,
  parseExchangeFile,
  readSharedEvals,
  sharedEvalProblem,
  type SharedEval,
} from "./shared-cache";

assert.match(process.env.DATABASE_URL ?? "", /test\.db$/, "shared-cache tests run on test.db only");
const prisma = createPrismaClient();
const profile = computeLocalEngineEvaluationProfile(defaultConfig);
const LIMIT = defaultConfig.localStockfishNodes;

const sicilian: SharedEval = {
  fullFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  uci: "c7c5", san: "c5", cp: 30, mate: null, depth: 24, nodes: 187654321,
  pv: "c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3",
};
const backRank: SharedEval = {
  fullFen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
  uci: "a1a8", san: "Ra8#", cp: null, mate: 1, depth: 245, nodes: 1200, pv: "a1a8",
};
const indian: SharedEval = {
  fullFen: "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1",
  uci: "g8f6", san: "Nf6", cp: 0, mate: null, depth: 25, nodes: 199999999, pv: "g8f6 c2c4",
};

async function wipeEngineCache() {
  await prisma.engineCache.deleteMany();
}

async function cache(e: SharedEval, extra: Partial<{ rank: number | null; nodes: number | null; cp: number }> = {}) {
  await prisma.engineCache.create({
    data: {
      fullFen: e.fullFen, engineProfile: profile, engine: "LOCAL",
      evaluations: { create: { uci: e.uci, san: e.san, cp: e.cp, mate: e.mate, depth: e.depth, nodes: e.nodes, pv: e.pv, rank: 1, ...extra } },
    },
  });
}

test.after(() => prisma.$disconnect());

test("SC.50: the file is sorted by fullFen and equal byte for byte whatever the order", () => {
  const a = buildExchangeFile([sicilian, backRank, indian]);
  const b = buildExchangeFile([indian, sicilian, backRank]);
  assert.equal(a, b);
  const parsed = JSON.parse(a);
  assert.deepEqual(parsed.settings, exchangeSettings());
  assert.deepEqual(parsed.settings, { engine: "Stockfish 19", bench: 2497913, nodes: 200000000, threads: 1, hashMb: 1024, multiPv: 1, record: 2 });
  assert.deepEqual(parsed.evals.map((e: SharedEval) => e.fullFen), [backRank, sicilian, indian].map(e => e.fullFen).sort());
  assert.deepEqual(Object.keys(parsed.evals[0]), ["fullFen", "uci", "san", "cp", "mate", "depth", "nodes", "pv"]);
  assert.deepEqual(parseExchangeFile(a), parsed.evals);
});

test("SC.55: each rule refuses an eval", () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ["extra field", { ...sicilian, rank: 1 }, /fields must be exactly/],
    ["missing field", { fullFen: sicilian.fullFen, uci: "c7c5", san: "c5", cp: 30, mate: null, depth: 24, nodes: 187654321 }, /fields must be exactly/],
    ["not canonical", { ...sicilian, fullFen: sicilian.fullFen.replace(" b ", "  b ") }, /not canonical/],
    ["not a position", { ...sicilian, fullFen: "8/8/8/8/8/8/8/8 w - - 0 1" }, /not a legal position/],
    ["both scores", { ...sicilian, mate: 3 }, /exactly one of cp and mate/],
    ["no score", { ...sicilian, cp: null }, /exactly one of cp and mate/],
    ["fractional cp", { ...sicilian, cp: 30.5 }, /cp is not a whole number/],
    ["mate 0", { ...backRank, mate: 0 }, /mate is 0/],
    ["depth 0", { ...sicilian, depth: 0 }, /depth/],
    ["nodes at the limit", { ...sicilian, nodes: LIMIT }, /node limit/],
    ["illegal move", { ...sicilian, uci: "c7c4", pv: "c7c4" }, /not legal here/],
    ["wrong san", { ...sicilian, san: "c6" }, /should be c5/],
    ["pv from another move", { ...sicilian, pv: "d7d5 e4d5" }, /does not start with uci/],
    ["pv cut short", { ...sicilian, pv: "c7c5 g1f3 d7d6 d2d4 c5d4 f3d" }, /pv move 6, "f3d", is not legal/],
    ["pv with an illegal move", { ...sicilian, pv: "c7c5 g1f3 g1f3" }, /pv move 3/],
    ["double space in pv", { ...sicilian, pv: "c7c5  g1f3" }, /pv move 2/],
  ];
  for (const [name, value, expected] of cases) {
    assert.match(sharedEvalProblem(value, LIMIT) ?? "(passed)", expected, name);
  }
  assert.equal(sharedEvalProblem(sicilian, LIMIT), null);
  assert.equal(sharedEvalProblem(backRank, LIMIT), null);
  assert.equal(sharedEvalProblem(indian, LIMIT), null);
});

test("SC.51: export refuses to write a file with a bad eval", () => {
  assert.throws(() => buildExchangeFile([sicilian, { ...indian, mate: 0 }]), /Export refused[\s\S]*mate/);
  assert.throws(() => buildExchangeFile([sicilian, sicilian]), /appears more than once/);
});

test("SC.52: import refuses a file with other settings, naming the field", () => {
  const file = JSON.parse(buildExchangeFile([sicilian]));
  for (const [key, value] of [["bench", 2497914], ["nodes", 100000000], ["threads", 2], ["engine", "Stockfish 18"], ["record", 1]] as const) {
    const changed = { ...file, settings: { ...file.settings, [key]: value } };
    assert.throws(() => parseExchangeFile(JSON.stringify(changed)), new RegExp(`settings\\.${key}`));
  }
  assert.throws(() => parseExchangeFile(JSON.stringify({ ...file, formatVersion: 2 })), /formatVersion/);
  assert.throws(() => parseExchangeFile(JSON.stringify({ ...file, extra: 1 })), /top-level fields/);
  assert.throws(() => parseExchangeFile(JSON.stringify({ ...file, evals: [sicilian, sicilian] })), /appears more than once/);
  assert.throws(() => parseExchangeFile("{"), /not valid JSON/);
});

test("SC.51: export reads the current deep profile and refuses rows it cannot share", async () => {
  await wipeEngineCache();
  await cache(sicilian);
  await cache(backRank);
  await prisma.engineCache.create({ data: { fullFen: indian.fullFen, engineProfile: "another-profile", engine: "LOCAL", evaluations: { create: { uci: "d7d5", cp: 10, mate: null, rank: 1 } } } });
  const evals = await readSharedEvals(prisma);
  assert.deepEqual(evals.sort((a, b) => a.fullFen.localeCompare(b.fullFen)), [backRank, sicilian].sort((a, b) => a.fullFen.localeCompare(b.fullFen)));

  await wipeEngineCache();
  await cache(sicilian, { nodes: null });
  await assert.rejects(readSharedEvals(prisma), /nodes empty/);

  await wipeEngineCache();
  await cache(sicilian);
  const cacheRow = await prisma.engineCache.findFirstOrThrow();
  await prisma.engineCacheEvaluation.create({ data: { cacheId: cacheRow.id, uci: "e7e5", san: "e5", cp: 40, mate: null, rank: null } });
  await assert.rejects(readSharedEvals(prisma), /has 2 evals/);

  await wipeEngineCache();
  await cache(sicilian, { rank: null });
  await assert.rejects(readSharedEvals(prisma), /rank null, not 1/);

  await wipeEngineCache();
  await cache(sicilian, { cp: 30.5 });
  const fractional = await readSharedEvals(prisma);
  assert.throws(() => buildExchangeFile(fractional), /cp is not a whole number/);
});

test("SC.52: import adds new positions under our profile and skips equal ones", async () => {
  await wipeEngineCache();
  await cache(sicilian);
  const result = await importSharedEvals(prisma, parseExchangeFile(buildExchangeFile([sicilian, backRank, indian])));
  assert.deepEqual(result, { added: 2, alreadyCached: 1 });

  const rows = await prisma.engineCache.findMany({ include: { evaluations: true } });
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.engineProfile, profile);
    assert.equal(row.engine, "LOCAL");
    assert.equal(row.evaluations.length, 1);
    assert.equal(row.evaluations[0].rank, 1);
  }

  const again = await importSharedEvals(prisma, parseExchangeFile(buildExchangeFile([sicilian, backRank, indian])));
  assert.deepEqual(again, { added: 0, alreadyCached: 3 });
});

test("SC.53: one differing position refuses the whole file, and nothing is written", async () => {
  await wipeEngineCache();
  await cache(sicilian);
  const theirs = { ...sicilian, nodes: sicilian.nodes + 1, pv: "c7c5 g1f3" };
  await assert.rejects(
    importSharedEvals(prisma, [theirs, backRank]),
    /differ from our cache[\s\S]*nodes ours 187654321, theirs 187654322; pv ours/
  );
  assert.equal(await prisma.engineCache.count(), 1);
});

test("SC.60: export, import into an empty cache, export again: the same file", async () => {
  await wipeEngineCache();
  await cache(sicilian);
  await cache(backRank);
  await cache(indian);
  const first = buildExchangeFile(await readSharedEvals(prisma));
  await wipeEngineCache();
  await importSharedEvals(prisma, parseExchangeFile(first));
  const second = buildExchangeFile(await readSharedEvals(prisma));
  assert.equal(second, first);
});
