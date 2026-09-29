---
tags:
  - in-progress
  - glossary
aliases:
  - cascades
  - cascadeId
---
**Cascade** — what happens when a new [[pointer]] is found. Its [[cumulative-probability|cumProb]] is handed to the [[owner]] and spread down the owner's subtree, passing through any other pointers on the way, until the [[worklist]] is empty.

A cascade changes cumProb only, never [[route-probability|routeProb]]. It moves probability; it does not create or lose any. The ending total plus `rareDroppedTotal`, `unaccountedDroppedTotal` and `tinyDroppedTotal` is the same before and after.

Each cascade gets a `cascadeId`: C01, C02… Every item on its worklist carries it, so log lines can be traced back to it: 
```
C01.001
C01.002
C01.003
...
```

Some things are counted per cascade and cleared at its start: [[applied-items|appliedItems]], touch counts, [[revisit|revisits]], [[refire|refires]], [[duplicate|duplicates]] and [[tiny-dropped|tinyDroppedCounter]].