---
tags:
  - "#processed"
  - sf19-todo
---
# AR — API Requests

## Purpose

AR sets the rules for every outside request: Lichess Explorer ([[EX]]), Lichess Cloud Eval ([[EW|EW.07]]), ChessDB ([[EW|EW.08]]) and Wikibooks. All four follow the same rules: respect the API, leave generous gaps, retry once, then give up.

## Lanes

AR.01 **One lane per host.** A lane lets one request through at a time. After the answer arrives (or the request fails), the next request waits at least `apiRequestGapMs`[^1].

| Lane      | Carries                                   |
| --------- | ----------------------------------------- |
| Lichess   | Explorer and Cloud Eval, together ([[EX\|EX.02]]) |
| ChessDB   | ChessDB                                   |
| Wikibooks | Wikibooks                                 |

AR.02 **Extra gap for Cloud Eval**: before each Cloud Eval request, wait another `cloudEvalExtraGapMs`[^1] on top of the lane gap. Cloud Eval has rate-limited us before. 

AR.03 **Timeout**: a request with no answer after `apiRequestTimeoutMs`[^1] counts as a network error (AR.07).

AR.04 **No prompts**: a request never waits for the user. The run carries on or stops by these rules alone. A Ctrl+C pressed during a wait acts at the next loop iteration ([[S0|S0.08]]).

## Cases

| Case                                                                                                           | What happens                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AR.05 HTTP 200, answer readable.                                                                               | Return it. The caller caches it.                                                                                                                                                                                                                                       |
| AR.06 A valid "nothing here": Cloud Eval 404 (no cloud evaluation), ChessDB `unknown`, Wikibooks missing page. | Not an error. No retry, no message. The caller caches it as empty, so it is not asked again ([[EW\|EW.07]], [[EW\|EW.08]]).                                                                                                                                            |
| AR.07 HTTP 429, any 5xx, a network error or a timeout.                                                         | Log `"[WARNING] [api] returned [status or reason]. Pausing the [lane] lane for [n] s, then retrying once."`[^3] Pause the whole lane for `apiRetryDelayMs`[^1]. If the server sends a `Retry-After` header asking for longer, wait that long instead. Then retry once.[^2] |
| AR.08 The retry fails with any AR.07 case.                                                                     | Give up (AR.11).                                                                                                                                                                                                                                                       |
| AR.09 Any other 4xx (400, 401, 403, a 404 not in AR.06).                                                       | Log `"[WARNING] [api] returned [status]. Not retrying."` A retry would get the same answer. Give up at once (AR.11).                                                                                                                                                   |
| AR.10 HTTP 200, but the body is malformed.                                                                     | Hard error, no retry. Either the API has changed or our parser is wrong, so it must be fixed, not skipped. The error unwinds to [[S0\|S0.05]].                                                                                                                         |

## Giving up

AR.11 **What giving up means depends on the API:**

| API        | On give-up |
| ---------- | ---------- |
| Explorer   | Throw. The error unwinds to the outermost `try/catch` ([[S0\|S0.05]]), the run closes as `[FAILED]`, and the usual cleanup runs ([[S0\|S0.06]]). The tree cannot be built without Explorer data. |
| Cloud Eval | Off for the rest of the run (AR.13). Go to ChessDB ([[EW\|EW.08]]). |
| ChessDB    | Off for the rest of the run (AR.13). Go to local Stockfish ([[EW\|EW.09]]). |
| Wikibooks  | Off for the rest of the run (AR.13). Nodes get no Wikibooks text. |

AR.12 **A give-up is never cached.** Only a real answer (AR.05) or a valid "nothing here" (AR.06) is cached. So the next run asks again.

AR.13 **Off for the rest of the run**: after a failed retry (AR.08), log `"[WARNING] [api] failed again after retry: [reason]. Turned off for the rest of this run."` Send that API no more requests in this run. Its cached answers are still used. An API that still fails after a long pause will not recover mid-run, and more requests only use up the allowance.


[^1]: see [[generation-config]]

[^2]: The Lichess limit counts all requests from one account or IP, not each endpoint on its own. So a 429 on Cloud Eval pauses Explorer too, and the other way round.


[^3]: [status or reason] is one of: `HTTP 429`, `HTTP 5xx` (any status), `a timeout`, `a network error ([message])`.
