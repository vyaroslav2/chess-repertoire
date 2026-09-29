---
tags:
  - glossary
  - reviewed
aliases:
---
**Repetition** — a position that already appears earlier on the same route, with the same side to move. Two positions match when their [[position-key|positionKey]] is the same.

This is not a transposition. A transposition reaches a known position by a *different* route. A repetition comes back to a position on *its own* route.

When it happens, the route ends there with `stopReason = Repetition` ([[HM.excalidraw|HM.30]]). The node keeps its own `cumProb`, but it is not passed back to the earlier node. That would count the same probability twice.

We ignore the threefold and fifty-move rules by design:
* We stop at the first repeat, so a third occurrence is never reached.
* `positionKey` drops the move clocks, so the fifty-move count is never seen.