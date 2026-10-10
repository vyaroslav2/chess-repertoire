---
tags:
  - reviewed
---

| Setting                       | Value                                                             | Notes                                                         |
| ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `timestampFormat`[^1]         | Always UTC (`2026-09-03T08:15:23.000Z`)                           |                                                               |
| `lockfileName`                | `lockfile-never-remove-by-yourself-unless-stale`                  |                                                               |
| `lockfileRetryLimit`          | 5                                                                 | [[lockfile-retry-limit]]                                      |
| `probabilityTolerance`        | 0.0001% (0.000001 as a fraction)                                  | [[probability-tolerance]]                                     |
| `tinyThreshold`               | 0.00001% (0.0000001 as a fraction)                                | [[tiny-threshold]]                                            |
| `nodeTouchCountCap`[^2]       | 500                                                               | [[node-touch-count-cap]]                                      |
| `moveNumberBands`             | `early` through 4; `middle` through 8; later moves use the `late` |                                                               |
| `popularityThresholds`        | early=5.00%, middle=10.00%, late=15.00%                           |                                                               |
| `probabilityBands`[^3]        | deep >= 2.00%; medium >= 0.50% and < 2.00%; shallow < 0.50%       |                                                               |
| `depthBudget`                 | deep=15, medium=8, shallow=5                                      | full moves counted from the root                              |
| `depthCap`                    | 2                                                                 | full moves counted from the root; caps every depthBudget band |
| `explorerSpeeds`              | classical, rapid                                                  | related to amateur cache profile                              |
| `explorerRatings`             | 1600, 1800, 2000                                                  | related to amateur cache profile                              |
| `apiRetryDelayMs`             | 120 000                                                           |                                                               |
| `apiRequestGapMs`             | 2 000                                                             |                                                               |
| `apiRequestTimeoutMs`         | 30 000                                                            |                                                               |
| `localStockfishVersion`       | 19                                                                | related to local Stockfish  cache profile                     |
| `localStockfishDepth`         | depth=24                                                          | related to local Stockfish  cache profile                     |
| `localStockfishMultiPv`       | 1                                                                 | related to local Stockfish  cache profile                     |
| `hardcodedBlackResponses`[^4] | 1. e4 c6,  1. d4 d5                                               |                                                               |





[^1]: Regardless of the machine's local timezone. 
	For log file naming see [[file-naming]].

[^2]: The most times one node may be touched in one cascade before the run stops with a hard error. Catches loops that tinyThreshold cannot end. See [[node-touch-count-cap]].
[^3]: Positions are put into search-budget bands by their `cumProb`. A higher `cumProb` gets a deeper search budget.

[^4]: Paste PGNs. Moves for repertoire side are considered hardcoded responses. If a resulting generated tree doesn't contain White moves from this PGNs it should not trigger an error.  

