import assert from "node:assert/strict";
import { HeEngine } from "../engine";
// Optional real-engine check; never imported by the unit test suite.
const binary = process.argv[2];
if (!binary) throw new Error("Supply the path to Stockfish 19.");
const engine = await HeEngine.start(binary, 120_000);
try {
  console.log("Engine verified:", engine.profile.name, engine.profile.id);
  // A small legal position keeps the depth-24 smoke check quick.
  const fen = "8/8/5k2/8/8/2K5/3P4/8 b - - 0 1";
  const first = await engine.evaluate(fen);
  const cached = await engine.evaluate(fen);
  assert.deepEqual(cached, first);
  const candidate = await engine.evaluate(fen, first.uci);
  assert.equal(candidate.uci, first.uci);
  console.log(JSON.stringify({ first, cached, candidate }, null, 2));
} finally { engine.close(); }
