---
tags:
  - reviewed
---
# HM — Human Moves

HM fetches move candidate statistics for a position and creates child nodes for the search queue.

HM blocks live in two places. HM.01 to HM.08 are here: the position-level flow. HM.20 to HM.39 are in [[HM.excalidraw|HM]]: the per-move checks that follow, drawn rather than written. The bands never overlap, so any `HM.nn` points at exactly one block.

HM.01 Receive the target position from [[S3|S3.07]].

HM.02 Query the Explorer dataset (local cache or Lichess API) for all legal candidate moves played at this position ([[EX|EX.01]]). EX returns here, and HM carries on.

HM.03 Calculate move probabilities ([[move-probability|moveProb]]) for each move.

HM.04 Every returned move is kept, however rare. No move is filtered at this point. A move is too rare when its node's `cumProb` (parent.cumProb × moveProb) is below `minCumProb`[^1]. That check runs per move, after the transposition check ([[HM.excalidraw|HM.21]]):
* A move at or above `minCumProb` goes on to the next check.
* A move below it is dropped. It still gets a node, whose `cumProb` is held at 0 and whose arriving probability accumulates in `rareDropped` instead ([[HM.excalidraw|HM.23]]).
* Once every move at this position is checked, log how many were dropped: `rareDroppedMoves`, counted from the nodes with `stopReason = Too rare`.

HM.05 Assign an explicit `siblingIndex` (1, 2, 3...) to every returned move's node, dropped moves included, based on descending popularity, ensuring UI decks can sort cards reliably regardless of queue traversal order. UI cards are ordered from most popular White moves to least popular. Ties are resolved alphabetically by SAN. 


HM.06 For each returned move, generate a new child node:
* Handle the least popular move first, so it is pushed first and taken last ([[S3|S3.09]]).
* Assign a position key (`normalisedFen`).
* Compute its route probability: `routeProb = parent.routeProb * moveProb`.
* Only a move that passes every check in HM.07 is expanded and reaches [[EW]].

HM.07 Each returned move is then checked one at a time. The order is fixed and all of it is in [[HM.excalidraw|HM]]: record the move and create the node (HM.25), game over (HM.26), repetition (HM.30), transposition (HM.34), too rare (HM.21), then expansion (HM.36). Transposition comes before too rare: a rare move that reaches a position the tree already owns still passes its probability on to the owner. Only a move that passes all four checks is expanded: it goes to [[EW]] for Black's reply.

HM.08 If Explorer returned moves but all of them are too rare `-->` the route ends, log `"All opponent moves are too rare."`, and go to [[S3|S3.01]]. This is how most lines end, so it is not a warning.

HM.09 **An expanded move gets an eval** ([[DB|DB.11]]): the eval of [[EW|EW.09]]'s search of the position it reaches — Stockfish's baseline, even when a hardcoded reply is played. No second search. A move stopped by any check in HM.07 gets no eval.

[^1]: see [[generation-config]] and [[min-cum-prob|minCumProb]]


