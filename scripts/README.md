# depth_drift.py

Tests how Stockfish's evals change between two depths, for example 24 and 30.
It answers one question for the repertoire generator: would a deeper search
accept or reject different Black moves?

For each position it shows:

- every depth as Stockfish finishes it, live;
- each move's rank and eval at both depths, and how much the eval changed;
- each move's cp loss against the best move, and which tolerance rejects it.

## Run

From the project folder:

```bash
python scripts/depth_drift.py
```

Needs Python 3.10+ and `python-chess` (`python -m pip install python-chess`).

Common options (they override the CONFIG block at the top of the script):

```bash
python scripts/depth_drift.py --depths 24 30 --multipv 5 --threads 1
python scripts/depth_drift.py --fen "<FEN>" --only-marked
python scripts/depth_drift.py --time-cap 600
python scripts/depth_drift.py --min-nodes
python scripts/depth_drift.py --no-cache
python scripts/depth_drift.py --clear-cache
```

To keep the output as a Markdown file for Obsidian:

```bash
python scripts/depth_drift.py --only-marked > depth_drift.md
```

## Settings

| Setting | Default | What it does |
|---|---|---|
| `DEPTHS` | `[24, 30]` | Depths to record and compare. The search runs to the largest. |
| `MULTIPV` | 5 | How many moves to show: the best move and the next 4. |
| `THREADS` | 4 | CPU threads for one search. 1 = the same result every run. |
| `HASH_MB` | 256 | Memory for Stockfish's hash table, in MB. |
| `TIME_CAP_SECONDS` | None | Stop a position after this many seconds. None = no cap. |
| `MIN_NODES` | None | Keep searching past the target depth until this many nodes. `--min-nodes` alone = 200 million. |
| `MAX_NODES` | None | Stop at this many nodes, even before the target depth. |
| `TOLERANCES_CP` | 35, 50, 80 | Your late, middle and early tolerances. |
| `SHOW_ALL_DEPTHS` | True | Print every depth. False = only the `*` depths. |
| `SKIP_IN_CHECK` | True | Skip positions in check (few moves, can stall). |
| `FENS` | 1 FEN | Positions to analyse first. |
| `LINES` | 5 lines | Lines from your repertoire. Positions are taken from them. |
| `START_PLY` | 3 | First position: after 3 plies, so Black's 2nd move. |
| `EVERY_N_PLIES` | 2 | Then every 2 plies, so Black's moves only. |

`START_PLY` counts the plies already played. Odd numbers give Black to move,
even numbers give White to move. Black's 1st move is skipped because it is
hardcoded in the generator (`1. e4 c6`, `1. d4 d5`).

## Reading the output

All evals are in cp from **White's point of view**: negative is good for Black.

**Depth table.** One row per finished depth. `*` marks the depths in `DEPTHS`.
Time and nodes count from the start of the position.

**Change table.** Each move's rank and eval at the two depths.

- Change = eval at the deeper depth minus eval at the shallower one.
  For example, −20 → −50 gives −50 − (−20) = −30.
- `−` means the eval moved towards Black; `+` means towards White.
- A dash means the move was outside the top moves at that depth.

**Loss tables.** One per recorded depth.

- Loss = how many cp the move loses against the best move at that depth.
  It is always positive, for either colour.
- The best move is marked `baseline`.
- `Rejected at` shows the **largest** tolerance the loss exceeds. A move
  rejected at 80 is also rejected at 50 and 35; a move rejected at 35 can still
  pass 50 and 80. A dash means it passes all three.

**Summary.** For all positions together:

- the average size of the Change column (sign ignored) for every move found at
  both depths, best moves included: how much a typical eval moves;
- how many positions, and what share, have a different best move (baseline)
  at the deeper depth;
- a table of how many moves changed by 0–5, 6–10, … 31–35 and over 35 cp, and
  what share of all moves that is (`CHANGE_STEPS_CP`). Each move is counted
  once, so the rows add up to the total;
