---
tags:
  - reviewed
---
# DRS — Dropped Recheck Sweep

A White move that is too rare ([[HM.excalidraw|HM.21]]) is never checked again. But it still owns its position ([[HM.excalidraw|HM.N.05]]). A later route can reach the same position and point to it, and a cascade can reach it from above. What arrives adds to its `rareDropped` ([[TR.excalidraw|TR.48]]). That can lift it to `minCumProb` ([[generation-config]]) or above. The sweep finds such moves when the queue is empty and expands them. Cascades do not change: they move probability and nothing else. #roadmap

DRS.01 **When.** The queue is empty at [[S3|S3.02]]. Run a sweep before the end of run ([[S3|S3.10]]). 

DRS.02 **Walk.** Walk the tree from the root, depth first, children in `siblingIndex` order ([[HM|HM.05]]). This reaches the endings in the same order as the log.

DRS.03 **Candidates.** Nodes whose White move carries stopReason = Too rare ([[HM.excalidraw|HM.24]]). Every other ending is skipped.

DRS.04 **Test.** Run the [[HM.excalidraw|HM.21]] test again, on what has reached the node so far: its `rareDropped`. The code calls the same check as HM.21, not a second copy of it.
* still below `minCumProb` `-->` leave the node as it is.
* `minCumProb` or above `-->` move its `rareDropped` into its `cumProb` and set `rareDropped` to 0. Clear stopReason on its White move ([[DB|DB.20]]). Log `"[REOPENED] [node]: cumProb [p]%."`[^1] Add the node to the sweep list.

DRS.05 **Expand.** Send each node on the sweep list to [[HM.excalidraw|HM.36]]: [[EW]] for Black's reply, then [[RE.excalidraw|RE]], which ends the route or pushes the next position onto the S3 queue. Take the list last node first. The queue is LIFO ([[S3|S3.09]]), so the first node in log order is taken off the queue first. No second transposition check: the node already owns its position.

DRS.06 **Next.** Log `"[SWEEP n] Reopened [k] routes."`[^1]
* k above 0 `-->` back to [[S3|S3.01]]. The new positions are expanded as usual, cascades included.[^2] The next empty queue runs the next sweep.
* k = 0 `-->` go to [[S3|S3.10]]. The summary ([[TGL]]) prints the number of sweeps and of reopened routes.

DRS.07 **Why it ends.** A reopened node is no longer too rare, and its `cumProb` only grows ([[TR.excalidraw|TR.16]]). So it is never a candidate again. Each sweep reopens nodes that no earlier sweep reopened. Every route stops at `depthCap` at the latest, so the tree is finite and the sweeps stop.

DRS.08 **No duplicates.** A too-rare node was never expanded, so it got no Black reply and nothing below it was queued. After DRS.04 it is no longer too rare, so no later sweep picks it again. `visitedNodes` ([[S3|S3.03]]) carries across sweeps.

DRS.09 **Probability.** A sweep moves the reopened node's `rareDropped` into its `cumProb`. `rareDroppedTotal` falls by that amount and the ending total rises by the same, so the sum of the four does not change. The balance ([[S3|S3.11]]) holds after every sweep; it is checked once, at the end.

## Where this will go


[^1]: see [[TGL]]  

[^2]: #note Reopened routes are expanded after their siblings, so their nodes come later in the log. `siblingIndex` still gives the display order.

