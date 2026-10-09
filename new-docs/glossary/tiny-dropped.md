---
tags:
  - glossary
  - reviewed
aliases:
  - tinyDroppedTotal
  - tinyDroppedCounter
---
**Tiny dropped** — a gain smaller than [[tiny-threshold|tinyThreshold]]. It is not passed on; it is set aside. Two figures record it:

* **`tinyDroppedTotal`** — the probability set aside, summed over the whole run[^1]. Zeroed once, at the start of the run. It is part of the probability balance, so the gain is not lost.
* **`tinyDroppedCounter`** — how many items were set aside in the current [[cascade]]. Zeroed at the start of each cascade and logged when it completes.

No node holds either. They live in memory.

[^1]: Each cascade reads it before and after, to check the probability balance. It is never reset between cascades.
