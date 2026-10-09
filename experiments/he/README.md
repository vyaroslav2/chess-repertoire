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

Searches use Stockfish 19, depth 24, MultiPV 1, Threads 1 and Hash 64 MB.
The baseline is an unrestricted root search. Each observed candidate is searched at
the same root with searchmoves. If it is already the champion, its baseline result is reused.
The cache lives in data/eval-cache/<profile>/, with the binary SHA-256, engine name,
settings, full root FEN and restricted move in its identity. Search history is cleared
before every uncached request. Raw UCI lines are retained and checked when loading the cache.

Scores are stored from White's view; for Black, cp loss is
max(0, candidate cpWhite - champion cpWhite).
Only exact, unbounded scores at depth 24 are accepted. A search that stops before d24
fails instead of quietly mixing depths. Mate scores stay explicit; mate observations are
excluded from the ordinary cp curve rather than converted into invented cp values.
Finite-depth scores are estimates.

## Checks

```powershell
npm --prefix experiments/he test
npm --prefix experiments/he run typecheck
npx eslint experiments/he
node --import tsx experiments/he/tests/smoke.ts stockfish-windows-x86-64-universal/stockfish/stockfish-windows-x86-64-universal.exe
```

The optional real-engine smoke check evaluates one small legal position at d24,
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
[Environment]::SetEnvironmentVariable("HE_MYSQL_URL", "mysql://he:<password>@127.0.0.1:3306/he", "User")
npm --prefix experiments/he run db-check
```

db-check prints the server version, user and database. The password is never stored in the code.
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
