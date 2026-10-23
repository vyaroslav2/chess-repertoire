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


