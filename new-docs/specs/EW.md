---
tags:
  - "#processed"
---
# EW — Engine Waterfall

EW receives a position after White's move (Black to play), evaluates candidate Black responses using a 3-tier engine waterfall, and selects Black's single repertoire move.

EW.01 **Receive Position**: Accept the position FEN after White's move from [[HM|HM.07]]. Go to EW.13.

EW.13 **Hardcoded response?** Does the route so far match a line in `hardcodedBlackResponses`[^1], up to and including White's last move?
* yes `-->` take Black's move from that line. No Explorer, no filtering, no scoring, no candidate loop. Record `selectionMethod = Hardcoded`, `moveOrigin = Hardcoded Move` ([[DB|DB.14]]).  Evaluate it for the record only (because every node keeps an eval). Take the first eval found: Lichess, then ChessDB, then local Stockfish. Store it. Local Stockfish still evaluates the baseline move and the hardcoded move, and caches both. It never rejects the move, but it sets `deepVerified = true` ([[DB|DB.14]], [[S3|S3.12]]). Go to EW.12.
* no `-->` go to EW.02.

The match is on the route (the moves played), not the position. A different route that transposes into the same position does not get the hardcoded move.




EW.02 **Fetch Black Candidate Moves**: Look up the cache [[EX]].

EW.03 **Filter Candidate Moves**:

* Calculate weighted game count for each candidate Black move:

$$\text{weightedGames} = (\text{mastersGames} \times \text{mastersWeight}) + \text{eliteGames}$$
(see [[generation-config]] for mastersWeight)

* Keep Black moves meeting `minimumWeightedGames`[^1] threshold.

* **Fallback when no moves qualify**: If no candidate move passes `minimumWeightedGames`, skip human candidate filtering and fall back directly to top engine recommendation for Black (Lichess `-->` ChessDB `-->` local Stockfish). Record `moveOrigin = Engine Move`.

---
EW.04 Calculate Score for the candidate Black moves.

$$\text{blackScore} = \frac{\text{weightedWins} + 0.5 \times \text{weightedDraws} + (\text{anchorGames} \times \text{repertoireSidePrior})}{\text{weightedGames} + \text{anchorGames}}$$

`anchorGames` is 50 and `repertoireSidePrior` is 48%; both are in [[generation-config]]. See [[anchor-games|anchorGames]] and [[repertoire-side-prior|repertoireSidePrior]].

EW.05 Sort in descending order (top score at the top). Ties are resolved in favour of more evidence (more total weighted games). If everything is identical, evaluate all tied moves with local Stockfish. Choose the higher cp move (better according to the engine). If engine eval is a tie, use alphabetical order for the san/uci.

EW.06 Take the first move in the list (top score) and pass it to the engine waterfall. EW.07 to EW.09 run for one candidate at a time. A rejected candidate sends us back here for the next one down the list; running out of candidates is the fallback in EW.10.

EW.07 **Tier 1 — Lichess Cloud Eval API**:
* Check `EngineCache` first, for this `fullFen` under the Lichess cache profile ([[DB|DB.32]]). A hit is used as-is; only a miss is fetched.
* If Cloud Eval is off for this run ([[AR|AR.13]]) `-->` jump to EW.08.
* Query the Lichess Cloud Eval API for the position FEN, with `lichessCloudEvalMultiPv`[^1]. Request rules: [[AR]]. On give-up ([[AR|AR.11]]) `-->` jump to EW.08.
* If Lichess responds with valid/legitimate 'no evals found' `-->` jump to EW.08.
* If valid evaluations exist for the baseline and candidate moves within configured CP tolerances (`apiToleranceCp`[^1], for this move-number band), cache results and jump to EW.10.
* If the candidate move is absent from the Lichess response, it is worse than every move Lichess did return. So if even the weakest returned move already fails `apiToleranceCp`, the candidate cannot pass either `-->` reject it and go back to EW.06 for the next candidate.[^3]
* Otherwise, proceed to **EW.08**.

EW.08 **Tier 2 — ChessDB API**:
* Check `EngineCache` first, for this `fullFen` under the ChessDB cache profile. For candidate moves missing from Tier 1, query the ChessDB API.
* ChessDB requests follow [[AR]]. If ChessDB is off for this run ([[AR|AR.13]]), or gives up ([[AR|AR.11]]) `-->` jump to EW.09.
* If ChessDB responds with valid/legitimate 'no evals found' `-->` jump to EW.09.
* If valid evaluations are returned, cache results and jump to **EW.10**.
* Same rule as Tier 1: if the candidate is absent and the weakest returned move already fails `apiToleranceCp` `-->` reject it and go back to EW.06.
* If any move in the ChessDB answer is `>= chessDbMaxAbsCp`[^1] or `<= -chessDbMaxAbsCp` `-->` ChessDB may be hiding a mate. Skip ChessDB for this position and go to **EW.09**. The answer is still cached as received.[^4]
* Otherwise, proceed to **EW.09**.

