---
tags:
  - glossary
  - reviewed
aliases:
  - depthCap
  - depth cap
---
**`depthCap`** — the most full moves any route may run, counted from the root: 15. See [[generation-config]].

The limit counts Black's moves. With a limit of 15, the route ends straight after Black's 15th move.

Most routes end sooner, on a White move that is too rare ([[min-cum-prob|minCumProb]]). `depthCap` is a safety ceiling for the rest. Black's move is Stockfish's, not a human's, so the position after it can have very few games in Explorer. With so few games, one game can give a White move a 100% share, and the route's `cumProb` stops falling. Without a ceiling, such a line could run on through noise.

It also keeps a whole run short, for trial runs: set it to 2 or 3.
