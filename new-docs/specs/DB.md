---
tags:
  - processed
---
# DB — What We Store

DB describes everything a run writes down: the two record types the tree is made of and which data is cached. The other specs say *when* something is written. DB says *what the record contains*.
Each run wipes the tree. What came from an API or from Stockfish is saved.


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
* `rareDropped` — for a node whose move was too rare, the probability that arrives and stops here. `cumProb` is held at 0 for such a node ([[HM|HM.04]], [[HM.excalidraw|HM.23]]).
* `unaccountedDropped` — the share of probability lost because Lichess Explorer's move counts do not add up to the position's total games (e.g. moves 2 + 2 + 1, total 6: 1/6 is lost). Treated like `rareDropped`, but kept apart so Lichess gaps can be told from our own filtering. Stored on this node, since the missing games have no move and so no child node ([[EX|EX.05]]).
* The root's is 100% ([[root-probability]], [[S2|S2.06]]).

DB.05 **Transposition marker.** `transposesTo` — set on a node that arrives at a position an earlier route already owns; it points at that owner. The owner keeps `transposesTo = null` however many routes reach it. See [[TR.excalidraw|TR]].

DB.06 **Opening metadata.** Each node holds `eco`, `openingName`, and a status: `PRESENT` or `VALID_ABSENCE`. A node is one route ending in one ply (DB.01), so this is the name after that ply, on that route.
1. Explorer returns an opening for the position this node reaches `-->` use it, `PRESENT`. Every Explorer response carries one.
2. It returns none `-->` copy `eco`, `openingName` and status from the parent node.
3. The root, with no name from Explorer `-->` `VALID_ABSENCE`.
4. The position this node reaches was never sent to Explorer `-->` fetch it for the name only (Amateur), then apply rule 1. Every position with Black to move is fetched this way, since [[EW]] does not ask Explorer. So is the position at the end of a route, after Black's last move.

A node never changes the node above it. Walking a route, the name changes only where Explorer names the new position. In the UI, stepping back and forth through the moves shows each node's own name. `VALID_ABSENCE` shows nothing.

By the end of a run every node carries a status. A missing status, or a half-filled pair, is an error. Stored per route ([[DB|DB.33]]).

DB.07 **Wikibooks text.** `wikiText`, plus a flag recording that the lookup happened, so "looked up, nothing there" is told apart from "never looked up". #deferred

DB.16 **Ordering.** `siblingIndex` — where this node sits among its siblings, most popular first ([[HM|HM.05]]). Every returned White move is numbered, dropped moves included. A stored display order, not the order the queue is walked in ([[S3|S3.09]]).

### What a move holds

DB.08 **Common to every move.** The node it leaves, the node it reaches, `san`, `uci`, and which side played it: `OPPONENT` (White) or `RESPONSE` (Black).

DB.09 **One Black move per position.** A position where Black is to move carries exactly one `RESPONSE`, unless the node is an ending. A position that has one is a future learning card.

DB.10 **White move fields.**
* `moveProb` — the [[move-probability|move probability]].
* The eval (DB.11).

DB.11 **Every move on a card carries an eval: the eval of the position the move reaches**, as on Lichess. That is every Black move, and every White move Black replies to. Exactly one of `cp` or `mate` — never both, never neither — and its `source`, `Local Stockfish 19`. A move that should have one and does not is a hard error ([[OV|OV.20]]).

What is measured:
* One search of the position the move reaches, on its own, under the generator's profile (DB.32). The score is the deepest completed depth's ([[EW|EW.09]]).
* White move: the position after it, Black to move. This is the search [[EW|EW.09]] runs to pick Black's reply, so it costs nothing extra ([[HM|HM.09]]).
* Black move: the position after it, White to move. A search of its own ([[EW|EW.11]]). The same for a hardcoded move.
* Alongside the eval, its `depth`: the deepest completed depth of that search (DB.32). It shows how deep the eval looked, so the UI can compare it with Lichess's depth.

What it means:
* One figure: Stockfish's estimate of that position with best play from there on, in White's point of view (DB.15). It says who is better and by how much.
* Two figures in a row: the change is what the move cost. After Stockfish's own top move the two should match in principle. They differ a little only because each position is searched on its own; that is search noise, not information. A large swing after a White move means White's move was a mistake. After a hardcoded Black move, the swing is what that choice costs.

Exceptions:
* A Black move that ends the game by checkmate or stalemate leaves nothing to search. Checkmate: `mate = -1`, the figure EW.09's search gives the mating move. Stalemate: `cp = 0`. Neither has a `depth`.
* A White move that ends the route — `Too rare`, `Game over`, `Repetition`, `Transposition` (DB.20): no eval. Black does not reply to it, so it is on no card.[^7]

