---
tags:
  - processed
---
### R.10 — Make sure the root node exists

**What the code does**
The launcher looks for a node in this repertoire whose move history is empty. If there is one, it is used. If not, one is created: the opening position, an empty history, and a cumulative probability of 100%.

An empty history is what makes it the root. Every other node in the tree is found by the moves that reached it, so the one reached by no moves at all is the top of the tree.

The two trap flags are not set, so they take their default of false.

**Why this matters**
This is the anchor. Everything the generator builds hangs below this node, and the first item on the queue points at it.

The cumulative probability of 100% means you are certain to reach this position — which is true, since it is the position every game starts from. Every node below it multiplies its parent's figure by how often humans play the move that leads there, so the numbers only mean anything because this one starts at certainty.

Reusing an existing root is what makes a second run possible at all, in principle: the run finds the root rather than trying to create it again. The trouble comes one level down, where [[A4.10]] tries to create nodes that already exist and the run stops — the crash described in [[R.01]].[^1]

The search is by empty history within this repertoire, so a second repertoire would get its own root without conflict. This step is not what limits you to one; [[R.08]] is.

**Why it may have been designed this way**
Known: the root is found by history rather than by position, which is consistent with how every other node is found — see [[RM.01]]. Using the position instead would have been the odd one out, and would have broken as soon as two repertoires shared a starting position.

Known: creating it with the flags unset is right. Trap and threat flags describe how a position was reached, and the opening position was not reached by anything.

**Also affects:** [[A1.09]] (the same step drawn in A1), [[A1.10]] and [[A1.11]] (create or reuse, drawn separately there), [[R.09]] (the cache row this depends on), [[R.11]] (which puts this node on the queue), [[RM.01]] and [[RM.04]] (the shared steps this calls)

Notes:

[^1]: #note Reusing the existing root is the one part of a second run that works as intended — the run gets past this step and stops at the first White move instead. See the re-run crash in [[R.01]]. Nothing here needs changing when that is fixed.

