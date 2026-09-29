---
tags:
  - glossary
  - reviewed
aliases:
  - duplicates
---
**Duplicate** — within one [[cascade]], an item with the same fromNode, toNode and gainOnThisItem as one already in [[applied-items|appliedItems]].

It can mean one of two things:
* by chance: two paths deliver exactly the same gain, so the same edge fires the same amount twice. Both items are real.
* a bug that puts the same item on the [[worklist]] twice.

The item is logged as a warning and applied anyway. If it was real, that is correct. If it was a bug, the probability balance at the end of the cascade finds the extra probability and stops the run.

Counted in `duplicates` and logged when the cascade completes.

Not the same as a [[refire]], where the gain differs.