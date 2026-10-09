---
tags:
  - "#processed"
  - sf19-todo
---
# DB — What We Store

DB describes everything a run writes down: the two record types the tree is made of and which data is cached. The other specs say *when* something is written. DB says *what the record contains*.
Each run wipes the tree. What came from an API is saved.


## Records

DB.01 **Two record types build the tree.**
A [[node]] is one route from the root to a position — the route is what makes it unique, not the board.
A move is the step from one node to the next.
Everything else is cached.

DB.02 **Nodes and moves are wiped and rebuilt on every run** ([[S2|S2.04]]). The caches are not (DB.30). The `Position` table is wiped with them (DB.36).

### What a node holds

DB.03 **Identity.**
* `positionKey` — the position with the clocks dropped ([[normalised-fen]], [[position-key]]). Two routes reaching the same `positionKey` are the same position.[^1] This is what [[TR.excalidraw|TR]] matches on.
* `fullFen` — the exact position, clocks included.[^2]
* `history` — the route that reached this node, in UCI.
* `displayPgn` — the same route in SAN, for reading and for the cards.

DB.04 **Probability.** Every node carries both.
* `routeProb` — what arrives down this one route ([[route-probability]]).
* `cumProb`[^3] — what arrives by every route. At the start of a run the two are equal; a cascade raises `cumProb` only ([[TR.excalidraw|TR]]).
* `rareDropped` — for a node whose move was filtered out, the probability that arrives and stops here. `cumProb` is held at 0 for such a node ([[HM|HM.04]], [[HM.excalidraw|HM.23]]).
* `unaccountedDropped` — the share of probability lost because Lichess Explorer's move counts do not add up to the position's total games (e.g. moves 2 + 2 + 1, total 6: 1/6 is lost). Treated like `rareDropped`, but kept apart so Lichess gaps can be told from our own filtering. Stored on this node, since the missing games have no move and so no child node ([[EX|EX.05]]).
* The root's is 100% ([[root-probability]], [[S2|S2.06]]).

DB.05 **Transposition marker.** `transposesTo` — set on a node that arrives at a position an earlier route already owns; it points at that owner. The owner keeps `transposesTo = null` however many routes reach it. See [[TR.excalidraw|TR]].

DB.06 **Opening metadata.** Each node holds `eco`, `openingName`, and a status: `PRESENT` or `VALID_ABSENCE`. A node is one route ending in one ply (DB.01), so this is the name after that ply, on that route.
1. Explorer returns an opening for the position this node reaches `-->` use it, `PRESENT`. Every Explorer response carries one, whatever the dataset. If more than one was fetched, take Masters, then Elite, then Amateur.
2. It returns none `-->` copy `eco`, `openingName` and status from the parent node.
3. The root, with no name from Explorer `-->` `VALID_ABSENCE`.
4. The position this node reaches was never sent to Explorer (the route ends after Black's move, or Black's reply was hardcoded) `-->` fetch it for the name only (Masters), then apply rule 1.

A node never changes the node above it. Walking a route, the name changes only where Explorer names the new position. In the UI, stepping back and forth through the moves shows each node's own name. `VALID_ABSENCE` shows nothing.

By the end of a run every node carries a status. A missing status, or a half-filled pair, is an error. Stored per route ([[DB|DB.33]]).

DB.07 **Wikibooks text.** `wikiText`, plus a flag recording that the lookup happened, so "looked up, nothing there" is told apart from "never looked up". #deferred

DB.16 **Ordering.** `siblingIndex` — where this node sits among its siblings, most popular first ([[HM|HM.05]]). Every returned White move is numbered, dropped moves included. A stored display order, not the order the queue is walked in ([[S3|S3.09]]).

### What a move holds

DB.08 **Common to every move.** The node it leaves, the node it reaches, `san`, `uci`, and which side played it: `OPPONENT` (White) or `RESPONSE` (Black).

DB.09 **One Black move per position.** A position where Black is to move carries exactly one `RESPONSE`, unless the node is an ending. A position that has one is a future learning card.

DB.10 **White move fields.**
* `moveProb` — the [[move-probability|move probability]].

DB.12 **Mate is never zero.** `mate = 0` is invalid: there is always at least one move left in which to deliver the mate. A negative `mate` means Black mates, a positive one means White does.

DB.13 **Black move fields — the human evidence.** `mastersGames`,[^4] `eliteGames`,[^5] `weightedGames` (see formula [[EW|EW.04]]), `totalMastersGames`[^6], `mastersMoveShare`[^7], `totalEliteGames`[^8], `eliteMoveShare`.[^9] `weightedGames` is used for the score in [[EW|EW.04]].

