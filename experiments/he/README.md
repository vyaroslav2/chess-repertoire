# Human evidence pilot

This is the first HE implementation milestone: a dated game importer and an independent
Stockfish 19 evaluation pipeline. All code and generated data stay in this folder.
It does not import application modules, open the repertoire database, or alter the tree generator.
It uses the repository's installed chess.js, TypeScript and tsx dependencies.

## Run it

From the repository root, put game exports under experiments/he/data/games/.
Input file paths and engine paths resolve from the terminal directory where you launch the command,
including when npm changes its working directory. Absolute paths also work.
The importer reads conventional multi-game Lichess PGN files, either plain .pgn or .pgn.gz.
[Lichess monthly archives](https://database.lichess.org/) are .pgn.zst; decompress those first.
Use the bounded download command below to collect a sample without manual extraction.

```powershell
npm --prefix experiments/he run import -- --run pilot-50k --limit 50000 experiments/he/data/games/2023.pgn experiments/he/data/games/2024.pgn
npm --prefix experiments/he run evaluate -- --run pilot-50k --period fit --limit 5 --engine stockfish-windows-x86-64-universal/stockfish/stockfish-windows-x86-64-universal.exe
```

Leave off the evaluation limit to evaluate the entire selected period.
The separate binary above was verified as Stockfish 19. bin/stockfish.exe reports Stockfish 18
and is rejected by HE. The application continues to use its configured engine.

Outputs live in data/runs/<run>/:

- observations.jsonl: one selected Black decision and real game outcome per accepted game.
- groups.jsonl: raw Black wins/draws/losses by period, position and move.
- manifest.json: filters, input file metadata, rejection counts, completion status and coverage
  for one-game, 2–9, 10–49, 50–199 and 200+ groups.
- evaluations-fit.jsonl (or evaluations-fit-first-5.jsonl): engine provenance, per-game
  candidate and champion evaluations, cp loss and a completion record.

Existing import runs and evaluation results are protected from overwrite.
An evaluation failure removes its partial result; successful engine searches stay cached,
so rerunning the evaluation reuses them. Failed imports keep a failed manifest;
retry with a new run name. Do not fit from failed or limited evaluation files.

## Download a bounded sample

From C:\chess-repertoire, download the first 2.5 decimal GB of January 2024 and
automatically import up to 50,000 qualifying unique games:

```powershell
npm --prefix experiments/he run download -- --run 2024-01-2500mb --month 2024-01 --gb 2.5 --limit 50000
```

For a quick trial use --gb 0.001 (1 MB) and a different run name.
The command requires the native Zstandard support present in this project's Node 24 runtime;
it does not require PeaZip, zstd, or an additional package.

It verifies the server returned the requested HTTP byte range, downloads that compressed prefix,
then reads it as a stream and saves only complete games that pass the same HE filters and sampling
rule as the importer. It discards an unfinished final game and does not extract the full monthly PGN.
The 2.5 GB figure is a byte cap, not a guarantee of 50,000 qualifying games.
The summary reports targetReached and actual cohort coverage.

Outputs are data/downloads/<run>/archive-prefix.pgn.zst, sample.pgn and manifest.json,
plus the usual imported data/runs/<run>/ files. Keep enough space for the compressed
prefix plus the smaller filtered PGN and result files. Download provenance, the prefix
SHA-256 and filtering counts are linked in the import manifest.

Progress is printed during downloading and filtering. Existing run/download names are protected.
If a download fails, partial files remain marked failed; retry with a new run name.
This version does not resume interrupted downloads.

A prefix covers a limited chronological window. Use this for an initial pilot;
broader fitting should combine samples from multiple 2023–24 months.
Separate month downloads can later be imported together by passing their sample.pgn paths
to import under a new run name; keep the same seed and filters.

## Fixed pilot rules

- Rated Rapid or Classical, identified from Lichess's Event header.
- Standard games from the initial position, starting exactly 1. d4 d5 or 1. e4 c6.
- Average of both ratings: 1600 inclusive to 2200 exclusive. Rating gap strictly below 100.
- Full valid date, preferring UTCDate to Date: 2023–24 fit, 2025 tune, 2026 test.
- A reproducible hash of game ID and seed chooses one Black move number from 2 through 15.
  It does not use the result to choose a move. If the game does not reach that move,
  the game is excluded. This means the cohort is conditioned on reaching the sampled move;
  report short-game exclusions when assessing coverage.
- Games Lichess ended for a rules infraction are excluded; this is the filter's last check.
- Lichess game IDs deduplicate overlapping exports. Games without a valid Lichess Site ID,
  unfinished results, nonstandard starts and illegal movetext are excluded.
- Four-field FENs group positions. Full FENs (including fifty-move clocks and move numbers)
  are retained for each observation and for engine cache keys.

Import uses --seed he-v1 by default. Keep the same seed across pilot sizes and periods.
--max-gap 200 enables the rating-gap diagnostic population; its manifest is marked
gap-diagnostic, and rows retain 0–49, 50–99 and 100–199 strata.
Do not substitute a diagnostic run for the under-100 pilot without deciding that policy first.

The limit counts accepted unique games across input files, in input order.
For comparable 50,000/100,000 checks use the same input order and seed.
Use separate run names for each period and size if you want equal targets per period.
The importer streams files and holds accepted game IDs and groups in memory, rather than
loading monthly archives into memory. It validates complete games, so archive import can
still take substantial time.

## Independent engine profile

Searches use Stockfish 19, 2,000,000 nodes (`go nodes`), MultiPV 1, Threads 1 and Hash 64 MB.
A node limit, not a depth: about 2 s a search. Within ±300 cp it matched 200M-node searches
closely (scripts/node_compare.py; see the 2026-10-11 session note).
The baseline is an unrestricted root search. Each observed candidate is searched at
the same root with searchmoves. If it is already the champion, its baseline result is reused.
The cache lives in data/eval-cache/<profile>/, with the binary SHA-256, engine name,
settings, full root FEN and restricted move in its identity. Search history is cleared
before every uncached request. Raw UCI lines are retained and checked when loading the cache.

Scores are stored from White's view; for Black, cp loss is
max(0, candidate cpWhite - champion cpWhite).
The node limit can stop a search part-way through a depth. The result is the last exact,
unbounded score, from the deepest completed depth; that depth is recorded with it. A root
search reports that depth's move, which can differ from bestmove. Changing the node limit
changes the profile, so its results are cached apart. Mate scores stay explicit; mate observations are
excluded from the ordinary cp curve rather than converted into invented cp values.
Finite-depth scores are estimates.

## Evaluating on Google Colab

The curve needs one search per group: its position, limited to the move played. These can
run on Colab, split between two people. First write the jobs:

```powershell
npm --prefix experiments/he run jobs -- --run 2024-02-3000mb
```

This writes `jobs-a.jsonl` (the first 20,000 jobs; `--split` changes it) and `jobs-b.jsonl` (the
rest) into the run's folder, one job per line: `id`, `positionKey`, the group's first FEN and
`uci`. A group's FENs differ only in the clocks, so its first FEN stands for all of them.
The id is the group's number in `groups.jsonl` order.

A later month need not search again what an earlier one has. With `--reuse`, a group whose
position and move a finished run's `evals.jsonl` has goes to `jobs-reused.jsonl` instead, with
where its search lies (`from`: run, results file and id there). Name several runs to reuse them all:

```powershell
npm --prefix experiments/he run jobs -- --run 2024-03-3000mb --reuse 2024-02-3000mb
```

Each person puts their jobs file in their Google Drive (e.g. `MyDrive/he/`), mounts Drive in a
Colab notebook, pastes `colab/he_colab.py` into one cell, sets `JOBS` and `RESULTS`, and runs it.
The script downloads the Stockfish 19 Linux release, checks its SHA-256 and that `bench`
searches 2,497,913 nodes (the same as the Windows build), then runs one single-threaded engine
per core with the settings above. Each finished search is one line in `RESULTS`. Drive gets
the file only when it is closed (tested on 2026-10-23), so the script closes and reopens it
every 500 results. A runtime that dies loses at most the last 500; running the cell again
carries on. The score is kept as Stockfish gives it, from Black's view; the import
flips it to `cpWhite`. Locally, the script gave the same score and depth as `engine.ts` on the same
jobs.

For a third person, part of `jobs-a.jsonl` can be moved by hand into `jobs-c.jsonl` (2024-03-3000mb:
the last 10,000 of a's 20,000). Each Colab session records its jobs file's name, so the file must
keep that name on Drive. `results`, `recheck`, the dot page and MySQL read part c wherever it exists.

Put each person's `results-a.jsonl`, `results-b.jsonl` (and `results-c.jsonl`) in the run's folder, then:

```powershell
npm --prefix experiments/he run results -- --run 2024-02-3000mb
npm --prefix experiments/he run recheck -- --run 2024-02-3000mb --engine stockfish-windows-x86-64-universal/stockfish/stockfish-windows-x86-64-universal.exe
```

`results` checks every line against its job and its session (release SHA-256, bench, settings,
one binary for both files, legal move, exact score, no missing or conflicting ids), joins each
job to its group and writes `evals.jsonl` (each group with `cpWhite` or `mateWhite`) and
`evals-manifest.json`. A group in `jobs-reused.jsonl` takes its eval from the earlier run, whose
files get the same checks; its row keeps `from`, and all searches must come from one binary.
`recheck` leaves reused searches to their own run; `recheck --game` finds them there. It writes nothing if any check fails, and never overwrites. `recheck`
searches 20 fixed random jobs from each file again here; each must give the same line, only faster or slower.
`recheck --game <id>` instead searches one game's position afresh (never from the cache), prints each
finished depth live (depth, selective depth, time, nodes, speed, eval for White, the line in SAN), then the
Colab line above the local one, with the Lichess link and the search's file and id. It exits with code 1
if they differ.

```powershell
npm --prefix experiments/he run curve -- --run 2024-02-3000mb
```

`curve` fits eval → Black's win/draw/loss on `evals.jsonl` (mates left out): an ordered logistic
model on cpWhite clipped to ±10 pawns, with a straight line, a 5-knot or a 7-knot natural spline.
It keeps the one with the lowest surprise on held-out groups (5 folds), refits it on 200 seeded
bootstrap resamples of groups for a 95% range, and writes `curve.json` and `curve.svg`.

`npm --prefix experiments/he run k -- --run 2024-02-3000mb` fits k on the groups with 2+ games
and a cp eval: a Dirichlet-multinomial centred on the curve's win/draw/loss at each group's eval,
k searched from 0.5 to 100,000 on a log scale, with a 95% profile-likelihood range (open where it
runs off the scale). It fits all groups, then by group size, eval and move number, into `k.json`.
It also fits k as a trend over Black's move, k(move) = k2 × r^(move − 2), on all groups at once
(each group at its most common move number): k2 and r with their 95% ranges, and k with its
range at every move from 2 to 15. Its check compares the trend with a free k for each move
(a likelihood-ratio test at 95%); `holds` says whether the trend does about as well.

Months are pooled into one run, so that a position and move seen in several of them becomes one
group with their games summed:

```powershell
npm --prefix experiments/he run pool -- --run 2024-02-03 --from 2024-02-3000mb --from 2024-03-3000mb
```

`pool` writes `evals.jsonl`, `observations.jsonl` and `pool.json`. Each group keeps its search
in `from`. It refuses a game found in two runs, and a group whose evals differ between runs
(write later months' jobs with `--reuse`). `curve`, `k` and `dots` then run on the pool as on
any run. `load-moves` refuses a pool: its games are loaded with their own months.

## The selector

`select` runs HE's selector (`new-docs/specs/HES.md`) over the app's tree, read-only:

```powershell
npm --prefix experiments/he run select -- --run tree-low --pool 2024-02-03 --k low --engine stockfish-windows-x86-64-universal/stockfish/stockfish-windows-x86-64-universal.exe
```

For each position with Black to move and a move already chosen, the tree's move is the champion,
and every other move with Explorer games (1600–2199, rapid and classical) a contender. A contender
gets k pretend games at the curve's chances for its eval, never better than the champion's, plus
its real games. It switches only if, 95% sure, it scores at least 1 point more than the champion
and loses at most 30 cp. A contender that couldn't pass even with the champion's prior and its
real games is not searched. Evals are HE's Stockfish 19 at 2M nodes, cached. `--k low` takes each move's k from the low end
of the pool's trend range, `--k best` from its best fit. It writes
`data/selections/<run>/selections.jsonl` (every position, every contender and why it passed or
failed) and `selections-summary.json` (switches, their cumProb-weighted share, by move number).
`--db` points at another SQLite file; the default is `prisma/dev.db`, opened read-only.

## Checks

```powershell
npm --prefix experiments/he test
npm --prefix experiments/he run typecheck
npx eslint experiments/he
node --import tsx experiments/he/tests/smoke.ts stockfish-windows-x86-64-universal/stockfish/stockfish-windows-x86-64-universal.exe
```

The optional real-engine smoke check evaluates one small legal position at 2M nodes,
confirms a cached result, and exercises a restricted candidate search.
Unit tests use synthetic games; they are not evidence for the statistical model.

## Next milestone

The curve, fitted k and its uncertainty, posterior safe-gain selector, position-specific
minimum-sample bounds, cumulative route budget, 2025 tuning and frozen 2026 verdict
are not implemented yet. The first real task after this foundation is to collect and evaluate
the 2023–24 fit cohort, inspect repeated-group coverage, then fit and check the WDL curve.
No guessed prior, k or selection confidence is presented as a measured result.

## MySQL

HE data can also live in a local MySQL 8.0 container, `he-mysql`, with its files in data/mysql/.
Scripts log in as the `he` user. Set the connection once as a Windows user environment variable,
then restart terminals and editors so they see it:

```powershell
[Environment]::SetEnvironmentVariable("HE_MYSQL_URL", "mysql://he:<password>@127.0.0.1:13306/he", "User")
npm --prefix experiments/he run db-check
```

db-check prints the server version, user and database. The password is never stored in the code.

The container publishes MySQL on host port 13306, not 3306: Windows can reserve port ranges for
itself (`netsh interface ipv4 show excludedportrange protocol=tcp`), and on 2026-10-22 one of them
held 3306, so Docker could not open it. The container was made with:

```powershell
docker run -d --name he-mysql --restart unless-stopped -p 127.0.0.1:13306:3306 --env-file <MYSQL_* variables> -v "C:/chess-repertoire/experiments/he/data/mysql:/var/lib/mysql" mysql:8.0
```
The mysql2 driver is installed in experiments/he/node_modules, not in the application.

### Games table

load copies a download's sample.pgn into the `games` table: one row per game with its
Lichess ID, date, both ratings, the PGN result, Lichess's termination reason, its ECO code
and opening name for the whole game, the final
position's state (checkmate, stalemate, insufficient material or undefined) and the full mainline
in UCI and in SAN. MySQL fills in `stop_reason` from these: checkmate, stalemate, insufficient,
time, drawn (agreed, repetition or 50-move) or resigned (inferred; may include players who left).
It creates the table on first use. Loading again is safe: a game already
in the table is overwritten, not doubled. A game is rejected if its header and move-list
results differ, or if a checkmate or drawn final position contradicts the result. A missing
ECO code or opening name is stored as ?, never a reason to reject. Rules-infraction games
never reach it: the filter drops them. 50,000 games take about 20 minutes.

```powershell
npm --prefix experiments/he run load -- --run 2024-01-2500mb --limit 100
```

### Sampled moves table

load-moves joins a run's observations.jsonl to its evals.jsonl and copies each game's sampled
move into `sampled_moves`: move number, SAN, UCI, the FEN before it, where its group's search
lies (id, results file and `search_run`, the earlier run when it was reused), the group's size and the eval (cp_white or mate_white, exactly one, and depth).
It joins `games` by game_id and reports rows with no game. Repeating it is safe.

```powershell
npm --prefix experiments/he run load-moves -- --run 2024-02-3000mb
```

## Dot page

`dots` writes data/runs/<run>/dots.html from observations.jsonl, evals.jsonl and curve.json: every
game with a cp eval as a dot (eval against Black's result), the fitted curve and its range, and
per-band real scores. Samples, filters and a clicked game's details (Lichess link at the sampled
move, search id, FEN, MySQL query) run in the page; it needs no server or internet. The page
itself is dots-template.html.
