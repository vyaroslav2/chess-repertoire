---
tags:
  - reviewed
---
# EW — Engine Response

EW receives a position after White's move (Black to play) and selects Black's single repertoire move: local Stockfish 19's top move, unless a hardcoded response applies. Human games play no part in Black's choice.

EW.01 **Receive Position**: Accept the position FEN after White's move from [[HM|HM.07]]. Go to EW.13.

EW.13 **Hardcoded response?** Does the route so far match a line in `hardcodedBlackResponses`[^1], up to and including White's last move?
* yes `-->` take Black's move from that line. Record `selectionMethod = Hardcoded`, `moveOrigin = Hardcoded Move` ([[DB|DB.14]]). Local Stockfish evaluates the baseline move and the hardcoded move, and caches both. The move keeps Stockfish's eval, because every node keeps an eval. Stockfish never rejects a hardcoded move. Go to EW.10.
* no `-->` go to EW.09.

The match is on the route (the moves played), not the position. A different route that transposes into the same position does not get the hardcoded move.

EW.09 **Local Stockfish**:
* Check `EngineCache` first, for this `fullFen` under the local Stockfish cache profile ([[DB|DB.32]]). A hit is used as-is; only a miss is run.
* Run local Stockfish 19 (`localStockfishDepth`[^1], `localStockfishMultiPv`[^1]) on the position. Its top move is the baseline.
* Store the result in the local `EngineCache` table with its corresponding local engine cache profile.
* The baseline is Black's repertoire move. Record `moveOrigin = Engine Move`.

EW.10 **Record**: on the chosen move ([[DB|DB.14]]), record its `cp` or `mate`, the `source` of that eval, `selectionMethod`, `moveOrigin` and `engineRank`. The eval is local Stockfish's, in White's point of view ([[DB|DB.15]]). This holds for both paths: the baseline and a hardcoded response (EW.13).

EW.12 **Return**: the chosen move must carry exactly one of `cp` or `mate` ([[DB|DB.14]]). If it carries neither, hard error. Apply Black's move to the position, giving a new position with White to move, and create its node with `routeProb = parent.routeProb` and `cumProb = parent.cumProb`. Black plays one move, so everything that reaches the parent passes to this node. Hand that node to [[RE.excalidraw|RE]], which decides whether the route ends and, if not, pushes the node onto the [[S3]] queue ([[RE.excalidraw|RE.09]]).






[^1]: see [[generation-config]]
