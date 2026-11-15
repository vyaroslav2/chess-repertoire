---
tags:
  - in-progress
---
# Changelog

## 2026-10-09

- Revised [[HER]], the human-evidence spec, from download to the MySQL table.
- Installed MySQL Workbench and connected it to the local database.
- Rebuilt 2024-01-2500mb from scratch with the new rules: 50,000 games, cheats now dropped by the filter. 

## 2026-10-22

- Trainer: one Anki card per whole line, graded at the line's end; Ctrl + Z is Anki's undo.
- Trainer: Anki's counts beside the board, a status light for the whole line, S hides the status line.
- Trainer: Lichess's capture sound, red king in check and mate badge; a wrong move shows for 300 ms.
- HE: imported the Colab results, all 40,836 searches; 
- HE: fitted the curve and k on February ([[HEV]]).
- HE: dot page of every game; sampled moves and evals in MySQL, now on port 13306.
- HE: `recheck --game` searches one game live, depth by depth, beside the Colab result.
- Russian write-ups of the curve and k; for a presentation.


## 2026-10-23

- Trainer: E's choice to show or hide the evals now stays across cards and reloads ([[UI|UI.34]]).
- Trainer: wrong and revealed moves mark their move number red or amber; X clears the latest mark, for a misclick ([[GR|GR.07]], [[UI|UI.36]]).
- Trainer: wrong moves show as shaded rows under their move, on every page; X undoes one reveal or row per press ([[UI|UI.37]], [[GR|GR.07]]).
- Trainer: the current move stays blue while a wrong move shows ([[UI|UI.25]]).
- Trainer: 1 grades Again at any move in a line, even as White's reply slides in, and skips the rest ([[GR|GR.04]]).
- Trainer: Anki's counts sit 60 px left of the board ([[UI|UI.22]]).
- HE: the Colab script closes the results file every 500 results, so a dead runtime loses at most 500.
- HE: `jobs --reuse <run>` reuses an earlier run's searches for the groups it already has.


## 2026-10-24

- Specs: a line now stops when its cumProb falls below `minCumProb` (0.1%), at any depth. Removed `popularityThresholds`, `moveNumberBands`, `probabilityBands` and `depthBudget`; `depthCap` (15) stays as a ceiling ([[HM]], [[DRS]], [[generation-config]]).
- Generator: built the `minCumProb` stop. Every Explorer move is kept; too rare is checked after transposition ([[HM]]).
- Generator: DRS reopens too-rare moves that later routes lift to `minCumProb` ([[DRS]]).
- Engine: every eval stores the deepest depth it completed ([[DB|DB.11]], [[DB|DB.32]]). Fixed: the unfinished line Stockfish prints at the node-limit stop was taken as a finished depth ([[EW|EW.09]]).
- UI: hover an eval to see its depth in a tooltip; try it on /depth with mock evals. Real depths are not passed to the move list yet ([[UI|UI.38]]).

## 2026-10-25

- HE: March's jobs-a is split in two, so a third person can search part c. results, recheck, the dot page and MySQL read it.

## 2026-10-31

- HE: the 2025 check, the per-rating-group check, the dial tuning and the final 2026 test of the selector ([[HES|HES.90–116]]). Default confidence now 90%.
- Specs: [[HEG]], the selector in the generator.
- Generator: built the selector behind `humanEvidence` (off by default): EW.14, the 2M prior searches, month-limited counts, the line budget, the new fields on Black's move ([[HEG]], [[EW|EW.14]], [[DB|DB.14]]). Not yet run on the real tree.

## 2026-11-10

- Specs: [[SCR]], a Russian translation of [[SC]].
- SC: rewrote the friend's Colab code to SC's settings and fields.

## 2026-11-12

- SC: reviewed the friend's Colab code and MySQL table ([[sc-colab-review]]).

## 2026-11-13

- SC: 10 of 10 of the friend's positions match ours in every field, so the two engines agree ([[SC|SC.60]]).
- SC: export and import of the shared eval cache, with checks on every eval and all-or-nothing import ([[SC|SC.51–57]]). `scripts/sc_export.ts`, `scripts/sc_import.ts`; the friend's Python version in `scripts/sc-friend/`.
- Tests: a test run can no longer touch dev.db. Every Prisma client comes from `src/lib/db/client.ts`, which refuses any database but `test.db` in a test. `run_db_tests.ts` with no file now runs every test file. Made after a test run directly on dev.db wiped the 200M engine cache this morning.
- Generator: copies dev.db to `prisma/dev.db.bak-YYYY-MM-DD-HHMM` before each run (no copy, no run; newest 10 kept), and exports the engine cache to `exports/` after each run ([[SC|SC.58]]).

## 2026-11-14

- Config: only 1. e4 c6 and 1. d4 d5 stay hardcoded. Every other first move gets Stockfish's baseline (EW.09); from move 2, human evidence as before (EW.14).
- SC: the friend's scripts connect through his own `db_config.py` or `.env`, and `sc_import.py` / `sc_export.py` run with no arguments, for his Access buttons.

## 2026-11-15

- SC: each eval in the engine cache has `importedAt`: empty for ours, the time of import for one imported from the friend ([[SC|SC.52]]).
- Trainer: hover an eval to see its depth, now with real depths from the database ([[UI|UI.38]]).
- Trainer: engine marks. `!?` after a human-evidence switch, in the list and on the board; a star on the board when White plays Stockfish's top move; hover shows Stockfish's move and the loss, `SF Nf6 · loss 12 cp`. All hide with E. Tried on /glyph ([[UI|UI.41]]).