EW.09 **Tier 3 — Local Deep Stockfish**:
* Run local Stockfish (`localStockfishDepth`[^1], `localStockfishMultiPv`[^1]) for the baseline move and the current unevaluated move.
* Store both evaluation results in the local `EngineCache` table with its corresponding local engine cache profile.

EW.10 **Move Selection (CP Loss Verification)**:
* Calculate the candidate's centipawn loss against the best baseline evaluation: $$\text{cpLoss} = \text{candidateEval} - \text{bestEval}$$
* If it is within tolerance for its move-number band (`apiToleranceCp` or `localToleranceCp`), select it as Black's repertoire move and stop. Lower candidates are not evaluated.
* If not, reject it and go back to EW.06 for the next candidate.
* If no candidate passes, take the top engine move instead: Lichess, then ChessDB, then local Stockfish. Record `moveOrigin = Engine Move`. This is the same fallback as EW.03's, reached by a different route.
* Record on the chosen move ([[DB|DB.14]]): its `cp` or `mate`, the `source` of that eval, `selectionMethod`, `moveOrigin` and `engineRank`. The eval is the one from the engine that accepted the move, in White's point of view ([[DB|DB.15]]). This holds for every path: the waterfall, the engine fallback, and a hardcoded response ([[EW|EW.13]]).
* Local Stockfish, where a mate is involved: accept the candidate only if it has the same mate distance as Stockfish's baseline. Otherwise reject it and go back to EW.06.

EW.11 **Deep verification**: a move chosen by either API is always checked against local Stockfish before it is kept. 

Set `deepVerified` on success ([[DB|DB.14]], [[S3|S3.12]]).

| Case                                                                                                                                   | What happens                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EW.11a The API returned a `cp`, Stockfish's baseline is a `cp`, and the chosen move's cp loss against it is within `localToleranceCp`. | Accept. Record the Stockfish evals to cache, set `deepVerified = true`, continue. The move keeps the API's `cp`/`mate` and `source`. Stockfish's eval is cached, not written on the move.          |
| EW.11b As EW.11a, but outside `localToleranceCp`.                                                                                      | Log `"[WARNING] Stockfish vetoed the API engine chosen move."` with `chosenResponse`, `selectionMethod`, `moveOrigin`, `engineRank`, and the eval and baseline from both engines `-->` hard error. |
| EW.11c The API returned a `cp`, Stockfish's baseline is a mate.                                                                        | Hard error. Log everything EW.11b logs, plus the mate distance.                                                                                                                                    |
| EW.11d The API returned a mate, Stockfish's baseline mate is shorter (Stockfish mate in 4, API mate in 5).                             | Hard error, same log as EW.11c.                                                                                                                                                                    |
| EW.11e The API returned a mate, Stockfish's baseline is a `cp`.                                                                        | Hard error, same log as EW.11c.                                                                                                                                                                    |
| EW.11f The API returned a mate, Stockfish's baseline mate is longer.                                                                   | Hard error, same log as EW.11c.                                                                                                                                                                    |
| EW.11g The API returned a mate, Stockfish's baseline mate has the same distance.                                                       | Accept, as EW.11a.                                                                                                                                                                                 |

Stockfish's baseline is its best move in this position. Where a mate is possible, only mate distance counts: a move with a better score but a longer mate is not wanted.


EW.12 **Return**: the chosen move must carry exactly one of `cp` or `mate` ([[DB|DB.14]]). If it carries neither, hard error. Apply Black's move to the position, giving a new position with White to move, and create its node with `routeProb = parent.routeProb` and `cumProb = parent.cumProb`. Black plays one move, so everything that reaches the parent passes to this node. Hand that node to [[RE.excalidraw|RE]], which decides whether the route ends and, if not, pushes the node onto the [[S3]] queue ([[RE.excalidraw|RE.09]]).






[^1]: see [[generation-config]]

[^2]: **HTTP 429 (Rate-Limited)**: Pause all requests for `apiRetryDelayMs`, then retry the request `lichessMaxRetries`. If 429 (or other error) again after lichessMaxRetries turn-off Lichess Cloud Eval API for the rest of the run. 

[^3]: The test is: does the weakest move Lichess returned already fail tolerance?

[^4]: ChessDB cannot report a mate, so large scores in either direction are not trusted.

[^5]: Hard error is a deliberate design choice.




