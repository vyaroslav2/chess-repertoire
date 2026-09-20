---
tags:
  - in-progress
---
# DB — What We Store

DB describes everything a run writes down: the two record types the tree is made of and which data is cached. The other specs say *when* something is written. DB says *what the record contains*.
Each run wipes the tree. What came from an API is saved.


## Records

DB.01 **Two record types build the tree.** 
A [[node]] is a position on a route. 
A move is the step from one node to the next. 
Everything else is cached.

DB.02 **Nodes and moves are wiped and rebuilt on every run** ([[S2|S2.04]]). The caches are not (DB.30).

### What a node holds

DB.03 **Identity.**
* `positionKey` — the position with the clocks dropped ([[normalised-fen]], [[position-key]]). Two routes reaching the same `positionKey` are the same position.[^1] This is what [[TR.excalidraw|TR]] matches on.
* `fullFen` — the exact position, clocks included.[^2]
* `history` — the route that reached this node, in UCI.
* `displayPgn` — the same route in SAN, for reading and for the cards.

DB.04 **Probability.** `cumProb`[^3] and [[root-probability]]. 

DB.05 **Transposition marker.** `transposesTo` — not `null` when more than one route arrives at this node. A node reached by exactly one route is canonical (`transposesTo = null`). See [[TR.excalidraw|TR]].

DB.06 **Opening metadata.** `eco`, `openingName`, and a status of either `PRESENT` (ECO and name are both known) or `VALID_ABSENCE` (Lichess has no name for this route, and that is a settled answer, not a missing one). By the end of a run every node carries one of the two; a missing status, or a half-filled pair, is an error.[^4] The source is Lichess explorer ([[EX|EX.05]]).

DB.07 **Wikibooks text.** `wikiText`, plus a flag recording that the lookup happened, so "looked up, nothing there" is told apart from "never looked up". #deferred

### What a move holds

DB.08 **Common to every move.** The node it leaves, the node it reaches, `san`, `uci`, and which side played it: `OPPONENT` (White) or `RESPONSE` (Black).

DB.09 **One Black move per position.** A position where Black is to move carries exactly one `RESPONSE` (unless the node is an ending). Such a position where Black `RESPONSE` is present is a future learning card.

DB.10 **White move fields.**
* `moveProb` — the [[move-probability|move probability]].
* `routeProb` — the [[route-probability]]. 
* ==`engineRank` — where the move sat in that engine's list.==[^5]


DB.12 **Mate is never zero.** `mate = 0` is invalid: there is always at least one move left in which to deliver the mate. A negative `mate` means Black mates, a positive one means White does.

DB.13 **Black move fields — the human evidence.** `mastersGames`, `eliteGames`, `weightedCount`, `totalRelevantGames`, `moveShare`. These are the figures behind the score in [[EW|EW.04]].

DB.14 **Black move fields — the engine evidence.** Exactly one of `cp` or `mate` — never both, never neither. Alongside it:
* `source` — `Lichess Cloud Evaluation`, `ChessDB` or `Local Deep Stockfish`.
* `selectionMethod` — which path through [[EW]] produced it. The ordinary waterfall, the local-engine fallback after every human candidate was rejected, or the hardcoded opening[^10].— how the move was arrived at. The hardcoded Response skips EW and is defined in [[generation-config]] -- we ignore any logic and just choose a hardcoded response.  
* `moveOrigin` — `Human Move`, `Engine Move` or `Hardcoded Move`.
* `engineRank` — where the move sat in that engine's list.
* `deepVerified` -- the chosen response was verified by the final local Stockfish. Should be set to true after verification. At the end of a run we check `deepVerified` field for each Black response --> if `false` > 0 --> hard error. Every Black response should be verified by Stockfish. 

DB.15 **`cp` [^6]is always from White's point of view.** A negative `cp` is good for Black. Every source is converted to this convention *before* it is stored, so a stored figure never needs to know which engine produced it.[^7]

## How a route ends

DB.20 **A move that ends a route carries a `stopReason`.**

| `stopReason`          | Meaning                                                                       | Destination          |
| --------------------- | ----------------------------------------------------------------------------- | -------------------- |
| (none)                | An ordinary move.                                                             | The node it reaches. |
| `Transposition`       | The position was already reached by an earlier route, and that route owns it. | The owning node.     |
| `Repetition`[^8][^9] | The position repeats one already standing on this same route.                 | The node it reaches. |

## The caches

DB.30 **Caches survive the wipe.** The tree is rebuilt from scratch on every run; the downloaded data behind it is not fetched again. This is what makes wipe-and-rebuild cheap enough to be the only strategy ([[S2|S2.04]]).

DB.31 **Explorer data** — one row per position, per dataset (Masters, Elite, Amateur), per [[cache-profile|cache profile]]. A position that was fetched and genuinely has no games is stored as an empty result, so it is never asked for twice ([[EX|EX.01]], State B).

DB.32 **Engine evaluations** — stored against that engine's own profile and against the exact `fullFen`, not against `positionKey`. Lichess, ChessDB and local Stockfish each keep their own; they do not share.

DB.33 **Opening metadata** — stored per route, so a rebuilt tree gets its names back without asking Explorer again.

DB.34 **Wikibooks text** — stored per route. #deferred

DB.35 A cached answer is trusted for ever, and only a changed [[cache-profile|cache profile]] forces a new fetch. 





[^1]: The en passant square is part of `positionKey` only when an en passant capture is actually available. Otherwise two positions that play identically would be treated as different e.g. a FEN records an en passant square after _any_ two-square pawn move, even when no enemy pawn is in place to take. After `1.e4` the FEN says `e3`, though nothing can capture there. If the key kept that square, the position after `1.e4` would never match the same position reached by `1.e3` and then `2.e4` — identical to play, different key, transposition missed. The opposite case is why we can't just always drop it: when a pawn _can_ take en passant, the two positions genuinely differ, and the square has to stay.  

[^2]: `fullFen` is stored and used for API requests, local engine and UI. A node with the same key but different clocks is a separate node. 
 
[^3]: see glossary [[cumulative-probability|cumProb]]

[^4]: `VALID_ABSENCE` is inherited from the parent route when the parent has a name and Explorer offers none for the child — the opening has not changed, Explorer has simply stopped naming every branch.

[^5]: #roadmap I'd like an engine to evaluate White moves, out of the scope for now.  



[^6]: see [[centipawn]]

[^7]: ChessDB reports from the side to move, so its figures are flipped on the way in. It has no way of reporting a mate at all, so a mate arrives as a very large ordinary `cp`.  

[^8]: We're ignoring the threefold and fifty-move rules by design. `positionKey` drops the clocks, so the same position gets the same answer whether it's its first or third occurrence.
[^9]: see [[repetition]]

