---
tags:
  - glossary
  - reviewed
aliases:
  - rareDropped
  - rareDroppedTotal
---
**Rare dropped** — probability lost to too-rare moves ([[min-cum-prob|minCumProb]]). Two figures record it:

* **`rareDropped`** — on a dropped (too rare) node, the probability that reaches it and stops there. Only a dropped node has it. Its `cumProb` is held at 0, and whatever arrives is added here instead:
  * when the node is created: its share, parent.cumProb × moveProb;
  * later, from each [[cascade]] that reaches it.
  
  If it reaches `minCumProb`, a sweep moves it back into `cumProb` and expands the node ([[DRS]]).
* **`rareDroppedTotal`** — `rareDropped` summed over every node. It is not kept anywhere; it is summed from the nodes whenever it is needed. It is part of the probability balance.