---

tags:

- in-progress

---

# EW — Engine Waterfall

EW receives a position after White's move (Black to play), evaluates candidate Black responses using a 3-tier engine waterfall, and selects Black's single repertoire move.

EW.01 **Receive Position**: Accept the position FEN after White's move from [[HM|HM.06]].

EW.02 **Fetch Black Candidate Moves**: Look up the cache (should match ==engine cache profile[^7]==), if empty (never fetched) `-->` query the Explorer dataset for Black response moves at this position using Masters and Elite filters (`explorerEliteSpeeds`, `explorerEliteRatings`).

EW.03 **Filter Candidate Moves**:

* Calculate weighted game count for each candidate Black move:

$$\text{weightedGames} = (\text{mastersGames} \times \text{mastersWeight}) + \text{eliteGames}$$
(see [[generation-config]] for mastersWeight)

* Keep Black moves meeting `minimumWeightedGames`[^2] threshold.

* **Fallback when no moves qualify**: If no candidate move passes `minimumWeightedGames`, skip human candidate filtering and fall back directly to top engine recommendation for Black (Lichess `-->` ChessDB `-->` local Stockfish).

---
EW.04 Calculate Score for the candidate Black moves. 

==Black score = (weighted Black wins + 0.5 × weighted draws + 50 × 0.48) / (weighted games + 50).[^8]==

50 here is [[anchor-games|anchorGames]].
And 48% is [[repertoire-side-prior|repertoireSidePrior]]. 

EW.05 Sort in descending order (top score at the top). ==Ties are resolved in favour of more evidence (more total weighted games). If everything is identical, evaluate two moves with local Stockfish. Choose the higher cp move (better according to the engine). If engine eval is a tie, use alphabetical order for the san/uci.==

EW.06 Take the first move in the list (top score) and pass it to the engine waterfall.


EW.07 **Tier 1 — Lichess Cloud Eval API**:
* ==Query the Lichess Cloud Eval API[^4] (`lichessCloudEvalMultiPv`[^2]) for the position FEN.[^9]==
* If Lichess responds with valid/legitimate 'no evals found' `-->` jump to EW.08.
* If valid evaluations exist for the baseline and candidate moves within configured CP tolerances (`apiToleranceCp`[^2]), cache results and jump to EW.10.
* If the candidate move is not in the Lichess response, but the lowest eval of Lichess moves is already ==pass[^10]== the `apiToleranceCp` `-->` reject the move and go to the next candidate move. 
* Otherwise, proceed to **EW.08**.

EW.08 **Tier 2 — ChessDB API**:
* ==For candidate moves missing from Tier 1, query the ChessDB API.[^5][^11]==
* If ChessDB responds with valid/legitimate 'no evals found' `-->` jump to EW.09.
* If valid evaluations are returned, cache results and jump to **EW.10**.
* If the candidate move is not in the ChessDB response, but the lowest eval of ChessDB moves is already pass the `apiToleranceCp` `-->` reject the move and go to the next candidate move. 
* ==If the candidate move has eval >= 1000 cp `-->` reject.==[^13] 
* Otherwise, proceed to **EW.09**.

EW.09 **Tier 3 — Local Deep Stockfish**:
* Run local Stockfish (`localStockfishDepth`[^2], `localStockfishMultiPv`[^2]) for the baseline move and the current unevaluated move.
* ==Store both evaluation results in the local `EngineCache` table with its corresponding local engine cache profile.==

EW.10 **Move Selection (CP Loss Verification)**:
* Calculate Centipawn Loss for each candidate relative to the best baseline evaluation:
  $$\text{cpLoss} = \text{candidateEval} - \text{bestEval}$$
* Keep candidates passing the CP loss tolerance for their move-number band (`apiToleranceCp` or `localToleranceCp`).
* For each engine compare the candidate evaluation to the current engine baseline.
* Select Black's single repertoire move (best score for Black within tolerance). 
* If non of the human candidate moves survives the waterfall --> choose the top Engine move --> Lichess. If Lichess is empty --> top ChessDB move. If ChessDB response empty --> top local Stockfish move. 
* If a move was chosen by API engine, run a double check with local Stockfish:
1. A: the cp loss between local Stockfish baseline and chosen move (by API engine) is within localToleranceCp. --> record Stockfish evals to cache and continue. 
2. A chosen response is not in Stockfish baseline-chosenResponse tolerance for cp loss: log `[WARNING] Stockfish vetoed the API engine chosen move. Log chosenResponse, selectionMethod, moverOrigin, engineRank, evals and baselines for both API engine that chose the move and Stockfish that vetoed it.` In other words log all meta data that is available for debugging `-->` hard stop.    
3. B: API chose a move that has cp value, but Stockfish found mate: stop generation: prompt the user "Stockfish found a mate -- user intervention required. PGN:... Lichess/ChessDB move, Stockfish move ... mate in #." The user has to choose engine response or Stockfish response. Or hard error? #question
4. Same as B, but API the number of moves to mate by API is bigger than what Stockfish found (e.g. Stockfish shows mate in 4 moves and API returned mate in 5): : stop generation: prompt the user "Stockfish found a mate -- user intervention required. PGN:... `source` (Lichess/ChessDB)  `chosenResponse`, `selectionMethod`, `moveOrigin`, `engineRank`. Stockfish move ... mate in #." The user has to choose engine response or Stockfish response. Or hard error? 
// The goal is to double check API response with local Stockfish -- for missed mates. //

   

EW.11 **Return Position**:
* Apply Black's selected repertoire move to the position, producing a new position (White to move). Cache its eval and eval source. If no eval exists for a Black response `-->` ==hard error.==  
* ==If this position is already past its [[generation-config|depth budget]] -- stop -- do not continue expansion. Log this reason to stop.[^14]== 
*  If the position is game-over (checkmate/stalemate/draw), don't generate anything further for it — skip to the next queue item. Log this game game-over state.
* ==Hand the resulting position to RE.[^12]== 


EW.12 Push the new child nodes onto the generator work queue (`S3`) and return to [[S3|S3.01]]. 
==hand the resulting position to RE==
==The children are pushed in order in which the resulting generation will produce nodes in descending popularity order. Why this matters? When I read the log, I want white responses not to be random, but go from most popular moves to less popular.== 

[^2]: see [[generation-config]]


[^4]:  **HTTP 429 (Rate-Limited)**: Pause all requests for `lichessRateLimitRetryDelayMs`[^2], then retry the request `lichessMaxRetries`[^2]. If 429 (or other error) again after lichessMaxRetries turn-off Lichess Cloud Eval API for the rest of the run.  

[^5]: What are the existing ChessDB API call rules? #question

[^7]: Should define exact default settings for engines. Or actually we should check cache profile (e.g. speeds=Classical/Rapid, rating=2500, and masters -- masters are always masters) for fetching Black responses, isn't it? We don't need engine for this step, I reckon. 

[^8]: Use the same formula format for formula.

[^9]: Add look up in cache with cache-profile match. 

[^10]: Check grammar

[^11]: Same -- we should check cache, perhaps check cache. 

[^12]: This looks wrong to me. We need to push the resulting position (after Black response) into the main queue (for fetching following White moves) and take the next item for choosing a Black response for. 

[^13]: ChessDB has no way of reliably reporting a mate -- it arrives as a very large ordinary `cp`. // ==I hope I get the value of 1000 cp right -- it's 10.00 or approx. one Queen and two pawns -- ten points of material.== 

[^14]: Remove this bullet?
