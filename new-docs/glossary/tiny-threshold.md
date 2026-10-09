---
tags:
  - glossary
  - reviewed
aliases:
  - tinyThreshold
  - tiny threshold
---
**`tinyThreshold`** — the smallest gain a cascade still passes on: 0.00001% (0.0000001 as a fraction). See [[generation-config]].

When an item comes off the worklist, its `gainOnThisItem` is checked first ([[TR.excalidraw|TR.24]]). If the gain is smaller than `tinyThreshold`, it is not passed on. Instead ([[TR.excalidraw|TR.37]]):
* `tinyDroppedTotal += gainOnThisItem`
* `tinyDroppedCounter += 1`

The gain is not lost. It is counted in `tinyDroppedTotal`, which is part of the probability balance.

Why it exists:
* **Loops.** A cascade can go round a loop of transpositions. Each time round, the gain is multiplied by move probabilities, so it shrinks. Without a floor, it would shrink for ever and never stop. `tinyThreshold` ends it.
* **Wasted work.** A gain this small changes no card and no depth band, so there is no point spreading it down a subtree.

If a loop does not shrink, [[node-touch-count-cap|nodeTouchCountCap]] stops it ([[TR.excalidraw|TR.36]]).

Not the same as [[probability-tolerance|probabilityTolerance]]. `tinyThreshold` decides whether a gain moves. `probabilityTolerance` decides whether two totals count as equal.

