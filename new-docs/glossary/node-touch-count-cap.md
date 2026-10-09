---
tags:
  - glossary
  - reviewed
aliases:
  - nodeTouchCountCap
  - touch count cap
---
**`nodeTouchCountCap`** — the most times one node may be touched in one cascade: 500. See [[generation-config]].

A node's touch count goes up by 1 each time a gain is applied to it ([[TR.excalidraw|TR.17]]). The counts are cleared at the start of each cascade ([[TR.excalidraw|TR.23]]), so they count one cascade only.

After each touch, the count is checked ([[TR.excalidraw|TR.36]]). Above `nodeTouchCountCap` → stop, hard error ([[TR.excalidraw|TR.43]]).

A node can be touched more than once for good reason. Two pointers in the same subtree may both forward their gain to the same owner. But a node touched hundreds of times means the cascade is going round a loop.

Why it exists: [[tiny-threshold|tinyThreshold]] ends a loop whose gain shrinks each time round. This cap catches the loops it cannot end:
* a gain that does not shrink, because every move around the loop has a moveProb of 100%;
* a bug that puts the same item back on the worklist.

Without the cap, either case would run for ever.