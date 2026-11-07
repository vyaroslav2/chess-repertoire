---
tags:
  - glossary
  - reviewed
aliases:
  - minCumProb
---
**`minCumProb`** — the least likely a position may be and still get a card: 0.1% (0.001 as a fraction), so 1 in 1000. See [[generation-config]].

A White move whose node's [[cumulative-probability|cumProb]] is below `minCumProb` is too rare. Black does not reply to it, and what reaches it goes to [[rare-dropped|rareDropped]] instead.

Every move Explorer returns is checked this way, however rare. Rare moves fall below the line quickly on their own, so no other filter is needed. A line stops at whatever depth it falls below `minCumProb`, or at [[depth-cap|depthCap]] at the latest.

A too-rare move still owns its position. If later routes reach that position, what they bring adds to its `rareDropped`. Once that reaches `minCumProb`, a sweep expands the move after all ([[DRS]]).

Lower it for more cards, raise it for fewer.
