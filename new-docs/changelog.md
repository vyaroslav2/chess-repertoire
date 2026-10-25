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