DB.14 **Black move fields — the engine evidence.** Exactly one of `cp` or `mate` — never both, never neither. Alongside it:
* `source` — `Lichess Cloud Evaluation`, `ChessDB` or `Local Deep Stockfish`.
* `selectionMethod` — which path through [[EW]] produced it: the ordinary waterfall, no candidate has enough games, the engine fallback after no human candidate survived, or a hardcoded response. A hardcoded response is taken in [[EW|EW.13]].
* `moveOrigin` — `Human Move`, `Engine Move` or `Hardcoded Move`.
* `engineRank` — where the move sat in that engine's list.[^10]
* `deepVerified` — the chosen response was verified by the final local Stockfish ([[EW|EW.11]]). Checked for every Black response at the end of a run; a single `false` is a hard error ([[S3|S3.12]]).

DB.15 **`cp` is always from White's point of view.**[^11] A negative `cp` is good for Black. Every source is converted to this convention *before* it is stored, so a stored figure never needs to know which engine produced it.[^12]

## How a route ends

DB.20 **A move that ends a route carries a `stopReason`.** The root is the only ending without one, since no move reaches it ([[S3|S3.14]]).
* On a White move: `Too rare`, `Game over`, `Repetition` ([[HM.excalidraw|HM]]); `Transposition` ([[TR.excalidraw|TR]]).
* On a Black move: `Game over on Black's move`, `Depth budget reached on Black's move` ([[RE.excalidraw|RE]]); `No opponent moves found` ([[EX|EX.06]]).
* A route reopened by a sweep loses its `stopReason` ([[DRS|DRS.04]]). It gets a new one when it stops again. 

## The caches

DB.30 **Caches survive the wipe.** The tree is rebuilt from scratch on every run; the downloaded data behind it is not fetched again. This is what makes wipe-and-rebuild cheap enough to be the only strategy ([[S2|S2.04]]).

DB.31 **Explorer data** — one row per position, per dataset (Masters, Elite, Amateur), per [[cache-profile|cache profile]]. The dataset is part of the profile, so the key is `positionKey` + profile and nothing else ([[EX|EX.01]]). A position that was fetched and genuinely has no games is stored as an empty result, so it is never asked for twice ([[EX|EX.01]], State B). Each row also holds the `eco` and `openingName` Explorer returned with it.

DB.32 **Engine evaluations** — held in `EngineCache`, stored against that engine's own profile and against the exact `fullFen`, not against `positionKey`. Lichess, ChessDB and local Stockfish each keep their own; they do not share.

DB.33 **Opening metadata** — the result of [[DB|DB.06]], stored per route: repertoire + `history`. A rebuilt tree gets its names back without asking Explorer again.

DB.34 **Wikibooks text** — stored per route. #deferred

DB.35 A cached answer is trusted for ever, and only a changed [[cache-profile|cache profile]] forces a new fetch.

DB.36 **The `Position` table is not a cache.** It maps `positionKey` to the node that owns that position, and it is what [[TR.excalidraw|TR.03]] asks and [[TR.excalidraw|TR.06]] writes. It is built from nodes, so it dies with them on every wipe.



[^1]: The en passant square is part of `positionKey` only when an en passant capture is actually available. Otherwise two positions that play identically would be treated as different e.g. a FEN records an en passant square after _any_ two-square pawn move, even when no enemy pawn is in place to take. After `1.e4` the FEN says `e3`, though nothing can capture there. If the key kept that square, the position after `1.e4` would never match the same position reached by `1.e3` and then `2.e4` — identical to play, different key, transposition missed. The opposite case is why we can't just always drop it: when a pawn _can_ take en passant, the two positions genuinely differ, and the square has to stay.

[^2]: `fullFen` is stored and used for API requests, local engine and UI. A node with the same key but different clocks is a separate node.

[^3]: see glossary [[cumulative-probability|cumProb]]

[^4]: Games in the Masters dataset where this move was played.

[^5]: Games in the Elite dataset where this move was played.

[^6]: All games in the Masters dataset that reached this position.

[^7]: This move's share of Masters games: `mastersGames / totalMastersGames`.

[^8]: All games in the Elite dataset that reached this position.

[^9]: This move's share of Elite games: `eliteGames / totalEliteGames`.

[^10]: For Lichess and ChessDB, `engineRank` is the move's place in the list they returned, or `null` if it is not in the list. Local Stockfish runs with `localStockfishMultiPv = 1`, so it only knows its top move: `engineRank` is `1` if the move is the baseline move, otherwise `null`.

[^11]: see [[centipawn]]

[^12]: ChessDB reports from the side to move, so its figures are flipped on the way in. It has no way of reporting a mate at all, so a mate arrives as a very large ordinary `cp`.








