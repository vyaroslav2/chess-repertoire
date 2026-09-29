---
tags:
  - glossary
  - reviewed
aliases:
  - endings
  - ending total
---
**Ending** — a [[node]] with no children at this moment.

That includes:
* nodes whose route has stopped: game over, repetition, depth budget reached, no games in Explorer;
* nodes still on the [[S3]] queue, not yet expanded;
* pointer nodes (transposesTo set); their cumProb is 0;
* dropped (too rare) nodes; their cumProb is 0, and what reaches them is in rareDropped.

**Ending total** — the sum of cumProb over every ending. With `rareDroppedTotal`, `unaccountedDroppedTotal` and `tinyDroppedTotal`, it makes up 100% at the end of the run ([[S3|S3.11]]). A cascade must not change the sum of all four ([[TR.excalidraw|TR.41]]).

A node stops being an ending once it has a child. A queued node is an ending now, but it may not be one when the run finishes.