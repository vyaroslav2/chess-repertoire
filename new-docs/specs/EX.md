---
tags:
  - in-progress
---
# EX — Explorer Data Fetching & Caching

EX retrieves candidate move statistics for a given position, from local storage or the remote Lichess Explorer API.

==EX is called, not entered. [[HM|HM.02]] calls it for White's moves. Whatever EX returns goes back to its caller, which then carries on.==[^1]

EX.01 **Check Local Database Cache**: Look up the target `positionKey` (`normalisedFen`) + [[cache-profile|cache profile]] in the `PositionCache` table (for matching `explorerSpeeds`[^2] and `explorerRatings`[^2]).[^3]
* **State A: Cached with moves**: Return move statistics `-->` ==back to the caller ([[HM|HM.02]]).==
* **State B: Cached as empty**: Position was previously queried and confirmed to have 0 matching games on Lichess `-->` return empty set `-->` end the route, log the stop reason `"No opponent moves found."` `-->` proceed to [[S3|S3.01]].
* **State C: Never fetched**: No record exists for this configuration `-->` proceed to **EX.02**.

EX.02 **API Request Concurrency**: Ensure only one HTTP request to the Lichess Explorer API is in-flight at any time across the generator.[^4]

EX.03 **Execute API Request**: Send `GET` request to Lichess Explorer endpoint using the target position's full FEN along with configured `explorerSpeeds` and `explorerRatings`. We ask with `fullFen` but cache the answer against `positionKey`. That is deliberate, and it is the opposite of engine evaluations, which are cached against `fullFen` ([[DB|DB.32]]).

EX.04 **Handle Rate Limits & Errors**:
* **HTTP 429 (Rate-Limited)**: Pause all Explorer requests for `lichessRateLimitRetryDelayMs`[^2], then retry up to `lichessMaxRetries`[^2] times.
* **Second Failure / HTTP Error**: If the retry fails or any non-retryable HTTP error occurs, exit[^5]: the error unwinds and the run closes as `[FAILED]`, with the usual cleanup ([[S0|S0.05]], [[S0|S0.06]]).[^6]

EX.05 **Store & Return Result**:
* Write the response (or explicit 0-game empty status) into the local `PositionCache` table.[^7]
* `eco` and opening names arrive with the Explorer response. Not a separate pipeline.[^8]
* #note Wikibooks logic is preserved but the documentation for it is deferred. #deferred
* ==If the fetch White move data ran and the row still is not there afterwards is treated as a critical error and triggers an immediate clean hard-stop.==[^9]
* If returned move counts do not account for the position's total games `-->` log `"[WARNING] Explorer move counts do not add up to the position's total games. Missing: [n] games ([p]%)."` Treat the missing games count as `rareDropped`.[^10]

EX.06 White moves found?
* yes `-->` return the fetched move data to the caller ([[HM|HM.02]]).
* no `-->` treat it exactly as EX.01 State B: end the route, log the stop reason `"No opponent moves found."`, proceed to [[S3|S3.01]].

[^1]: EX had no statement of who calls it or what it hands back, which is what produced the wrong return targets below. #question

[^2]: see [[generation-config]]

[^3]: #question EX only ever describes the amateur profile (`explorerSpeeds`, `explorerRatings`). But [[EW|EW.02]] fetches Black's candidates from the same Explorer with Masters and Elite filters (`explorerEliteSpeeds`, `explorerEliteRatings`), and [[DB|DB.31]] says one row per dataset — Masters, Elite, Amateur. So either EX covers all three and should say so, or EW does its own fetching and EX's title is too broad. Right now the Masters and Elite fetch is documented nowhere. #question

[^4]: #question Does this cover the Lichess Cloud Eval API too ([[EW|EW.07]])? Same host, and presumably the same rate limit. As written, "the Lichess Explorer API" reads as Explorer only, which would let the two APIs collide.

[^5]: #note Exit, not stop, in the sense [[LF]] defines: cleanup happens first, then the run halts.

[^6]: The `[FAILED]` tag is not written here. [[S0|S0.05]] writes it, from the type of error that reaches the outermost catch. This block only has to throw. #question 

[^7]: Answers "what exactly do we write". Neither, as a category. We write the Explorer's answer for that position under that [[cache-profile|cache profile]], and the answer is a list of moves for whoever is to move. Side is a property of the position, not of the cache row. The row is keyed on `positionKey` + cache profile and nothing else. #question 

[^8]: #bug What is the bug here? Best guess: [[DB|DB.33]] stores opening metadata *per route*, but Explorer returns it *per position*. Those are different keys. Two routes reaching the same position get the same name from Explorer but need two stored rows, and [[DB|DB.06]]'s `VALID_ABSENCE` is inherited along a route, which a per-position store cannot express. Worth confirming that this is what the tag meant. #question

[^9]: Check grammar.

[^10]: #question Folding this into `rareDropped` makes the end-of-run sum ([[S3|S3.11]]) add up, but it hides the cause. [[rare-dropped]] means probability lost to the popularity filter — a decision we made. This is probability Lichess did not account for — something that happened to us. Same bucket, two very different meanings, and no way to tell them apart afterwards. A separate `unaccountedDropped`, summed into the same total, would balance and still be readable.






