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

## First run, 2026-10-28

HES.80 **Both k runs pick the same moves.** `tree-low` and `tree-best`, on pool `2024-02-03`:
* 84 positions judged, 2 skipped (Black's first move).
* 16 switches in each run: 1 at Black's move 2, 6 at move 3 and 9 at move 4. They cover 11% of the judged positions' cumProb.
* 0 positions differ. The k test (HES.31) says k's exact value doesn't matter here. Explorer moves have thousands to millions of games, against k's few hundred pretend games, so the games decide. k only moved safe gains on the smallest samples (Nd7 with 1,354 games: 6.4 points at the low end, 3.9 at the best fit), and none crossed the margin.
* About 215 searches in all, after the best-case filter dropped 853 of 900 contenders.
* A 2M search picks a different top move from the tree's in 17 positions (`top2M`).

HES.81 **The switches**, by cumProb:

| cumProb | Line | Tree's move | Switch | Safe gain | cp loss |
| --- | --- | --- | --- | --- | --- |
| 5.92% | 1. d4 d5 2. c4 e6 3. Nc3 | Nf6 | Be7 | 3.5 | 4 |
| 2.88% | 1. e4 c6 2. Bc4 d5 3. exd5 cxd5 4. Bb3 | Bf5 | a5 | 2.4–2.6 | 24 |
| 2.23% | 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 | Bb4 | Nbd7 | 4.6 | 8 |
| 2.15% | 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 | Be7 | Nbd7 | 3.3 | 8 |
| 2.05% | 1. e4 c6 2. d4 d5 3. e5 c5 4. Nf3 | cxd4 | Nc6 | 2.0 | 10 |
| 1.87% | 1. d4 d5 2. c4 e6 3. Nf3 | Nf6 | a6 | 1.0 | 9 |
| 1.39% | 1. d4 d5 2. Nc3 | Nf6 | c5 | 1.7–1.8 | 7 |
| 1.02% | 1. d4 d5 2. Bf4 c5 3. c3 | Nc6 | Qb6 | 4.2–4.7 | 0 |
| 0.89% | 1. d4 d5 2. Nf3 Nf6 3. Bf4 | e6 | c5 | 6.3 | −6 |
| 0.84% | 1. d4 d5 2. c4 e6 3. e3 | Nf6 | Be7 | 1.9–2.0 | 6 |
| 0.69% | 1. d4 d5 2. Bf4 c5 3. c3 Nc6 4. e3 | Bf5 | Qb6 | 3.9–4.0 | −6 |
| 0.32% | 1. d4 d5 2. Bf4 c5 3. Nf3 cxd4 4. Nxd4 | f6 | Nd7 | 3.9–6.4 | 7 |
| 0.28% | 1. d4 d5 2. Nf3 Nf6 3. e3 c5 4. c3 | e6 | Nbd7 | 1.5–3.3 | 12 |
| 0.24% | 1. d4 d5 2. Nf3 Nf6 3. Nc3 | e6 | c5 | 4.5–4.6 | 0 |
| 0.17% | 1. e4 c6 2. Nc3 d5 3. exd5 cxd5 4. Bb5+ | Bd7 | Nc6 | 1.6 | 10 |
| 0.07% | 1. d4 d5 2. Bf4 c5 3. dxc5 Nc6 4. Nf3 | Nf6 | f6 | 1.3–2.0 | 23 |

Safe gains are in points, best fit to low end where they differ. The 3… a6 switch (1.87%) only just clears the 1-point margin.

HES.82 **What this means.** With Explorer's large samples, the selector is in effect "the best-scoring human move within 30 cp". So the dials that matter are the margin, the cp limit, and the known limits in HES.50–51 (all years, any rating gap), not k. More months of k data would not change today's choices.

## Known limits

HES.50 **Explorer games are from all years.** They include 2025 and 2026, which HE keeps apart for tuning and the final test. That is fine for choosing moves. But tuning and testing the dials will need move counts from the right years only, from our own downloads or the Explorer's date filter. That belongs to the tuning step, not this one.

HES.51 **Explorer has no rating-gap filter.** The curve was fitted on games with a rating gap under 100. The Explorer's counts include any gap. HE's footnote on the gap (test 0–50, 50–100 and 100–200) covers this. Until then it is a known difference.

HES.52 **A switch leaves the tree behind.** After a different Black move, the positions that follow are not in today's tree. The report says where HE would switch. It cannot say what lies beyond until the generator uses it.

HES.53 **Picking the best of several contenders favours luck.** HE notes this, and the 2026 test measures it. The 95% is the model's belief, not a proven success rate.

## Not in this step

HES.60 Tuning the confidence and margin on 2025 games, the frozen 2026 test, the sensitivity check (without time losses and early endings), and putting the selector into the generator. Each comes after the report shows what the selector does.

## Cost

HES.70 86 positions today. Two searches each for the champion and `top2M`, and under one contender on average after the best-case filter (HES.13). A 2M search takes about 1 s at full speed, but 5–30 s on a hot, throttled laptop. The searches are cached, so the k test reuses them.

## The 2025 check, 2026-10-31

HES.90 **Choose on 2023–24, check on 2025.** Explorer counts include every year (HES.50), so the first run's switches were partly chosen on the games meant for testing. So `select --months 2023-01..2024-12` reads counts from the Explorer for those months only (same ratings and speeds as [[HEK]]); `check --months 2025-01..2025-12` then fetches each switch's position for 2025 and scores the champion and the chosen move there. Run `tree-2023-24`, k from `explorer-k` ([[HEK]] HEK.88), all other dials as HES.20.

HES.91 **The selection.** 14 switches of 84 positions (10.8% by cumProb), against 16 on all years. 13 are the same. One is new: c5 instead of Nbd7 after 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Bb4 (all years chose Nbd7 there). Three all-years switches don't pass on 2023–24 alone: Nbd7 there, Nbd7 after 1. d4 d5 2. Nf3 Nf6 3. e3 c5 4. c3, and Nc6 after 1. e4 c6 2. Nc3 d5 3. exd5 cxd5 4. Bb5+.

HES.92 **All 14 score better in 2025.** Gains in points, chosen minus champion:

| cumProb | Line | Champion → chosen | 2023–24 gain | Safe gain | 2025 games (champion / chosen) | 2025 gain |
| --- | --- | --- | --- | --- | --- | --- |
| 5.92% | 1. d4 d5 2. c4 e6 3. Nc3 | Nf6 → Be7 | 2.2 | 1.6 | 388,018 / 8,350 | 2.8 ± 0.5 |
| 2.88% | 1. e4 c6 2. Bc4 d5 3. exd5 cxd5 4. Bb3 | Bf5 → a5 | 3.0 | 1.7 | 21,829 / 2,499 | 1.6 ± 1.0 |
| 2.23% | 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 | Bb4 → c5 | 4.7 | 4.4 | 69,700 / 40,796 | 3.8 ± 0.3 |
| 2.15% | 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 | Be7 → Nbd7 | 3.1 | 2.7 | 133,391 / 21,800 | 3.9 ± 0.4 |
| 2.05% | 1. e4 c6 2. d4 d5 3. e5 c5 4. Nf3 | cxd4 → Nc6 | 2.7 | 2.0 | 7,470 / 23,139 | 2.8 ± 0.6 |
| 1.87% | 1. d4 d5 2. c4 e6 3. Nf3 | Nf6 → a6 | 2.1 | 1.4 | 150,754 / 6,911 | 1.4 ± 0.6 |
| 1.39% | 1. d4 d5 2. Nc3 | Nf6 → c5 | 2.2 | 1.8 | 278,205 / 18,896 | 3.2 ± 0.4 |
| 1.02% | 1. d4 d5 2. Bf4 c5 3. c3 | Nc6 → Qb6 | 4.2 | 2.3 | 15,240 / 1,669 | 5.1 ± 1.2 |
| 0.89% | 1. d4 d5 2. Nf3 Nf6 3. Bf4 | e6 → c5 | 5.8 | 5.5 | 83,257 / 44,964 | 5.8 ± 0.3 |
| 0.84% | 1. d4 d5 2. c4 e6 3. e3 | Nf6 → Be7 | 5.2 | 3.1 | 59,053 / 810 | 4.3 ± 1.7 |
| 0.69% | 1. d4 d5 2. Bf4 c5 3. c3 Nc6 4. e3 | Bf5 → Qb6 | 4.6 | 3.4 | 5,202 / 4,326 | 4.2 ± 1.0 |
| 0.32% | 1. d4 d5 2. Bf4 c5 3. Nf3 cxd4 4. Nxd4 | f6 → Nd7 | 13.1 | 3.3 | 341 / 174 | 8.4 ± 4.3 |
| 0.24% | 1. d4 d5 2. Nf3 Nf6 3. Nc3 | e6 → c5 | 5.4 | 4.5 | 19,748 / 6,328 | 6.3 ± 0.7 |
| 0.07% | 1. d4 d5 2. Bf4 c5 3. dxc5 Nc6 4. Nf3 | Nf6 → f6 | 8.4 | 2.7 | 364 / 401 | 12.2 ± 3.4 |

± is one standard error. Mean gain: 4.8 in 2023–24, 4.7 in 2025. Pooled by precision: 4.1 ± 0.1 points.

HES.93 **What it shows.** The gains are not luck: they hold on new games at full size, with no shrinkage. The safe gain was mostly cautious. 11 of 14 switches gained more in 2025 than it promised, and a6 matched it (1.4). Two fell a little short: a5 (1.6 against 1.7) and c5 after 4. Nf3 Bb4 (3.8 against 4.4).

HES.94 **What it doesn't show.** A new year has the same bias as the old: if stronger players pick the chosen move, 2025 repeats that. So the check rules out luck, not "who plays the move" (HEK.30) or the rating gap (HES.51). The per-rating-group check is next: does each switch win in each Explorer rating group on its own?

HES.95 **Each rating group on its own.** `check --rating 1600|1800|2000` scores the same 14 switches on 2025 games from one Explorer rating group only (the players' average: 1600–1799, 1800–1999, 2000–2199). If a switch won only because stronger players choose it, its gain would shrink or vanish inside a group.

| Group | Better | Pooled gain |
| --- | --- | --- |
| 1600 | 14 of 14 | 4.4 ± 0.2 |
| 1800 | 14 of 14 | 4.1 ± 0.2 |
| 2000 | 10 of 14 | 3.4 ± 0.3 |

Per switch, 2025 gain in points (games, champion / chosen):

| Champion → chosen | Line | 1600 | 1800 | 2000 |
| --- | --- | --- | --- | --- |
| Nf6 → Be7 | 1. d4 d5 2. c4 e6 3. Nc3 | 4.7 ± 1.1 | 1.5 ± 0.8 | 3.1 ± 0.9 |
| Bf5 → a5 | 1. e4 c6 2. Bc4 d5 3. exd5 cxd5 4. Bb3 | 2.3 ± 1.3 | 1.8 ± 1.7 | −11.5 ± 5.1 (627 / 103) |
| Bb4 → c5 | 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 | 4.9 ± 0.5 | 4.0 ± 0.5 | 1.7 ± 0.6 |
| Be7 → Nbd7 | 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 | 3.8 ± 0.6 | 4.2 ± 0.5 | 3.7 ± 0.7 |
| cxd4 → Nc6 | 1. e4 c6 2. d4 d5 3. e5 c5 4. Nf3 | 3.5 ± 0.9 | 2.8 ± 1.1 | −1.6 ± 1.8 |
| Nf6 → a6 | 1. d4 d5 2. c4 e6 3. Nf3 | 0.3 ± 1.1 | 2.0 ± 0.9 | 1.9 ± 1.1 |
| Nf6 → c5 | 1. d4 d5 2. Nc3 | 3.3 ± 0.5 | 3.4 ± 0.6 | 1.9 ± 1.0 |
| Nc6 → Qb6 | 1. d4 d5 2. Bf4 c5 3. c3 | 7.1 ± 1.9 | 5.1 ± 2.1 | 1.1 ± 2.7 |
| e6 → c5 | 1. d4 d5 2. Nf3 Nf6 3. Bf4 | 6.0 ± 0.5 | 5.6 ± 0.5 | 5.8 ± 0.6 |
| Nf6 → Be7 | 1. d4 d5 2. c4 e6 3. e3 | 2.8 ± 2.5 | 6.6 ± 2.8 | 3.5 ± 4.4 |
| Bf5 → Qb6 | 1. d4 d5 2. Bf4 c5 3. c3 Nc6 4. e3 | 4.2 ± 1.8 | 3.3 ± 1.6 | 4.5 ± 1.9 |
| f6 → Nd7 | 1. d4 d5 2. Bf4 c5 3. Nf3 cxd4 4. Nxd4 | 17.8 ± 5.5 | 0.9 ± 7.5 | −11.4 ± 12.8 (51 / 19) |
| e6 → c5 | 1. d4 d5 2. Nf3 Nf6 3. Nc3 | 5.8 ± 0.9 | 7.4 ± 1.2 | 5.4 ± 2.0 |
| Nf6 → f6 | 1. d4 d5 2. Bf4 c5 3. dxc5 Nc6 4. Nf3 | 14.5 ± 5.0 | 12.2 ± 5.6 | −0.7 ± 9.5 (34 / 68) |

HES.96 **What it shows.** Inside the 1600 and 1800 groups the gains are as large as overall (4.4 and 4.1 against 4.1). So they don't come from stronger players choosing the switch. That leaves bias inside a group's 200 points, and the rating gap (HES.51); neither is likely to explain gains this size. The gains shrink at 2000 (3.4), but stay clearly positive. The 1600 and 1800 groups are the ones that matter for this repertoire.

HES.97 **One switch to doubt: a5.** In 2000 games it scores 11.5 ± 5.1 points worse (103 games), more than two standard errors. Its 2025 gain overall (1.6) was already below its safe gain (1.7). The other three losses at 2000 are within noise or on very few games (Nc6 −1.6 ± 1.8; Nd7 on 19 games; f6 on 68).