DB.12 **Mate is never zero.** `mate = 0` is invalid: there is always at least one move left in which to deliver the mate. A negative `mate` means Black mates, a positive one means White does.

DB.14 **Black move fields — the engine evidence.** The eval (DB.11), and alongside it:
* `selectionMethod` — which path through [[EW]] produced it: Stockfish's baseline ([[EW|EW.09]]) or a hardcoded response ([[EW|EW.13]]).
* `moveOrigin` — `Engine Move` or `Hardcoded Move`.
* `engineRank` — `1` if the move is Stockfish's baseline, otherwise `null`.[^4]

DB.15 **`cp` is always from White's point of view.**[^5] A negative `cp` is good for Black. Stockfish's figures are converted to this convention *before* they are stored.[^6]

## How a route ends

DB.20 **A move that ends a route carries a `stopReason`.** The root is the only ending without one, since no move reaches it ([[S3|S3.14]]).
* On a White move: `Too rare`, `Game over`, `Repetition` ([[HM.excalidraw|HM]]); `Transposition` ([[TR.excalidraw|TR]]).
* On a Black move: `Game over on Black's move`, `Depth cap reached on Black's move` ([[RE.excalidraw|RE]]); `No opponent moves found` ([[EX|EX.06]]).
* A too-rare move reopened by a sweep loses its `stopReason` ([[DRS|DRS.04]]). The route gets a new one when it stops again. 

## The caches

DB.30 **Caches survive the wipe.** The tree is rebuilt from scratch on every run; the downloaded data behind it is not fetched again. This is what makes wipe-and-rebuild cheap enough to be the only strategy ([[S2|S2.04]]).

DB.31 **Explorer data** — one row per position, per [[cache-profile|cache profile]]. Only the Amateur dataset is fetched ([[EX]]). The dataset is part of the profile, so the key is `positionKey` + profile and nothing else ([[EX|EX.01]]). A position that was fetched and genuinely has no games is stored as an empty result, so it is never asked for twice ([[EX|EX.01]], State B). Each row also holds the `eco` and `openingName` Explorer returned with it.

DB.32 **Engine evaluations** — held in `EngineCache`, stored against the local Stockfish profile and against the exact `fullFen`, not against `positionKey`. Only local Stockfish 19 writes it. The profile is `localStockfishVersion`, `localStockfishNodes`, `localStockfishThreads`, `localStockfishHashMb` and `localStockfishMultiPv` ([[generation-config]]). A change to any of them makes a new profile, so an eval from another version or setting is never reused.
* Each eval also stores `depth`: the deepest depth its search completed before the node limit stopped it ([[EW|EW.09]]). The unfinished depth never counts.
* Evals cached before this (2026-10-24) have no depth, and nothing searches them again until the profile changes. Their depth reads back as unknown (`null`), and so does that of the moves that use them.
* #question Where the UI shows the depth: next to the eval (e.g. `+0.15 · d35`), or only on hover.

DB.33 **Opening metadata** — the result of [[DB|DB.06]], stored per route: repertoire + `history`. A rebuilt tree gets its names back without asking Explorer again.

DB.34 **Wikibooks text** — stored per route. #deferred

DB.35 A cached answer is trusted for ever, and only a changed [[cache-profile|cache profile]] forces a new fetch.

DB.36 **The `Position` table is not a cache.** It maps `positionKey` to the node that owns that position, and it is what [[TR.excalidraw|TR.03]] asks and [[TR.excalidraw|TR.06]] writes. It is built from nodes, so it dies with them on every wipe.



[^1]: The en passant square is part of `positionKey` only when an en passant capture is actually available. Otherwise two positions that play identically would be treated as different e.g. a FEN records an en passant square after _any_ two-square pawn move, even when no enemy pawn is in place to take. After `1.e4` the FEN says `e3`, though nothing can capture there. If the key kept that square, the position after `1.e4` would never match the same position reached by `1.e3` and then `2.e4` — identical to play, different key, transposition missed. The opposite case is why we can't just always drop it: when a pawn _can_ take en passant, the two positions genuinely differ, and the square has to stay.

[^2]: `fullFen` is stored and used for API requests, local engine and UI. A node with the same key but different clocks is a separate node.

[^3]: see glossary [[cumulative-probability|cumProb]]

[^4]: Local Stockfish runs with `localStockfishMultiPv = 1`, so it only knows its top move. A hardcoded move that differs from the baseline gets `null`.

[^5]: see [[centipawn]]

[^6]: Stockfish reports from the side to move. A position with Black to move (after White's move) has its figures flipped on the way in. One with White to move (after Black's move) is stored as reported.

[^7]: A transposition gets no Black reply and no card here; the line carries on at the owner ([[TR.excalidraw|TR]]).
