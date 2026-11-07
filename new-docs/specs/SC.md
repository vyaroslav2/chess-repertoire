---
tags:
  - reviewed
---
# SC — Shared cache

SC lets two people (the user and a friend) build trees on their own PCs and share one cache of Stockfish evals. An eval either of them has searched need not be searched again by the other. It works only if both run the exact same search and store the exact same fields. Draft, 2026-11-07. Nothing is built yet.

## Why

SC.01 **Searches are slow.** One 200M-node search takes about 8 minutes on the user's PC (median of 165 searches, October 2026; fastest 6.7 min). Every new position needs one. Two people building trees from the same openings search many of the same positions.

SC.02 **The cache is already keyed for this.** An eval is stored against the exact `fullFen` and the engine settings ([[DB|DB.32]]). Two caches built with the same settings hold the same kind of evals, so they can be merged.

SC.04 **What must match is the file, not the database.** The two projects may differ. Each side keeps its evals in its own tables, under its own names, with any extra columns it likes. What both sides share is the engine settings (SC.10), the fields each eval carries (SC.21) and the exchange file (SC.50).

SC.03 **The same settings must give the same result.** With one thread, Stockfish is deterministic: the same version, the same position and the same settings give the same move, score, depth and node count, on any CPU. With more than one thread they differ on every run, so sharing would not be safe.

## Engine settings

SC.10 **Both people use exactly these settings.** They are today's EW.09 settings ([[EW|EW.09]], [[generation-config]]):
* Stockfish 19, official release, in `bin/stockfish.exe`.
* A new Stockfish process for every search, so the hash starts empty.
* `setoption name Threads value 1`
* `setoption name Hash value 1024`
* `setoption name MultiPV value 1`
* Every other option at its default. In particular no `SyzygyPath`: tablebases change results.
* `position fen <fullFen>`, then `go nodes 200000000`.

SC.11 **Reading the result** is EW.09's rule, unchanged:
* Drop the one line whose `nodes` is at or above 200000000. It belongs to the depth the node limit cut short.
* Skip bound lines (`lowerbound`, `upperbound`).
* Take the deepest depth left, and its last exact line. Its first move is the best move; its score is the eval.
* Ignore `bestmove`.
* Example: d24 finishes at 150M; d25 is still running at 200M. The d25 line is dropped, and d24's last exact line is recorded, with `depth` 24.


SC.12 **Check the build first.** Both run `stockfish.exe bench` before anything else. The `Nodes searched` figure must be the same. On the user's PC it is **2497913**. A different figure means a different engine: stop and find out why.

## What is stored

SC.20 **Two new columns on `EngineCacheEvaluation`**, both from the line SC.11 keeps:
* `nodes`: the node count printed on that line. With one thread it is exact, so it is the strongest check that two engines match (SC.03).
* `pv`: the whole line, as UCI moves separated by single spaces. It shows the reply Stockfish expects.

SC.21 **The shared fields.** Each side must store these for every eval, in whatever tables and columns it likes:
* `fullFen`: all six fields, canonical (single spaces, counters included).
* `uci`: the best move.
* `san`: the same move in SAN.
* `cp` or `mate`: exactly one is set. From White's point of view ([[DB|DB.15]]): when Black is to move, Stockfish's sign is flipped. `mate` is never 0.
* `depth`, `nodes`, `pv` (SC.11, SC.20).
* The settings the eval was searched with (SC.10), in any form: in this project, the profile hash (SC.22).

A side may store more (here: `id`, `rank`, `fetchedAt`). Extra fields are never exported, and on import they get their own defaults. A side may not store less: a field it drops can't be sent on.

SC.24 **`rank` is not shared** (decided 2026-11-07). With MultiPV 1 (SC.10) a search has one line, so every shared eval is rank 1 and the field would say nothing. This project keeps its `rank` column as it is ([[DB|DB.32]]): 1 for EW.09's best move, `null` for a selector eval. On import, an added eval gets `rank` 1 (SC.52). Ranks 2 and up would need MultiPV 3, which is a different search: its rank 1 is not the MultiPV 1 baseline, so it would need new settings and its own cache.

