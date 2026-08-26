---
tags:
  - processed
---
### R.11 — Put the starting position on the queue

**What the code does**
The queue is created with exactly one item on it: the root. That item carries six things — which node it is, the position, the move number (1), the trap counter (0), the cumulative probability (100%), and the move history (empty).[^3]

The queue lives in memory only. It is not written down anywhere, so when the run ends the queue ends with it.

**Why this matters**
This is the seed of the whole run. Everything that follows is the loop in [[A1]] taking an item off the front, expanding it, and pushing the positions it reaches onto the back. Empty the queue and the run is finished.

The six things travelling with each item are what the expansion needs to know and cannot work out from the position alone. The move number decides how deep the branch has gone and which tolerance applies; the trap counter decides how much further a trap line may run; the cumulative probability decides both whether the position is worth expanding and what its children inherit. None of these can be recovered by looking at the board.

Because the queue is only in memory, a run that stops halfway leaves nothing to resume from — which is intended, not a shortcoming. Restarting always means starting over from the root.[^1][^1]

Taking items from the front is what makes the tree grow evenly: every short line is finished before any long line is begun. Stop a run early and you have a complete shallow book rather than one deep line and a lot of gaps. That choice is made where items are removed, in [[A1.16]], not here — this step only puts the first one on.[^2]

**Why it may have been designed this way**
Known: the item carries exactly what the expansion steps read and nothing more. Each field is used in [[A2]] or [[A4]].

Likely: keeping the queue in memory was the simple choice rather than a decision about resuming. Nothing suggests resuming was considered.

**Also affects:** [[A1.12]] (the same step drawn in A1), [[A1.16]] (where items come off), [[A4.27]] (where new items go on), [[R.10]] (the node this points at), [[R.12]] (the visited list started alongside it)

Notes:

[^1]: #note The queue lives only in memory, so a run that stops halfway leaves nothing to resume from — and that is correct by design. The generation model is rebuild-from-root only (see [[M]]): a run that fails is discarded and started again clean from the root, never resumed. Persisting the queue to allow resume is deliberately not wanted, because it would add run-state tracking for no benefit — the tree is derived data and the caches survive a wipe, so a fresh rebuild is cheap.

[^2]: #note Taking from the front, so that short lines finish before long ones start, is the decision that shapes the whole tree. It is made in [[A1.16]], where items are taken off — this box only seeds the queue.

 

