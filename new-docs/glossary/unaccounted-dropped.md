---
tags:
  - glossary
  - reviewed
aliases:
  - unaccountedDropped
  - unaccountedDroppedTotal
---
**Unaccounted dropped** — probability lost because Lichess Explorer's move counts do not add up to the position's total games. The missing games are ones Explorer counts but lists no move for: moves beyond the ones it returns, and games that ended at the position. Amateur data only. Two figures record it:

* **`unaccountedDropped`** — on a node where it is White to move, the probability lost to that gap. The missing games have no move, so there is no child to hold it; the node itself does. E.g. moves 2 + 2 + 1, total 6: 1/6 of whatever arrives is added here:
  * when the node's children are created;
  * later, from each [[cascade]] that reaches it.
* **`unaccountedDroppedTotal`** — `unaccountedDropped` summed over every node. It is not kept anywhere; it is summed from the nodes whenever it is needed. It is part of the probability balance.

Kept apart from [[rare-dropped|rareDropped]] so that gaps in Lichess's data can be told apart from our own filtering.
