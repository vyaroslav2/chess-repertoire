---
tags:
  - "#processed"
  - sf19-todo
---
# HM — Human Moves

HM fetches move candidate statistics for a position and creates child nodes for the search queue.

HM blocks live in two places. HM.01 to HM.08 are here: the position-level flow. HM.20 to HM.39 are in [[HM.excalidraw|HM]]: the per-move checks that follow, drawn rather than written. The bands never overlap, so any `HM.nn` points at exactly one block.

HM.01 Receive the target position from [[S3|S3.07]].

HM.02 Query the Explorer dataset (local cache or Lichess API) for all legal candidate moves played at this position ([[EX|EX.01]]). EX returns here, and HM carries on.

HM.03 Calculate move probabilities ([[move-probability|moveProb]]) for each move.

HM.04 Filter returned moves by popularity:
* A move that meets the `popularityThresholds`[^1] percentage for its move-number band goes on to the next check.
* Drop the rest — each dropped move still gets a node, whose `cumProb` is held at 0 and whose arriving probability accumulates in `rareDropped` instead ([[HM.excalidraw|HM.23]]).
* Log how many moves were dropped at this position: `rareDroppedMoves`, counted from the nodes with `stopReason = Too rare`.

HM.05 Assign an explicit `siblingIndex` (1, 2, 3...) to every returned move's node, dropped moves included, based on descending popularity, ensuring UI decks can sort cards reliably regardless of queue traversal order. UI cards are ordered from most popular White moves to least popular. Ties are resolved alphabetically by SAN. 


HM.06 For each returned move, generate a new child node:
* Handle the least popular move first, so it is pushed first and taken last ([[S3|S3.09]]).
* Assign a position key (`normalisedFen`).
* Compute its route probability: `routeProb = parent.routeProb * moveProb`.
* Only a move that passes every check in HM.07 is expanded and reaches [[EW]].

HM.07 Each returned move is then checked one at a time. The order is fixed and all of it is in [[HM.excalidraw|HM]]: record the move and create the node (HM.25), too rare (HM.21), game over (HM.26), repetition (HM.30), transposition (HM.34), then expansion (HM.36). Only a move that passes all four checks is expanded: it goes to [[EW]] for Black's reply.

HM.08 If Explorer returned moves but all of them were filtered away `-->` end the route, log the stop reason `"[WARNING] All opponent moves were filtered away."`, and go to [[S3|S3.01]].

[^1]: see [[generation-config]] and [[popularity-thresholds|popularityThresholds]]


