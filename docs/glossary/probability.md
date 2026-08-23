---
aliases:
tags:
  - glossary
---

# prob

`prob` is the probability of one White move from its immediate parent position.

It answers:

> "Given that we have reached this position, how often is this White move played?"

For example, if White plays `Nf3` in 20% of the relevant games from the current position:

`prob = 20%`

`prob` is local to that one move. It does not include the probability of reaching the parent position.

In the current generator, this value comes from the White-move filtering stage and ==may sometimes be an adjusted value rather than the raw database frequency.==

## Relationship to the other probability values

If the parent route has `trueProbability = 10%` and the White move has `prob = 20%`, then the exact route after that move has:

`10% × 20% = 2%`

That 2% is the new route's `trueProbability`.
