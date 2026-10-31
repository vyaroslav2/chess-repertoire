---
tags:
  - reviewed
---

| Setting                       | Value                                            | Notes                                                       |
| ----------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| `timestampFormat`[^1]         | Always UTC (`2026-09-03T08:15:23.000Z`)          |                                                             |
| `lockfileName`                | `lockfile-never-remove-by-yourself-unless-stale` |                                                             |
| `lockfileRetryLimit`          | 5                                                | [[lockfile-retry-limit]]                                    |
| `probabilityTolerance`        | 0.0001% (0.000001 as a fraction)                 | [[probability-tolerance]]                                   |
| `tinyThreshold`               | 0.00001% (0.0000001 as a fraction)               | [[tiny-threshold]]                                          |
| `nodeTouchCountCap`[^2]       | 500                                              | [[node-touch-count-cap]]                                    |
| `minCumProb`[^3]              | 0.1% (0.001 as a fraction)                       | [[min-cum-prob]]                                            |
| `depthCap`                    | 15                                               | full moves counted from the root; a ceiling for every route |
| `explorerSpeeds`              | classical, rapid                                 | related to amateur cache profile                            |
| `explorerRatings`             | 1600, 1800, 2000                                 | related to amateur cache profile                            |
| `apiRetryDelayMs`             | 120 000                                          |                                                             |
| `apiRequestGapMs`             | 2 000                                            |                                                             |
| `apiRequestTimeoutMs`         | 30 000                                           |                                                             |
| `localStockfishVersion`       | 19                                               | related to local Stockfish  cache profile                   |
| `localStockfishNodes`         | 200 000 000 nodes; no depth or time limit        | related to local Stockfish  cache profile                   |
| `localStockfishThreads`       | 1; one search at a time                          | related to local Stockfish  cache profile                   |
| `localStockfishHashMb`        | 1024                                             | related to local Stockfish  cache profile                   |
| `localStockfishMultiPv`       | 1                                                | related to local Stockfish  cache profile                   |
| `hardcodedBlackResponses`[^4] | 1. e4 c6,  1. d4 d5                              |                                                             |
| `humanEvidence`               | off                                              | the selector in EW.14; [[HEG]] HEG.50                       |
| `selectorMonths`              | 2023-06 to 2026-05                               | its own Explorer cache profile; [[HEG]] HEG.20              |
| `selectorConfidence`          | 90%                                              | [[HES]] HES.104                                             |
| `selectorMargin`              | 1 point of score (0.01 as a fraction)            | [[HES]] HES.104                                             |
| `selectorCpLimit`             | 30 cp, at `localStockfishNodes`                  | [[HEG]] HEG.32                                              |
| `selectorLineBudget`          | 50 cp along one route                            | [[HEG]] HEG.31                                              |
| `selectorNearTie`             | 0.5 point                                        | [[HES]] HES.18                                              |
| `selectorDraws`               | 20 000 samples per cloud                         |                                                             |
| `selectorNodes`               | 2 000 000; Threads 1, MultiPV 1                  | its own engine cache profile; [[HEG]] HEG.21                |
| `selectorHashMb`              | 64                                               | its own engine cache profile                                |





[^1]: Regardless of the machine's local timezone. 
	For log file naming see [[file-naming]].

[^2]: The most times one node may be touched in one cascade before the run stops with a hard error. Catches loops that tinyThreshold cannot end. See [[node-touch-count-cap]].
[^3]: A White move whose node's `cumProb` is below this is too rare: Black does not reply, so it is on no card. Every card is at least 1 in 1000. Lower it for more cards. See [[min-cum-prob]].

[^4]: Paste PGNs. Moves for repertoire side are considered hardcoded responses. If a resulting generated tree doesn't contain White moves from this PGNs it should not trigger an error.  

