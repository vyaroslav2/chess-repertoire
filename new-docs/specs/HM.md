---
tags:
  - in-progress
---
# HM — Human Moves

HM fetches move candidate statistics for a position and creates child nodes for the search queue.

HM blocks live in two places. HM.01 to HM.06 are here: the position-level flow. HM.20 to HM.36 are in [[RE.excalidraw|RE]]: the per-move checks that follow, drawn rather than written. The bands never overlap, so any `HM.nn` points at exactly one block.

HM.01 Receive the target position from [[S3|S3.07]].

HM.02 Query the Explorer dataset (local cache or Lichess API) for all legal candidate moves played at this position ([[EX|EX.01]]). EX returns here, and HM carries on.

HM.03 Calculate move probabilities ([[move-probability|moveProb]]) for each move.

HM.04 Filter candidate moves by popularity:
* Keep White moves that meet the `popularityThresholds`[^1] percentage for their move-number band.
* Drop the rest — each dropped move still gets a node, whose `cumProb` is held at 0 and whose arriving probability accumulates in `rareDropped` instead ([[RE.excalidraw|HM.23]]).[^2]
* This "rare" is not the `rare` of `probabilityBands`.[^3]

HM.05 Assign an explicit `siblingIndex` (1, 2, 3...) to child nodes based on descending popularity, ensuring UI decks can sort cards reliably regardless of queue traversal order. UI cards are ordered from most popular White moves to least popular.[^4] Ties are resolved alphabetically by SAN.
#question `siblingIndex` is a stored display order, not the order moves are walked or pushed — see [[S3|S3.09]], which needs the reverse.

HM.06 For each kept move, generate a new child node:
* assign a position key (`normalisedFen`).
* Compute its route probability: `routeProb = parent.routeProb * moveProb`.
* **Transposition Check**: Is this `normalisedFen` already in the `Position` table?[^5]
* yes `-->` see transposition logic at diagrams/[[TR.excalidraw]].
* no `-->` set `transposesTo = null` (canonical).
* Only a move that survives every check in HM.07 reaches [[EW]].

HM.07 Each kept move is then checked one at a time. The order is fixed and all of it is in [[RE.excalidraw|RE]]: too rare (HM.21), record the move and create the node (HM.25), game over (HM.26), repetition (HM.30), transposition (HM.34), then ordinary expansion (HM.36). Only after all four checks pass does the position go to [[EW]] for Black's reply.

HM.08 #question What if no move survives HM.04? The position has no children and nothing was found wrong with it — it simply has no popular continuation. This is not written anywhere. [[EX|EX.06]] covers "Explorer returned no moves"; it does not cover "Explorer returned moves and we filtered all of them away".[^6]

[^1]: see [[generation-config]] and [[popularity-thresholds|popularityThresholds]]

[^2]: "Leak node" has no glossary note at all. #question

[^3]: #question Two different filters, both called rare, both in [[generation-config]]. `popularityThresholds` tests one move's `moveProb` against 5/10/15% and decides whether to keep the move at all. `probabilityBands` tests a position's `cumProb` against 2%/0.5% and decides how deep to search it. A move can be popular and land in the `rare` band, or unpopular in a `common` one. Worth renaming one of them.

[^4]: #note ==A limitation revealed. Transpositions could result in increasing depth budget limit and cause expansion of previously stopped routes. That could result in skewed order. But this is out of the scope of these docs. So we still want cards to go as much in order (popular White moves first) as possible. I'll have to invent sorting later (out of the scope for now) for the actual UI cards so they appear consecutively.==


[^5]: #question The same question is asked in three places: here, [[RE.excalidraw|HM.34]], and [[TR.excalidraw|TR.03]]. One of them should own it and the other two should point at it.

[^6]: #question Likely it should end the route with its own stop reason, the way [[EX|EX.06]] does. Note the probability is already accounted for either way, since every dropped move becomes a leak node holding its own `rareDropped`. So this is about the log and about [[S3|S3.14]] wanting a `stopReason` on every ending, not about the arithmetic.
