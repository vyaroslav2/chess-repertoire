---
tags:
  - glossary
  - reviewed
aliases:
  - evals
  - evaluation
---
**Eval** — Stockfish's view of the position a move reaches, assuming best play from there on. Every move on a card carries one ([[DB|DB.11]]).

* **Which position:** the one after the move. `Bf4 +0.00` means that after 2.Bf4, with Black to move, the position is level.
* **Whose view:** always White's. Positive means White is better. Stockfish reports from the side to move, and we flip it before storing ([[DB|DB.15]]).
* **Units:** pawns, two decimals ([[centipawn|cp]]). Since Stockfish 15.1, `+1.00` no longer means "a pawn up". It is scaled so that +1.00 means White wins about half the time in Stockfish's own games, and draws most of the rest.
* **Mate:** `#3` means White mates in 3; `#-3` means Black does ([[DB|DB.12]]).
* **How it's found:** one search of that position, stopped at a fixed number of nodes. We take the score from the deepest depth that finished, and ignore the unfinished one ([[EW|EW.09]]).
* **Comparing two in a row:** the gap shows what a move cost. After `d4 +0.10`, `d5 +0.18` means 1…d5 cost Black about 0.08, which is mostly search noise.
