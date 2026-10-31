---
tags:
  - draft
---
# HEK — k from Explorer counts

A better k for [[HE]], measured on the Lichess Explorer's counts instead of our own sampled games. Planned and built on 2026-10-29 as `explorer` in `experiments/he/explorer.ts`.

## Why

HEK.01 **Our own data can't pin k down past move 6.** Our games give one move each, so groups that repeat are rare deep in the tree: at moves 8–10, 149 groups with 2+ games, the biggest of 7 games. k's best fit there is the trend carried past the data, and its upper end is open at every move ([[HEV]] HEV.72–74).

HEK.02 **The Explorer has the big groups.** For any position it gives every move's wins, draws and losses for the rating bands, speeds and months we ask for. Moves at move 8–10 in main lines have thousands of games. That is what k needs: groups whose real score is known well enough that a stray from the curve can't be luck.

## Checked on 2026-10-29

HEK.03 **Access works through the local proxy.** The Explorer now refuses requests without a Lichess token (401). The proxy (`C:\Files\proxy.py`, route `/lichess/{path}`) adds the token from its own `.env`. The token is never in HE's code or data.

HEK.04 **The month filters work.** One position, 1. d4 d5 2. c4, Black to move, 1600–1999, rapid and classical:

| Filter | Games |
| --- | --- |
| none | 22,205,609 |
| 2023-01 to 2024-12 | 5,652,562 |
| 2025-01 to 2025-12 | 2,552,108 |
| 2024-02 only | 221,711 |

So HEK can use the fit period alone, and keep 2025 and 2026 out ([[HES]] HES.50).

## What it does

HEK.10 **Same filters as the curve, where the Explorer allows.**

| Filter | HEK | The curve's games |
| --- | --- | --- |
| Rating | Explorer groups 1600, 1800, 2000: average of both, 1600–2199 (HEK.34) | average of both, 1600–2199 |
| Speed | rapid, classical | the same |
| Months | 2023-01 to 2024-12 | the same period |
| Rating gap | any (no filter) | under 100 |
| Endings | all | all but rules infractions |

HEK.11 **Walk the main lines.** Start after 1. d4 d5 and 1. e4 c6. At each position, ask the Explorer for its moves. Follow every move with at least *N* games (a dial, start 1,000) to the next position. Stop after Black's move 15. A cap on calls (start 5,000) keeps the walk bounded. Every answer is cached, so a rerun calls nothing.

HEK.12 **The groups.** At each position with Black to move, every Black move with 2+ games is a group: its position, move, wins, draws and losses, and Black's move number. They are written as `groups.jsonl` in a new run, in the same shape as an import, so `jobs`, Colab, `results` and `k` work on them unchanged.

HEK.13 **Count before searching.** The walk reports groups by move number and size. Then we choose which to search, e.g. groups of 50+ games. Searching is the cost: one 2M search per group, on Colab as before.

HEK.14 **k uses the pool's curve.** `k` normally reads the run's own `curve.json`. Here the run has no games to fit a curve on, so `k` gets `--curve 2024-02-03`.

HEK.15 **Fit k per move number.** A game passes through only one position at each Black move number, so groups at the same move number never share games. A fit per move is clean. Fits across moves (the overall k and the trend) count some games several times, so their ranges would look narrower than they are. Report them, but trust the per-move fits.

## The output

HEK.20 For each Black move number 2–15: groups, games, k's best fit and its 95% range, upper end included where the data finds one. Beside it, the pool's k for the same move.

HEK.21 **What it decides.**
* **Per-move k with closed ranges:** replace the trend in `select` with these values.
* **Deep moves still open:** keep k at move 6's value from move 7 on, as already suggested.

## Known limits

HEK.30 **Bias is built in.** Explorer groups carry "who plays the move", like ours. k then measures bent coins plus bias. More data doesn't remove it.

HEK.31 **No gap filter.** The gap test ([[HE]] footnote 2) shows whether that matters. It is a separate step.

HEK.32 **Main lines only.** Big deep groups exist only in popular lines. That matches the tree, whose positions are frequent ones too.

HEK.33 **Transpositions.** The Explorer counts a position however it was reached. A position reached at two move numbers merges its games. Rare in the first 15 moves; the walk notes it when it happens.

HEK.34 **The Explorer's rating groups use the average, as our curve does.** Checked 2026-10-29 in its source (`lila-openingexplorer`, `src/model/lichess.rs`): `RatingGroup::select` takes the midpoint of both ratings, and `select_avg` puts it in a group: 1600 means 1600–1799, 1800 means 1800–1999, 2000 means 2000–2199. So groups 1600, 1800 and 2000 are exactly our band. How the midpoint rounds is not shown there; it changes nothing at these bounds.

## Code

HEK.40 Built in `experiments/he/`: an `explorer` command (the walk, its cache, `groups.jsonl` and a manifest under `data/runs/<run>/`), and `--curve` for `k`. Base URL from `--explorer`, default `http://127.0.0.1:55555/lichess`. Unit tests on made-up Explorer answers. No change to `src/`. `k` also gained `perMove`, a fit for each move number on its own (HEK.15).

