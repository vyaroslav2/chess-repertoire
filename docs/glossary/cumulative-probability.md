---
tags:
  - glossary
---
# cumulativeProb

`cumulativeProb` is the combined probability of reaching a shared repertoire position through all distinct repertoire routes that lead to it.

It answers:

> "Across the whole repertoire, how likely are we to reach this position by any of the routes that transpose into it?"

For a position reached through only one route, `cumulativeProb` is the same as that route's `trueProbability`.

For a transposition reached through several distinct routes, their route probabilities are added.

For example:

- route A: `trueProbability = 4%`;
- route B: `trueProbability = 2%`.

Then the shared position should have:

`cumulativeProb = 6%`

The individual routes still keep their own `trueProbability` values.

This value belongs to the shared repertoire position rather than to one particular move history.

## Relationship to the other probability values

- `prob` = probability of one White move from its immediate parent position
- `trueProbability` = cumulative probability of one exact route
- `cumulativeProb` = sum of the `trueProbability` values of all distinct routes that reach the shared position

## Important implementation note

Only unique route contributions should be counted. Regenerating the same repertoire must not add the same route probability again.
