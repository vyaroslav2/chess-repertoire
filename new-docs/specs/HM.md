---
tags:
  - in-progress
---
# HM — Human Moves

HM fetches move candidate statistics for a position and creates child nodes for the search queue.

HM blocks live in two places. HM.01 to HM.06 are here: the position-level flow. HM.20 to HM.36 are in [[RE.excalidraw|RE]]: the per-move checks that follow, drawn rather than written. The bands never overlap, so any `HM.nn` points at exactly one block.

HM.01 Receive the target position from [[S3|S3.07]].

HM.02 Query the Explorer dataset (local cache or Lichess API) for all legal candidate moves played at this position ([[EX]]). 

HM.03 Calculate move probabilities ([[move-probability|moveProb]]) for each move.

HM.04 Filter candidate moves by popularity:
* Keep White moves that meet the `popularityThresholds`[^1] percentage for their move-number band.
* Drop rare or obscure moves (their probability is recorded under `rareDropped`[^2].
* ==Ties are resolved alphabetically.==[^3]


HM.05 ==Assign an explicit `siblingIndex` (1, 2, 3...) to child nodes based on descending popularity, ensuring UI decks can sort cards reliably regardless of queue traversal order. UI cards are ordered from most popular White moves to least popular.[^4]==

HM.06 For each kept move, generate a new child node:
* assign a position key (`normalisedFen`). 
* Compute its route probability: `routeProb = parent.routeProb * moveProb`. 
* **Transposition Check**: Is this `normalisedFen` already in the `Position` table? 
* yes `-->` see transposition logic at diagrams/[[TR.excalidraw]].
* no `-->` set Node.transposesTo = null (canonical).
* Hand off the position after White's move to [[EW]] to evaluate and select Black's repertoire response.

HM.07 Each kept move is then checked one at a time — too rare, game over, repetition, transposition — and either ends its route or carries on. Those checks are [[RE.excalidraw|RE]], blocks HM.20 to HM.36. The diagram is the detail; HM.04 and HM.06 above are the summary of it.


[^1]: see [[generation-config]] and [[popularity-thresholds|popularityThresholds]] 


[^2]: see [[rare-dropped]] I'm a bit lost here, leak/total?


[^3]: Is it a good solution?

[^4]: #note A limitation revealed. Transpositions could result in increasing depth budget limit and cause expansion previously stopped branches. That could result in skewed order. But this is out of the scope of these docs. So we still want cards to go as much in order (popular White moves first) as possible, but. I'll have to invent sorting later (out of the scope for now) for the actual UI cards so they appear consecutively. 

