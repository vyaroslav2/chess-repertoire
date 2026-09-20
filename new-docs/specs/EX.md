---
tags:
  - in-progress
---
# EX — Explorer Data Fetching & Caching

EX handles retrieving candidate move statistics for a given position from local storage or the remote Lichess Explorer API.

EX.01 **Check Local Database Cache**: Look up the target `positionKey` (`normalisedFen`) + [[cache-profile|cache profile]] in the `PositionCache` table (for matching `explorerSpeeds`[^1] and `explorerRatings`)[^1].
* **State A: Cached with moves**: Return move statistics `-->` ==proceed to [[HM|HM.03]].[^6]==
* **State B: Cached as empty**: Position was previously queried and confirmed to have 0 matching games on Lichess `-->` return empty set `-->` stop the ==branch[^10]==, log reason `No opponent moves found.` `-->` proceed to [[S3|S3.02]].
* **State C: Never fetched**: No record exists for this configuration `-->` proceed to **EX.02**.

EX.02 **API Request Concurrency**: Ensure only one HTTP request to the Lichess Explorer API is in-flight at any time across the generator.

EX.03 **Execute API Request**: Send `GET` request to Lichess Explorer endpoint using the target position's full FEN along with configured `explorerSpeeds` and `explorerRatings`.

EX.04 **Handle Rate Limits & Errors**:
* **HTTP 429 (Rate-Limited)**: Pause all Explorer requests for `lichessRateLimitRetryDelayMs`[^1], then retry the request `lichessMaxRetries`[^1].
* **Second Failure / HTTP Error**: If the retry fails or any non-retryable HTTP error occurs, trigger a hard stop with error `[FAILED]` and exit cleanly[^5].

EX.05 **Store & Return Result**:
* ==Write the response (or explicit 0-game empty status) into the local `PositionCache` table.[^8]==
* Eco and opening names come with Explorer responses.  ==Not a separate pipeline.[^7]==
* #note Wikibooks logic is preserved but the documentation for it is deferred. #deferred
* Missing (never fetched) White move data during an active run is treated as a critical error and triggers an immediate clean hard-stop.
* If returned move counts do not account for the position’s total games `-->` log `[WARNING] // what happened...`. Treat the missing games count as `rareDropped`. 
White moves found?
* yes `-->` return fetched move data to [[HM|HM.03]].
* ==no `-->` proceed to [[S3|S3.02]].[^9]==

[^1]: see [[generation-config]]

[^5]: The same cleanup always runs: disconnect from the database, release the lockfile (going through LF.10's ownership check)

[^6]: this looks wrong to me

[^7]: #bug

[^8]: This looks wrong to me: what exactly do we write (Black or White move)?

[^9]: Probably need to catch that instead of silently truncating the branch and continuing to the next item.

[^10]: I keep using 'branch', is this the term? 