HEK.41 **Speed.** About 2 s a call through the proxy: 30 calls took 65 s. So 5,000 calls take about 3 hours. The walk asks the most-played positions first, so the cap cuts the rarest ones.

## First walk, 2026-10-29

HEK.50 **Two runs, one cache.** `explorer-2023-24` stopped after 2,211 calls: the proxy timed out on one slow answer and passed it on as a 500. The fetcher now retries server errors after 10 s. `explorer-2023-24b` read those 2,241 answers from the cache and made 2,800 new calls, about 5,000 in all. It took 1 h 51 min, slowed by Lichess's rate limit (429). Use `explorer-2023-24b`; the first run is incomplete.

HEK.51 **What it found.** 5,041 positions, 47,884 groups, 118 million games. No transpositions; every answer's moves add up to its total. It stopped at the cap with 13,581 positions still queued, so it reached only Black's move 11.

| Black's move | Groups | 2–9 | 10–49 | 50–199 | 200–999 | 1,000+ |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 772 | 91 | 143 | 146 | 138 | 254 |
| 3 | 7,045 | 1,564 | 1,454 | 1,178 | 1,138 | 1,711 |
| 4 | 13,972 | 3,673 | 3,008 | 2,198 | 2,280 | 2,813 |
| 5 | 14,230 | 3,922 | 2,862 | 2,348 | 2,378 | 2,720 |
| 6 | 7,789 | 2,180 | 1,609 | 1,210 | 1,318 | 1,472 |
| 7 | 2,969 | 879 | 642 | 484 | 454 | 510 |
| 8 | 928 | 285 | 212 | 161 | 129 | 141 |
| 9 | 142 | 47 | 27 | 26 | 20 | 22 |
| 10 | 30 | 11 | 7 | 4 | 1 | 7 |
| 11 | 7 | 2 | 0 | 0 | 2 | 3 |
| All | 47,884 | 12,654 | 9,964 | 7,755 | 7,858 | 9,653 |

HEK.52 **Against our own data.** At moves 8–10 our games gave 149 groups of 2+, the biggest of 7 games (HEK.01). The Explorer gives 1,100, and 170 of them have 1,000+ games. Moves 12–15 need a deeper walk: more calls, or a higher `--follow`.

HEK.53 **Too many to search all.** 25,266 groups have 50+ games; each is one 2M search. The choice of which to search is open.

## Deeper walk, 2026-10-30

HEK.60 **Why a second walk.** Main lines thin out fast in this band: past Black's move 11, no position has 10,000 games. Walking again from the start would spend most calls on moves 2–7, which are well covered. So the walk gained `--ask-from <move>`: positions before it are read from the cache only, and one missing from the cache is skipped.

HEK.61 **The run.** `explorer-deep`: `--ask-from 8 --follow 500 --calls 4000`. Moves 2–7 came from the cache; from move 8 on it followed every move with 500+ games. 4,000 calls in 2 h 39 min, again slowed by the rate limit. It stopped at the cap with 3,927 positions queued. 9,041 positions, 68,823 groups; 15,292 early positions skipped; 11 transpositions; every answer adds up. It contains all of `explorer-2023-24b`'s groups, so use it in place of that run.

| Black's move | Groups | 2–9 | 10–49 | 50–199 | 200–999 | 1,000+ |
| --- | --- | --- | --- | --- | --- | --- |
| 2–7 | 46,777 | 12,309 | 9,718 | 7,564 | 7,706 | 9,480 |
| 8 | 9,994 | 3,428 | 2,617 | 1,827 | 1,528 | 594 |
| 9 | 6,996 | 2,511 | 1,848 | 1,277 | 1,044 | 316 |
| 10 | 3,368 | 1,281 | 909 | 555 | 503 | 120 |
| 11 | 1,197 | 449 | 326 | 216 | 165 | 41 |
| 12 | 342 | 115 | 86 | 66 | 63 | 12 |
| 13 | 115 | 35 | 33 | 25 | 20 | 2 |
| 14 | 20 | 7 | 6 | 3 | 3 | 1 |
| 15 | 14 | 5 | 3 | 3 | 3 | 0 |
| All | 68,823 | 20,140 | 15,546 | 11,536 | 11,035 | 10,566 |

HEK.62 **What it reaches.** Moves 8–11 now have thousands of groups of 50+ games. Moves 12–13 have 188, and moves 14–15 only 13. The cap cut the rarest positions, which are the deepest, so more calls would add mostly to moves 11–13.

## What we search, 2026-10-30

HEK.70 **Fit k on this first; walk deeper only if needed.** If the per-move k is flat from move 8 to 12, holding it constant to move 15 is safe. If it still drifts at moves 11–13, walk deeper from move 11.