- a gap table: for each position, moves 2–5 with their gap to the baseline at
  both depths. A move in brackets, like `(g6 42)`, would be rejected at that
  position's tolerance. The tolerance comes from the full move number, as in
  the generator: moves 1–4 early (80), 5–8 middle (50), 9+ late (35)
  (`BAND_LAST_MOVE`, `TOLERANCE_BY_BAND`). In a terminal, a row is yellow when
  a move passes at one depth and is rejected at the other. Only moves in the
  top lines at both depths count.

## Stopping with Ctrl+C

| Press | What happens |
|---|---|
| Once | Finishes the current depth, saves it, prints the summary. |
| Twice | Stops at once. Finished depths are still saved. |
| Three times | Forced exit. The position in progress is lost. |

Stockfish runs in its own process group, so Ctrl+C reaches the script, not the
engine.

## Cache

Results are stored in `scripts/temp/depth_drift_cache.db`, so a position is not
searched twice.

- One stored search keeps every depth it finished. Any target up to that depth
  comes from the cache at once and is marked `(from cache)`.
- A deeper target searches again from depth 1. Stockfish cannot resume a
  search, so a search stopped at d22 does not save time towards d30.
- A change of engine version, MultiPV, Threads, Hash or node limits wipes the
  cache, because the results would differ. Depths and the time cap do not.
- A shorter search never replaces a deeper one.

Results of the last run are also saved to `scripts/temp/depth_drift_results.json`.

## Terms

**Depth.** Stockfish searches depth 1, then 2, then 3, and so on. Each pass
looks further ahead. Depth 24 means it finished the 24th pass. It is a rough
label, not an exact amount of work: Stockfish cuts weak lines short and follows
sharp lines much further.

**Seldepth.** The deepest single line reached in the search. It is often far
higher than the depth, for example depth 24 with seldepth 41.

**Nodes.** A node is one position Stockfish looks at during its search. Each
time it makes a move on its internal board and examines the result, that is one
node. The nodes column is the total so far.

Nodes measure the real work better than depth does. A quiet position may reach
depth 24 in 1 million nodes; a sharp one may need 50 million. Depth also means
slightly different work in different Stockfish versions.

**NPS (nodes per second).** The search speed. On a Ryzen 5 4500U one thread runs
about 420,000 nodes per second (Stockfish 18). For scale: depth 24 was about
2.6 million nodes, around 6 seconds on one thread. 200 million nodes would take
about 8 minutes on one thread.

**Hash.** A memory table where Stockfish stores positions it has already
searched. It has two jobs:

- **Transpositions.** The same position comes up again and again in one
  search, by different move orders. With the hash, Stockfish searches it once
  and reuses the result.
- **Move order.** After each depth, the best move found is stored. The next
  depth tries that move first, which lets it skip most of the tree. This is the
  main reason high depths are reachable at all.

A bigger hash mainly makes the search **faster**: when the table is full, old
entries are overwritten and that work is lost. With the default 16 MB, a
depth-24 search filled about 80% of the table, so 128–256 MB is sensible. A
different hash size can change an eval by a few cp. It is not more accurate,
just different, which is why Hash is part of the cache key.

Each position starts with an empty hash (`ucinewgame`), so one position cannot
affect the next.

**Threads.** Search workers running in parallel, one per CPU core. More threads
reach a depth faster, but they race each other, so the result varies slightly
between runs. With 1 thread, a fixed depth and an empty hash, the result is the
same every run. One thread is not more accurate, only repeatable.

**MultiPV.** How many moves Stockfish analyses fully at each depth. MultiPV 5
gives the best move and the next 4, each with its own eval. More lines make the
search slower.

**cp (centipawn).** 100 cp = 1 pawn. Mates are shown as `M+3` (White mates in
3) or `M-3` (Black mates in 3). Positions with a mate are left out of the
comparison.
