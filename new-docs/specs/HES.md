---
tags:
  - in-progress
---
# HES — the HE selector

The selector in [[HE]]'s algorithm: the step that picks Black's move in a position from the engine and the human games. Built on 2026-10-28 as `select` in `experiments/he/select.ts`.

## What it is

HES.01 **One job.** For a position with Black to move, it decides whether a move other than the engine's top move has strong enough human evidence to be chosen instead. It does this with the curve and k already measured ([[HEV]]).

HES.02 **Standalone, like all of HE.** It lives in `experiments/he/`, as a new command, `select`. It reads the app's database but never writes to it, and it doesn't change the tree generator. Its output is a report under `experiments/he/data/`. Putting it into the generator is a later, separate decision.

HES.03 **What it reads.**

| Input | From | Notes |
| --- | --- | --- |
| Positions with Black to move | the app's tree (`RepertoireNode`), read-only | those whose move is already chosen: 86 of 328 on 2026-10-28; the rest wait at the edge of the generating tree |
| Human games for each move | the app's Explorer cache (`PositionCacheMove`) | Lichess, 1600–2199, rapid and classical; all 328 positions are cached |
| The champion | the move the tree already plays there | the app's Stockfish 19 top move at 200M nodes (HES.11) |
| Evals of each move | HE's own Stockfish 19, 2M nodes, cached | the same profile the curve was fitted with |
| The curve | `curve.json` of the pool `2024-02-03` | eval → Black's win, draw and loss |
| k | `k.json` of the pool, its trend part | a k for each Black move number from 2 to 15 |

## The steps, for each position

HES.10 **Skip what HE has nothing to judge.** Black's first move: it is fixed (1… c6, 1… d5). Positions with no Explorer games.

HES.11 **The champion** is the move the tree plays: the engine's top move. It is never searched to decide whether to keep it. It is searched once at 2M nodes, restricted to that move, to get the eval its prior and the cp check use. Decided: the tree's move, not a 2M search's top move. It comes from 200M nodes, the better engine verdict, and it is what the repertoire really plays. Every eval is still taken at 2M, to match the curve. The report notes where a 2M search would pick a different top move (`top2M`).

HES.12 **The contenders** are the other legal moves with at least one Explorer game.

HES.13 **The best case, before any search.** Give a contender the best case it could possibly have: its real games, and the best prior a contender can have, the champion's (HES.21). If even then it can't pass (HES.16), it is dropped without a search, since a worse eval can only lower its belief. A small slack (0.5 points) covers the draws' own noise. Most moves fall here, and this saves most of the Stockfish time.

At first this step assumed every game won. Explorer moves have thousands of games, so that dropped only 40 of 677 contenders. With the real games it drops about 94% (646 of 688 on the first 64 positions), and no contender that passed would have been dropped. Changed 2026-10-28.

HES.14 **Search the rest.** Each remaining contender gets a 2M-node search restricted to it, cached as the Colab searches were. A contender with a mate score, or a champion with one, ends HE for that position: the champion stays. Mates are not on the curve.

HES.15 **Each move's belief.** The prior is k pretend games at the curve's win, draw and loss for the move's eval. k is the value for this position's Black move number. Then the move's real Explorer games are added: Black's wins, draws and losses. The result is a Dirichlet "cloud" of believable scores for that move, as in [[HE]] step 3.

HES.21 **A contender's prior is never better than the champion's.** If the 2M search rates a contender above the tree's 200M move, its prior uses the champion's eval instead. Otherwise a contender could switch on the weaker search's disagreement alone, not on human games, and HE is about human games. It also makes the best case in HES.13 a true bound. Its cp loss is still reported as it is, so it can be below 0.

HES.16 **Safe gain.** Draw 20,000 scores from the contender's cloud and 20,000 from the champion's (seeded, so a rerun gives the same answer). The gain is the contender's score minus the champion's. The **safe gain** is the gain at the unlucky end: the 5th percentile, for 95% confidence. A contender **passes** if its safe gain is above the margin.

