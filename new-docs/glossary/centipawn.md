---
tags:
  - glossary
  - reviewed
aliases:
  - cp
  - centipawns
---
**Centipawn (`cp`)** — one hundredth of a pawn. It is the unit engines use to say who is better and by how much.

Since Stockfish 15.1, 100 cp no longer means "a pawn up". Stockfish scales its figures to its own results: at `+1.00`, White wins about half the time in Stockfish's own games, and draws most of the rest. Larger figures mean a surer win, not a count of material.

`cp` is always from White's point of view. A negative `cp` is good for Black.

**Stored** as a whole number of centipawns: `35`, `-120`, `1000`.

**Shown** in pawns, always with a sign and two decimals: `+0.00`, `+0.35`, `-1.20`, `+10.00` ([[UI|UI.26]]). This is the usual chess notation.

|Stored (`cp`)|Shown (pawns)|Meaning|
|---|---|---|
|`0`|`+0.00`|Equal|
|`35`|`+0.35`|White slightly better|
|`-120`|`-1.20`|Black clearly better: wins more than half the time|
|`300`|`+3.00`|White winning|
|`-1000`|`-10.00`|Black winning easily|

A mate is not a `cp`. It goes in `mate` instead ([[DB|DB.11]], [[DB|DB.12]]).

See [[eval]] for what the figure measures.