HEK.71 **The sample.** `sample` took from `explorer-deep` every group with 50+ games, at most 500 at each Black move, picked by a hash of position and move. Run `explorer-k`: 5,123 groups. Moves 2–10 have 500 each; moves 11–15 have all they have: 422, 141, 47, 7 and 6.

HEK.72 **Why moves 2–6 too.** The pool already gives k there. If the Explorer's k at moves 2–6 agrees with the pool's, its other filters (no gap filter, two years) don't change k much, and its deep values can stand in for ours. If not, the gap is a measure of that difference.

HEK.73 **Jobs.** `jobs --reuse 2024-02-3000mb --reuse 2024-03-3000mb`: 807 groups take their search from those runs; 4,316 new searches, all in `jobs-a.jsonl`.

## k from the Explorer, 2026-10-30

HEK.80 **Searched and checked.** Colab ran the 4,316 searches. `results` passed every check, including on the two reused runs, and wrote evals for all 5,123 groups. `recheck` searched 20 of them again here: all identical. A few have mate scores and drop out of the fits. `results` now skips an empty jobs file (here `jobs-b.jsonl`), as it does a missing one.

HEK.81 **Per-move k.** `k --run explorer-k --curve 2024-02-03`. Beside it, the pool's per-move fit on its own groups (computed for this note; the pool's `k.json` predates `perMove`).

| Black's move | Groups | k | 95% range | Pool k | Pool range |
| --- | --- | --- | --- | --- | --- |
| 2 | 500 | 224 | 198–254 | 1,633 | 303–open |
| 3 | 500 | 243 | 214–275 | 100,000 | 355–open |
| 4 | 500 | 221 | 194–251 | 212 | 69–open |
| 5 | 500 | 210 | 184–239 | 139 | 34–open |
| 6 | 500 | 157 | 140–177 | 100,000 | 35–open |
| 7 | 500 | 138 | 123–156 | 31 | 10–open |
| 8 | 500 | 120 | 106–136 | 68 | 6–open |
| 9 | 500 | 111 | 97–126 | 100,000 | 5–open |
| 10 | 500 | 91 | 80–102 | 100,000 | 3–open |
| 11 | 420 | 80 | 70–91 | — | — |
| 12 | 140 | 66 | 52–82 | — | — |
| 13 | 47 | 88 | 59–131 | — | — |
| 14 | 7 | 84 | 32–204 | — | — |
| 15 | 6 | 67 | 23–174 | — | — |

(100,000 is the top of the searched scale: the pool's best fit there is "no scatter".)

HEK.82 **Every range is closed.** Big groups pin k down at every move, which our own games never did. k falls steadily, from about 220 at moves 2–5 to about 80 at move 11. Moves 13–15 are too few to say more than "about 70–90".

HEK.83 **The trend fits.** k(move) = 265 × 0.879^(move − 2), and the check holds (χ² 19.3 on 12 df, limit 21.0). It gives 265 at move 2, 122 at move 8 and 50 at move 15.

HEK.84 **Against the pool.** At moves 4–10 the Explorer's k lies inside the pool's ranges. At moves 2–3 it is below them: the Explorer finds more scatter (about 3.3 points of true spread at k 224, against under 3 at the pool's low end). Likely causes are the Explorer's lack of a gap filter, its two years, and the bias in who plays a move (HEK.30–31); huge groups (millions of games at move 2) see even a small systematic stray.

HEK.85 **Against the trend `select` uses.** The pool's trend runs from 1,613 at move 2 to 8.5 at move 15. The Explorer says k is much lower early and much higher late. Early, real games then count for more against the eval; late, a few games can't outweigh the eval.

HEK.86 **Other splits.** Groups of 50–199 games give k 112, groups of 200+ give 148. By eval, k is 160–170 near equality but 58 past +150. So moves in lopsided positions stray more from the curve, or the curve fits less well there.

HEK.87 **HEK.70's rule.** k still falls gently from move 8 to 12, so it isn't flat. But the trend explains it, so a deeper walk would only narrow moves 13–15.

HEK.88 **The choices don't change.** `select --run tree-explorer --k best --k-run explorer-k` (2026-10-31), against `tree-best`, the same tree, pool and dials. The same 16 of 84 positions switch, to the same moves, 11.0% by probability. The tree only reaches Black's move 4, so only k at moves 2–4 is used: 265, 233 and 205 instead of 1,613, 1,077 and 720. Six contenders at move 4 get a different verdict:
* Five fail earlier: by the best-case check instead of safe gain, with no search. Four of them are in 1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. f3.
* One now passes: Qc7 after 1. d4 d5 2. Nf3 Nf6 3. e3 c5 4. c3, 284 games at 61.6%, safe gain 1.09 points. Nbd7 passes there too, with a bigger safe gain (3.45), and stays the choice.

HEK.89 **k is done for this tree.** Its choices are the same with either k. The Explorer's k matters only once the tree goes past move 4. Then deep moves with a few games will need much more to overrule the eval than the pool's trend asked.