HES.17 **Engine check.** A contender that passes must also lose no more than the per-move cp limit against the champion, both at 2M nodes.

HES.18 **The choice.** Among the contenders that pass both checks, the highest safe gain wins. A near-tie (within 0.5 points of safe gain) goes to the better eval. If none pass, the champion stays.

HES.19 **The line budget waits for the generator.** HE also caps the total cp given up along a whole line. In a standalone report every earlier Black move in the line is still the champion, so a line has spent nothing before the position at hand. The budget only starts to bite once switches feed back into the tree. So `select` checks the per-move limit only, and reports each switch's cp cost, so the budget can be set from real numbers.

## The dials

HES.20 Starting values, to be tuned later on 2025 games (as [[HE]] plans):

| Dial | Start | Why |
| --- | --- | --- |
| Confidence | 95% | HE's example |
| Margin | 1 point of score | HE's example ("1% better") |
| Per-move cp limit | 30 cp | your taste: how much engine soundness to trade. Decided 2026-10-28 |
| k | two runs: the trend's low end and its best fit | the test in HES.31 |

## The output

HES.30 **The report.** `select` writes `selections.jsonl` and `selections-summary.json`. For each position:
* the champion, its eval and its games
* each contender:
  * its games and score
  * its eval and cp loss
  * its prior, and the score its cloud centres on
  * its safe gain
  * whether it passed, or why not: its best case fails (HES.13), safe gain, cp limit or mate
* the move chosen, and the position's cumProb

The summary gives:
* the number of switches
* their share weighted by cumProb, which is how often a player would really meet them
* the switches by Black move number

HES.31 **The k test**, the one from the k discussion. Run `select` twice: once with k at the trend's low end and once at its best fit. Compare the chosen moves.
* **The same, or nearly:** k's exact value doesn't matter, and it needs no more months.
* **Different:** list the positions where they differ, weighted by cumProb. That is where more data would pay.

## Tests

HES.40 Made-up positions, checked by unit tests (`tests/he.test.ts`, all passing):
* **Nd7, 3 games at 33%, against Bg7, 142 games at 44%:** Nd7 must not pass.
* **A strong contender:** 600 games at 54% against 46.9%, as in the worked example. It must pass.
* **The same contender with 200 games:** it must not pass.
* **A mate on either side:** the champion stays. The test covers the contender's mate; the champion's is checked in the command itself.
* **A contender the 2M search rates above the champion** gets no better prior than the champion's (HES.21).
* **The best case:** a contender it drops, with few games or many poor ones, could not have passed with a full search either.
* **The engine check:** a contender beyond the cp limit fails, whatever its safe gain.

## Known limits

HES.50 **Explorer games are from all years.** They include 2025 and 2026, which HE keeps apart for tuning and the final test. That is fine for choosing moves. But tuning and testing the dials will need move counts from the right years only, from our own downloads or the Explorer's date filter. That belongs to the tuning step, not this one.

HES.51 **Explorer has no rating-gap filter.** The curve was fitted on games with a rating gap under 100. The Explorer's counts include any gap. HE's footnote on the gap (test 0–50, 50–100 and 100–200) covers this. Until then it is a known difference.

HES.52 **A switch leaves the tree behind.** After a different Black move, the positions that follow are not in today's tree. The report says where HE would switch. It cannot say what lies beyond until the generator uses it.

HES.53 **Picking the best of several contenders favours luck.** HE notes this, and the 2026 test measures it. The 95% is the model's belief, not a proven success rate.

## Not in this step

HES.60 Tuning the confidence and margin on 2025 games, the frozen 2026 test, the sensitivity check (without time losses and early endings), and putting the selector into the generator. Each comes after the report shows what the selector does.

## Cost

HES.70 86 positions today. Two searches each for the champion and `top2M`, and under one contender on average after the best-case filter (HES.13). A 2M search takes about 1 s at full speed, but 5–30 s on a hot, throttled laptop. The searches are cached, so the k test reuses them.
