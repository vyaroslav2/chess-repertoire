---
tags:
  - processed
---
### R.12 — Start the visited list

**What the code does**
An empty list is created to hold the move sequences the run has already dealt with. Each entry is a line of moves written out as one piece of text, such as "e4 c6 d4 d5".

Like the queue, it lives in memory only and disappears when the run ends.

Nothing is added here. The list is filled in during the loop, at [[A1.19]], and consulted at [[A1.18]].

**Why this matters**
It stops the run doing the same work twice within one run. The same line of moves can arrive on the queue more than once, and without this the run would expand it again — fetching the same statistics, running the same engine searches, and then failing to create nodes that already exist.

It is keyed on the move sequence, so two different move orders reaching the same board are two different entries, and both get expanded. That is consistent with how nodes are identified everywhere else — see [[RM.01]] — and it is why the tree has one path into each node.

Because it is thrown away at the end of the run, it only prevents repeats *within* a run. A later run knows nothing about what an earlier one did.[^1]

**Why it may have been designed this way**
Known: the entries are move sequences rather than positions, matching how nodes are keyed throughout.

Likely: the list is in memory because it is a guard against repetition inside a single run, and nothing more was needed. The database already knows what exists — this is only about not doing the work twice before that check happens.

**Also affects:** [[A1.13]] (the same step drawn in A1), [[A1.17]] (which writes the sequence out as text), [[A1.18]] (which consults it), [[A1.19]] (which adds to it), [[R.11]] (the queue started alongside it)

Notes:

[^1]: #note The list is emptied when the run ends, so it guards against repeats within one run only. A second run would walk positions it has already seen. Today that stops at the re-run crash in [[R.01]]; when that is fixed, the extend mode described there is what decides whether the earlier work is reused.

