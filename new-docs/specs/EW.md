---
tags:
  - processed
---
# EW — Engine Response

EW receives a position after White's move (Black to play) and selects Black's single repertoire move: local Stockfish 19's top move, unless a hardcoded response applies. Human games play no part in Black's choice. Each card costs two searches: the position after White's move (EW.09) and the position after Black's (EW.11).

EW.01 **Receive Position**: Accept the position FEN after White's move from [[HM|HM.07]]. Go to EW.13.

EW.13 **Hardcoded response?** Does the route so far match a line in `hardcodedBlackResponses`[^1], up to and including White's last move?
* yes `-->` take Black's move from that line. Record `selectionMethod = Hardcoded`, `moveOrigin = Hardcoded Move` ([[DB|DB.14]]). EW.09 still runs: its search gives White's move its eval ([[HM|HM.09]]) and its top move sets `engineRank`. The hardcoded move is evaluated like any Black move (EW.11). Stockfish never rejects a hardcoded move. Go to EW.09.
* no `-->` go to EW.09.

The match is on the route (the moves played), not the position. A different route that transposes into the same position does not get the hardcoded move.

EW.09 **Local Stockfish**:
* Check `EngineCache` first, for this `fullFen` under the local Stockfish cache profile ([[DB|DB.32]]). A hit is used as-is; only a miss is run.
* Run local Stockfish 19 on the position: `localStockfishNodes`, `localStockfishThreads`, `localStockfishHashMb`, `localStockfishMultiPv`[^1]. No depth or time limit.
* The node limit nearly always stops the search part-way through a depth. That unfinished depth has looked at only some moves, and its scores are often only bounds. Ignore it, and ignore Stockfish's `bestmove`. Take the score and the top move of the deepest completed depth, so the move and its eval come from one complete search. HE uses the same rule ([[HE]]).
* Store the result in the local `EngineCache` table with its corresponding local engine cache profile.
* Its top move is the baseline. Its score is the eval of White's move ([[HM|HM.09]]).
* Unless EW.13 chose a hardcoded move, the baseline is Black's repertoire move. Record `moveOrigin = Engine Move`.
* Go to EW.11.

EW.11 **Evaluate Black's move**: apply it, and search the position it reaches, White to move, as in EW.09 (cache first, same profile, same rule for a stopped search). Its score is the eval of Black's move ([[DB|DB.11]]). The same for the baseline and a hardcoded move. A move that ends the game by checkmate or stalemate is not searched: checkmate `mate = -1`, from EW.09's search; stalemate `cp = 0`. Go to EW.10.

EW.10 **Record**: on the chosen move ([[DB|DB.14]]), record its `cp` or `mate` (EW.11), the `source` of that eval, `selectionMethod`, `moveOrigin` and `engineRank`. The eval is local Stockfish's, in White's point of view ([[DB|DB.15]]). This holds for both paths: the baseline and a hardcoded response (EW.13).

EW.12 **Return**: the chosen move must carry exactly one of `cp` or `mate` ([[DB|DB.11]]). If it carries neither, hard error. Apply Black's move to the position, giving a new position with White to move, and create its node with `routeProb = parent.routeProb` and `cumProb = parent.cumProb`. Black plays one move, so everything that reaches the parent passes to this node. Hand that node to [[RE.excalidraw|RE]], which decides whether the route ends and, if not, pushes the node onto the [[S3]] queue ([[RE.excalidraw|RE.09]]).






[^1]: see [[generation-config]]
