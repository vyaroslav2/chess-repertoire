---
tags:
  - glossary
  - in-progress
aliases:
  - depthCap
  - depth cap
---
**`depthCap`** — the most full moves any route may run, counted from the root: 5. See [[generation-config]].

Each route gets a depth budget from `depthBudget`, chosen by the band of its [[cumulative-probability|cumProb]]. `depthCap` sits on top of that. The route's real limit is the smaller of the two:

`limit = min(depthBudget for its band, depthCap)`

The limit counts Black's moves. With a limit of 5, the route ends straight after Black's 5th move.

With `depthCap` = 5:

| Band    | `depthBudget` | Real limit |
| ------- | ------------- | ---------- |
| deep    | 15            | 5          |
| medium  | 8             | 5          |
| shallow | 5             | 5          |

So at 5, every band stops at 5 full moves, and the bands make no difference. They start to matter only when `depthCap` is above 5. At 15 or more, `depthCap` has no effect at all.

Why it exists: one setting that keeps a whole run short, for trial runs, without changing the three band values.

Not the same as `depthBudget`. `depthBudget` gives a deeper search to more likely positions. `depthCap` is one ceiling for all of them.
