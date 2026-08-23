---
tags:
  - glossary
---

# trueProbability

`trueProbability` is the cumulative probability of one exact repertoire route.

It answers:

> "What is the probability of reaching this position through this particular sequence of repertoire moves?"

It is calculated by multiplying the probabilities along that route.

For example:

- first relevant White move: `40%`;
- later White move: `25%`;
- later White move: `20%`.

Then:

`40% × 25% × 20% = 2%`

So that exact route has:

`trueProbability = 2%`

If another move order reaches the same chess position, that other route has its own separate `trueProbability`.

`trueProbability` belongs to a path, not to the shared position itself.

## Relationship to the other probability values

- `prob` = probability of one White move from its immediate parent position
- `trueProbability` = cumulative probability of one exact route
- `cumulativeProb` = combined probability of reaching the same shared position through all distinct repertoire routes