SC.22 **This project's profile.** Here the settings are kept as a sha256 hash, `engineProfile` ([[DB|DB.32]]). It gains one field, `record: 2`, meaning "the eval also holds `nodes` and `pv`". So the hash changes, and no row from before SC can be read as if it had them. The hash is this project's own key: it is never put in the exchange file, and the friend's project needn't compute it. Built 2026-11-07: the hash is now `6af3998c38326a319fa5ba8e5d820ef274585b83660559e264d1f1dd9752ebaf` (was `da64ab3e…`).


SC.23 **Time is not stored in the cache.** It depends on the PC, so it never matches between two people. It goes to the search log instead (SC.30).

## Search log

SC.30 **A new file, `new-docs/logs/engine-searches.jsonl`.** One line per real search; a cache hit writes nothing. The code only ever appends to it: it is never wiped, unlike `tree-events.jsonl`, which is wiped at the start of every run. Like all of `logs/`, it is not committed.

SC.31 **Each line holds:** `at` (when the search finished), `kind` (`deep` or `selector`), `fullFen`, `uci` (selector only: the move searched), `engineProfile`, `seconds` (from starting Stockfish to its exit), `depth`, `nodes`.

SC.32 **Average time.** A script reads the file and prints, for the current deep profile: the number of searches, the median and the mean time. The median is the figure to use for planning, because a PC that sleeps during a search pulls the mean up.

## Fresh start

SC.40 **The old cache and old times are erased at the next generation, not before.** The user decided this on 2026-11-07. Before that run:
* Delete every row of `EngineCache` in `dev.db` (and, by cascade, every `EngineCacheEvaluation`). That covers all three old profiles: the 200M deep evals (most have no `depth`), the 2M deep evals from 3 November, and the selector's.
* `engine-searches.jsonl` starts empty.
* A one-off script does both. The user runs it just before the next generation. It never touches `test.db` or any table outside the engine cache.

SC.41 After that run, every cached eval has `depth`, `nodes` and `pv`, and every search has a time.

## Sharing

SC.50 **The exchange file** is JSON, UTF-8. The settings are written out in plain form at the top, once, so either project can check them without knowing how the other stores them:

```json
{
  "format": "shared-eval-cache",
  "formatVersion": 1,
  "settings": {
    "engine": "Stockfish 19",
    "bench": 2497913,
    "nodes": 200000000,
    "threads": 1,
    "hashMb": 1024,
    "multiPv": 1,
    "record": 2
  },
  "evals": [
    {
      "fullFen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      "uci": "c7c6",
      "san": "c6",
      "cp": 30,
      "mate": null,
      "depth": 24,
      "nodes": 187654321,
      "pv": "c7c6 d2d4 d7d5"
    }
  ]
}
```

(The eval above is made up, to show the shape.) `cp` and `mate` are both present: one is a number, the other `null`. No other fields. Evals are sorted by `fullFen`, so two exports of the same cache are byte-for-byte equal.

SC.51 **Export.** A script writes every eval searched with the SC.10 settings to the file. Here: every row of the current deep profile (SC.22).

SC.52 **Import.** A script reads the other person's file:
* `format`, `formatVersion` and every field of `settings` must equal this side's own. Any difference: the whole file is refused, naming the field.
* Evals are matched on `fullFen`. A position not yet cached is added, under this side's own key (here: the SC.22 profile, new ids, `rank` = 1, `fetchedAt` = now).
* A position already cached is a check: `uci`, `san`, `cp`, `mate`, `depth`, `nodes` and `pv` must all be equal. Equal: skip it. Any difference: hard error, naming the position and the fields that differ, and nothing from that file is written. Two engines that disagree must not be mixed.

## The test

SC.60 **Before sharing anything:**
1. Both run `bench` (SC.12).
2. Both use the SC.10 settings and store the SC.21 fields.
3. Pick 10 positions neither person has cached. Both search them.
4. One exports; the other imports. Import checks the settings, then compares every field (SC.52). All 10 must be equal.

## Out of scope

SC.70 **The selector's evals are not shared.** They are only made when `humanEvidence` is on, which it is not. They use another profile and another reading rule (they keep the stop line, [[HEG|HEG.21]]). If they are shared later, they need their own export and test.
