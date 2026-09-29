---
tags:
  - reviewed
---
# EX — Explorer Data Fetching & Caching

EX retrieves candidate move statistics for a given position, from local storage or the remote Lichess Explorer API.


| Dataset | Endpoint   | Filters                                           |
| ------- | ---------- | ------------------------------------------------- |
| Masters | `/masters` | none                                              |
| Elite   | `/lichess` | `explorerEliteSpeeds`, `explorerEliteRatings`[^1] |
| Amateur | `/lichess` | `explorerSpeeds`, `explorerRatings`[^1]           |

Two callers:
  - [[HM|HM.02]], for White's moves: Amateur gives the candidates. 
  - [[EW|EW.02]], for Black's candidates: Masters and Elite.

Whatever EX returns goes back to its caller, which then carries on.

EX.01 **Check Local Database Cache**: For each requested dataset, look up the target `positionKey` (`normalisedFen`) + that dataset's [[cache-profile|cache profile]]. Each dataset is checked on its own. One can be cached while another is not.
* **State A: Cached with moves**: Use the cached move statistics for that dataset.
* **State B: Cached as empty**: Position was previously queried and confirmed to have 0 matching games in that dataset `-->` use an empty set for that dataset. Do not fetch again.
* **State C: Never fetched**: No record exists for this dataset and profile `-->` proceed to **EX.02** for that dataset only.

EX.02 **Lichess API Request Concurrency**: Ensure only one HTTP request to Lichess is in-flight at any time across the generator. The Explorer API and the Cloud Eval API ([[EW|EW.07]]) share one lane — one request in total, not one each. Other APIs have their own lanes ([[AR|AR.01]]).

EX.03 **Execute API Request**: For each dataset still missing, send a `GET` request to that dataset's endpoint with its filters (see the table above). Requests go one at a time (EX.02). We ask with `fullFen` but cache the answer against `positionKey`. That is deliberate, and it is the opposite of engine evaluations, which are cached against `fullFen` ([[DB|DB.32]]).

EX.04 **Handle Rate Limits & Errors**:
Hand off to [[AR]].

EX.05 **Store & Return Result**:
* Write the response (or explicit 0-game empty status) into the local `PositionCache` table.
* Every Explorer response carries `eco` and an `openingName` for the position. They are cached with it ([[DB|DB.31]]). Which name a node gets is [[DB|DB.06]]. Not a separate pipeline.
* #note Wikibooks logic is preserved but the documentation for it is deferred. #deferred
* If the fetch ran and the `PositionCache` row is still missing afterwards, that is a critical error `-->` exit, with the usual cleanup.
* Add up the games of all returned moves and compare with `positionTotalGames`:
	* Equal `-->` carry on.
	* Less `-->` log `"[WARNING] Explorer move counts do not add up to the position's total games. Missing: [n] games ([p]%)."`. The missing share goes to `unaccountedDropped`. Only the Amateur shortfall is recorded as `unaccountedDropped`. For Masters and Elite, log the warning only.
	* More `-->` hard error `-->` exit.

EX.06 **Return to caller**: Return the move data for each requested dataset, empty or not, to the caller. The caller decides what an empty result means:
* [[HM|HM.02]]: no Amateur moves `-->` end the route, log the stop reason `"No opponent moves found."`, proceed to [[S3|S3.01]].
* [[EW|EW.02]]: handled there.

[^1]: see [[generation-config]]


