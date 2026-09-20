---
tags:
  - in-progress
---

| Setting                        | Value                                                               | Notes                            |
| ------------------------------ | ------------------------------------------------------------------- | -------------------------------- |
| `timestampFormat`[^3]          | Always UTC (`2026-09-03T08:15:23.000Z`)                             |                                  |
| `lockfileName`                 | `lockfile-never-remove-by-yourself-unless-stale`                    |                                  |
| `lockfileRetryLimit`           | 5                                                                   | [[lockfile-retry-lim             |
| `tinyThreshold`[^2]            | 0.0000001 (0.00001%)                                                |                                  |
| `nodeTouchCountCap`[^1]        | 500                                                                 |                                  |
| `moveNumberBands`              | `early` through 4; `middle` through 8; later moves use the `late` b |                                  |
| `popularityThresholds`         | early=5.00%, middle=10.00%, late=15.00%                             |                                  |
| `probabilityBands`[^4]         | common >= 2.00%; uncommon >= 0.50% and < 2.00%; rare < 0.50%        |                                  |
| `depthBudget`                  | common=15, uncommon=8, rare=5                                       | full moves counted from the root |
| `explorerSpeeds`               | classical, rapid                                                    | related to ca                    |
| `explorerRatings`              | 1600, 1800, 2000                                                    | related to c                     |
| `lichessRateLimitRetryDelayMs` | 120 000                                                             |                                  |
| `lichessMaxRetries`            | 1                                                                   |                                  |
| `explorerEliteSpeeds`          | classical, rapid                                                    | related to explore               |
| `explorerEliteRatings`         | 2500                                                                | related to the explor            |
| `mastersWeight`                | 5                                                                   |                                  |
| `minimumWeightedGames`         | 15                                                                  |                                  |
| `lichessCloudEvalMultiPv`      | 5                                                                   | related to the e                 |
| `moveNumberBands`              | early through 4; middle through 8; later moves use the              |                                  |
| `apiToleranceCp`               | early=80, middle=50, late=35                                        |                                  |
| `localToleranceCp`             | early=95, middle=60, late=40                                        |                                  |
| `anchorGames`                  | 50                                                                  |                                  |
| `repertoireSidePrior`          | 48%                                                                 |                                  |
| `localStockfishDepth`          | depth=24                                                            |                                  |
| `localStockfishMultiPv`        | 1                                                                   | related t                        |
| `hardcodedBlackResponses`[^5]  | 1. e4 c6,  1. d4 d5                                                 |                                  |





[^1]: Used for prevent endless transposition looping

[^2]: Used for prevent endless transposition looping

[^3]: Regardless of the machine's local timezone. 
	For log file naming see [[file-naming]].

[^4]: Positions are categorized into search-budget bands based on their cumulative route probability (`cumProb`). Higher probability ("common") positions receive a deeper search budget than rarer ones.


[^5]: Paste PGNs. Moves for repertoire side are considered hardcoded responses. If a resulting generated tree doesn't contain White moves from this PGNs it should not trigger an error.  
