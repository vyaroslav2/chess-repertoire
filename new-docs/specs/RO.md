---
tags:
  - in-progress
---
# RO — Depth Recheck Sweep

A route that stops on its depth budget ([[RE.excalidraw|RE.08]]) is never checked again. A later cascade can raise its `cumProb` into a higher `probabilityBands` band ([[generation-config]]), which has a bigger depth budget. The sweep finds such routes when the queue is empty and puts them back. Cascades do not change: they move probability and nothing else. #roadmap

RO.01 **When.** The queue is empty at [[S3|S3.02]]. Run a sweep before the end of run ([[S3|S3.10]]). 

RO.02 **Walk.** Walk the tree from the root, depth first, children in `siblingIndex` order ([[HM|HM.05]]). This reaches the endings in the same order as the log.

RO.03 **Candidates.** Endings whose Black move carries stopReason = Depth budget reached ([[RE.excalidraw|RE.07]]). Every other ending is skipped.

RO.04 **Test.** Run the [[RE.excalidraw|RE.08]] test again, with the band of the node's cumProb now. The code calls the same check as RE.08, not a second copy of it.[^1]
* budget still used up `-->` leave the node as it is.
* budget not used up `-->` clear stopReason on its Black move ([[DB|DB.20]]), log `"[REOPENED] [node]: depth [n] of [limit]."`[^2] and add the node to the sweep list.

RO.05 **Push.** Push the sweep list onto the S3 queue, last node first. The queue is LIFO ([[S3|S3.09]]), so the first node in log order is taken first. 

RO.06 **Next.** Log `"[SWEEP n] Reopened [k] routes."`[^2]
* k above 0 `-->` back to [[S3|S3.01]]. The reopened routes are expanded as usual, cascades included.[^3] The next empty queue runs the next sweep.
* k = 0 `-->` go to [[S3|S3.10]]. The summary ([[TGL]]) prints the number of sweeps and of reopened routes.

RO.07 **Why it ends.** A cascade only adds to `cumProb` ([[TR.excalidraw|TR.16]]).[^4] The only node that drops is the new pointer ([[TR.excalidraw|TR.10]]), and a pointer is never a candidate. So a band only goes shallow `-->` medium `-->` deep, and a route can reopen at most twice. Depth is limited, so the sweeps stop.

RO.08 **No duplicates.** A depth-stopped node was never pushed ([[RE.excalidraw|RE.10]]), so it is not on the queue and not in `visitedNodes` ([[S3|S3.03]]). RO.04 clears its `stopReason`, so the next sweep skips it unless it stops again at a greater depth. `visitedNodes` carries across sweeps.

RO.09 **Probability.** A sweep moves no probability. The balance ([[S3|S3.11]]) holds after every sweep; it is checked once, at the end.

## Where this will go

* [[S3]] — RO.01 and RO.06 between S3.02 and S3.10.
* [[RE.excalidraw|RE]] — a note on RE.08: the test is shared with RO.04.
* [[DB]] — DB.20: a reopened route loses its stopReason.
* [[TGL]] — the two summary counts.
* [[OV]] — remove the #roadmap line; [[HM]] footnote 2 and review question 5 point here.



[^1]: #note With `depthCap` = 5 every band's limit is 5 ([[RE.excalidraw|RE.N.03]]), so RO.04 never passes and the first sweep ends the run.

[^2]: see [[TGL]]  

[^3]: #note Reopened routes are expanded after their siblings, so their nodes come later in the log. `siblingIndex` still gives the display order.

[^4]: The only node whose `cumProb` goes down is the one that has just become a pointer: it hands its `cumProb` to the owner and is set to 0 (TR.10).

