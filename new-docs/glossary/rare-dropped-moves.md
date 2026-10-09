---
tags:
  - glossary
  - reviewed
aliases:
  - rareDroppedMoves
  - rareDroppedMovesTotal
---
**Rare dropped moves** — how many White moves popularity filtering dropped ([[popularity-thresholds|popularityThresholds]]). A count of moves, not a probability; for the probability, see [[rare-dropped|rareDropped]].

* **`rareDroppedMoves`** — the moves dropped at one position: its children with `stopReason = Too rare`. Logged when the moves are filtered.
* **`rareDroppedMovesTotal`** — the moves dropped in the whole run: every node with `stopReason = Too rare`. Printed in the run summary.

Neither is kept anywhere. Both are counted from the nodes when needed.
