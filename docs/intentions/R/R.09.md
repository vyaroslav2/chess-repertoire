---
tags:
  - processed
---
### R.09 — Make sure the starting position is cached

**What the code does**
The launcher makes sure the opening position has a row in the position cache — the shared store where every position's human statistics, engine scores, opening name and Wikibooks text hang off one entry.

It calls the shared step drawn in [[PC]], but hands it only the position. No opening details and no move history are passed.

Because no move history is passed, the Wikibooks step is skipped entirely: the row is created with no opening name, no code and no text. And because no opening details are passed either, nothing can fill those in on a later visit — the update path in PC only runs when opening details are supplied.

**Why this matters**
This exists so the root node has something to point at. Every node's position must have a cache row behind it, so the chain has to be started before the root node is created in [[R.10]].

The row is created bare and stays bare. Nothing else in the project ever visits the starting position with opening details in hand, so it will never acquire a name, a code or a text. In practice this matters little — the opening position has no opening name worth having — but it's worth knowing that the emptiness is permanent rather than temporary.

Like [[R.07]] and [[R.08]], this runs meaningfully once, on the first run against an empty database, and finds the same row every time after.

**Why it may have been designed this way**
Known: the call deliberately passes nothing beyond the position. Everywhere else in the generator this step is given a move history, and often opening details too — so the omission here reads as intentional, because the opening position genuinely has neither.

**Also affects:** [[A1.08]] (the same step drawn in A1), [[PC]] (the shared step this calls), [[R.10]] (the root node that depends on this row existing)

Notes:

[^1]: #note The row for the opening position is created empty and can never be filled in later: no opening name, no code, no Wikibooks text. Harmless here, but the same behaviour is a real problem for ordinary positions — see the notes on [[PC]], where a position that misses its one chance at a name keeps none for ever.