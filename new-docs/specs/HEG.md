---
tags:
  - processed
---
# HEG — Human evidence in the generator

HEG puts the selector ([[HES]]) into the tree generator. Black's move stays local Stockfish's top move unless human games show, 90% sure, that another move scores at least a point more, within the cp limits. Planned and built 2026-10-31. Not yet run on the real tree (HEG.98).

## Why

HEG.01 **The selector works.** Chosen on 2023–25 and checked on unseen January–May 2026 games, 15 of 16 switches scored better, 3.8 ± 0.2 points pooled, in every rating group ([[HES]] HES.110–116).

HEG.02 **As a report it can't go further.** A switch leads to positions today's tree doesn't have, so the report can't say what follows ([[HES]] HES.52). Only the generator can build the tree from the chosen moves, and only then can the tree go deeper with the selector in it.

HEG.03 **It changes a design rule.** [[OV]] OV.02 and [[EW]] say human games play no part in Black's choice. With HEG they can overrule the engine, but only under HEG's tests. Those notes change with it (HEG.81).

## Where it hooks in

HEG.10 **In [[EW]], between the baseline and the eval of Black's move.**
* A hardcoded response (EW.13) wins, and the selector doesn't run. So Black's first move stays fixed ([[HES]] HES.10).
* Otherwise EW.09's top move is the **champion**. The selector judges the other moves against it (HEG.11).
* No switch: the champion is Black's move, as today.
* A switch: the chosen move is Black's move. EW.11 then searches it like any Black move, under the generator's profile (200M nodes), and that eval is stored.

HEG.11 **The steps for one position**, as [[HES]] HES.11–18:
1. Get the position's move counts for `selectorMonths` (HEG.20). No games at all: no judging; the champion stays.
2. Search the champion at 2M nodes (HEG.21) for its eval. A mate score: no judging.
3. For each other legal move with games: the best-case filter (HES.13). A move that couldn't pass even with the champion's eval as its prior is not searched.
4. Search the rest at 2M nodes. Prior centre: the curve at the move's eval, capped at the champion's eval (HES.14). Prior strength: k for this move number (HEG.23).
5. Safe gain at `selectorConfidence` (HES.16). It must exceed `selectorMargin`.
6. cp loss against the champion, measured at 200M (HEG.32), must be within `selectorCpLimit`, and within what the line budget has left (HEG.31).
7. Of the moves that pass, the highest safe gain wins; a near-tie goes to the better eval (HES.18).

HEG.12 **What follows a switch is built like any other line.** The position after the chosen move goes on the queue as usual ([[S3]]). Transpositions, `minCumProb`, `depthCap` and the probability cascade are unchanged. A position is judged once, by the route that owns it ([[TR.excalidraw|TR]]).

## What it reads

HEG.20 **Move counts from recent months.** Explorer, at the position with Black to move, with the generator's speeds and ratings (`explorerSpeeds`, `explorerRatings`) but only the months in `selectorMonths`. It gets its own cache profile, so the existing Explorer cache stays as it is ([[EX]], [[OV]] OV.15). One extra call per position with Black to move.
* Why recent months: edges fade a little year by year (HES.112), and one line lost its edge in 2026 (HES.114).
* `selectorMonths` is written out (since, until), not relative to today, so a cache profile never changes under a run. Moving it forward is a deliberate step (HEG.63).
* Proposed: the last three full years the Explorer has. Today that is 2023-06 to 2026-05 (the Explorer had nothing after May 2026 on 2026-10-31).
* Decided 2026-10-31: recent months, not all years. It is the cautious side: deep moves with thin data have a weaker case, so they stay with Stockfish's move more often.

HEG.21 **Evals at 2M nodes, as the curve was fitted.** Threads 1, Hash 64 MB, MultiPV 1, Stockfish 19 ([[HE]] item 4). A 2M eval is the only kind the curve can turn into a prior. It gets its own `EngineCache` profile ([[DB]] DB.32). The generator's 200M search still picks the champion and gives every stored eval.
* Decided 2026-10-31: the selector's 2M evals are read HE's way, taking the stop line, as the curve's were ([[EW]] EW.09 note). The generator's own 200M searches keep dropping it.

HEG.22 **The curve, frozen.** The pool's chosen curve (`experiments/he/data/runs/2024-02-03/curve.json`: its name, parameters and knots) is copied into a file under `src/`, with where it came from. The generator never reads `experiments/`.

HEG.23 **k from the Explorer trend.** k(move) = 265 × 0.879^(move − 2), the best fit on `explorer-k` ([[HEK]] HEK.83). It is 265 at Black's move 2, 122 at move 8 and 50 at move 15. Moves outside 2–15 take the nearest end, as `select` does.

## The dials

HEG.30 **Settings**, added to [[generation-config]]:

| Setting | Value | Notes |
| --- | --- | --- |
| `humanEvidence` | on / off | HEG.50 |
| `selectorMonths` | 2023-06 to 2026-05 | HEG.20; its own Explorer cache profile |
| `selectorConfidence` | 90% | HES.104 |
| `selectorMargin` | 1 point of score | HES.104 |
| `selectorCpLimit` | 30 cp | HES.20 |
| `selectorLineBudget` | 50 cp | HEG.31 |
| `selectorNearTie` | 0.5 point | HES.18 |
| `selectorDraws` | 20,000 | samples per cloud; fixed seed per position and move |
| `selectorNodes` | 2,000,000 | HEG.21; its own engine cache profile |

The curve and k are not settings: they are measured, and change only with a new measurement (HEG.22–23).

HEG.31 **The line budget** ([[HES]] HES.19). The cp losses of the switches along a route add up. Only losses count; a switch to a move the 200M search rates better spends nothing. A move passes only if the route's spend so far plus its own cp loss stays within `selectorLineBudget`.
* Why: in a deep line, many small losses could add up to a bad position. The per-move limit can't see that.
* Decided 2026-10-31: 50 cp for a line, with 30 cp for one move. Today's switches lose 0–15 cp each, so a line can take three or four typical ones. The report could never put two on one line (HES.19), so how they add up is still to be seen.

HEG.32 **cp loss at 200M.** Decided 2026-10-31. The prior needs 2M evals, because the curve was measured on them. The cp limit and the line budget are about soundness, and there the generator's deeper search is better. So a contender that passes the safe gain gets a 200M search, and its cp loss is measured against EW.09's eval. The winner needs that search anyway (EW.11), so only the other passing contenders cost extra, a few minutes each.

## What it records

HEG.40 **On a switched Black move** ([[DB]] DB.14):
* `selectionMethod`: `Human evidence`. `moveOrigin`: `Human Move`. `engineRank`: `null`.
* New fields: the champion's SAN, both 2M evals, the 200M cp loss, the move's games and score, its safe gain, and the line budget spent after it.
* Every judged contender too, as JSON on Black's move (`selectorJudged`), and in the log (HEG.41): its games, score, eval, safe gain and verdict. Decided 2026-10-31: it is small, and it explains a choice later.

HEG.41 **The log** ([[TGL]]): one line per switch: the line, champion → chosen, games, safe gain, cp loss, budget spent. The run summary adds: positions judged, switches, their share by cumProb, and 2M searches made.

## Rollout

HEG.50 **`humanEvidence` off rebuilds today's tree.** Decided 2026-10-31: off by default until HEG.60 passes, then on.

HEG.60 **First build at today's depth, against the report.** With `minCumProb` unchanged, the switches must match `select` on the same tree, months and dials. That checks HE's code against the generator's. Any difference is explained before going on. One kind is expected: `select` measures cp loss at 2M, the generator at 200M (HEG.32), so a move near 30 cp may pass in one and not the other. Today none of the blocked moves loses 30–36 cp at 2M, so few should differ.

HEG.61 **Tests.** The selector's maths moves out of HE with its tests (HES.40). Plus one generator test with a fake Explorer and engine: a switch is recorded with its fields; the budget blocks a second switch on the same line; the hardcoded first move is never judged; `off` gives the old tree.

HEG.62 **Then deeper.** Lower `minCumProb` in steps (e.g. 1 in 3,000, then 1 in 10,000), and measure the time per step. Deeper positions have few games, so k and the confidence matter more there (HES.104). After the first deep build, check the deep switches on months the selection didn't use (HEG.63).

HEG.63 **Recheck once a year.** Move `selectorMonths` forward and rebuild. The tree is rebuilt from scratch anyway ([[OV]] OV.04). Compare the switches with the year before. Before moving the months on, check last year's switches on the new months, as HES.90 did. That catches lines like the Advance Nc6 (HES.114). June 2026 onwards are unseen so far, so they can be the next test.

## Cost

HEG.70 **Per position with Black to move:** one Explorer call (cached), one 2M search for the champion, and about one more for contenders after the filter. A 2M search takes about 1 s, against the 200M search the generator already runs. So HEG adds little time. Most of the time is Explorer's 2 s gap per call ([[AR]]).

## Code

HEG.80 **One copy of the selector.** Its maths (the cloud draws, safe gain, best-case filter and choice) moves from `experiments/he/select.ts` to `src/lib/core/selector.ts`. HE's `select` then imports it, so the report and the generator can't drift apart. The generator never imports from `experiments/`.

HEG.81 **Notes that change with it:** [[OV]] OV.02 and OV.12, [[EW]] (its opening line, EW.09 and EW.10), [[DB]] DB.14, [[generation-config]], [[TGL]], and [[HES]] HES.02 (the "later, separate decision" is this note).

## Open questions

HEG.90 Decided 2026-10-31: recent months (HEG.20), HE's way of reading 2M evals (HEG.21), a 50 cp line budget (HEG.31), every judged contender stored (HEG.40), `humanEvidence` off until HEG.60 passes (HEG.50), cp loss measured at 200M (HEG.32).

Nothing is open.

## Built, 2026-10-31

HEG.95 **Where it lives.**
* `src/lib/core/selector.ts`: the maths (HEG.80). HE's `select` and `curve` now import it from there; a rerun of `select` gave the same 16 switches as before.
* `src/lib/core/selector-evidence.ts`: the frozen curve and the k trend (HEG.22–23).
* `src/lib/core/evaluator.ts`: EW.14, the selector at one position.
* `src/lib/core/local-engine.ts`: the 2M search, read HE's way (HEG.21), cached in `EngineCache` under its own profile, one row per searched move.
* `src/lib/api/lichess.ts`: the counts for `selectorMonths`, with every move (`moves=100`), under their own cache profile (HEG.20).
* `src/lib/core/generator.ts`: the route's budget spent so far, the log lines and the summary (HEG.31, HEG.41).
* `src/lib/core/config.ts`: the settings (HEG.30). `prisma/schema.prisma` and migration `20261031120000_human_evidence`: the fields (HEG.40).

HEG.96 **Choices made in building.**
* The cp loss is the 200M eval of the position the move reaches, minus EW.09's eval of the position before it.
* `lineCpSpent` is stored on every Black move the selector judged. Where it did not run (a hardcoded move, or `humanEvidence` off), it is null and counts as 0.
* A contender may lose no more than the cp limit or what the budget has left, whichever is smaller. A switch to a move the 200M search rates better spends nothing.
* With `humanEvidence` off, Black's choice and what is stored are exactly as before; the tests check it.

HEG.97 **Tests.** `src/lib/core/human-evidence.test.ts`: HE's read of a 2M search, k at the trend's ends, the switch's field rules, and a whole run on a fake Explorer and engine. In that run, a switch is built on and recorded with its fields; the budget blocks a second switch on the same line; the hardcoded first move is never judged; and `off` stores nothing new. All 246 app tests pass on `test.db`; HE's 34 pass.

HEG.98 **Not done yet.**
* Done 2026-10-31: the migration is applied to `dev.db` (`prisma migrate deploy`; backup `prisma/dev.db.bak-2026-10-31`).
* The first build (HEG.60) has not run. It needs `humanEvidence` on, a Lichess token for the Explorer (as EX already does), and time: one 2M search per judged move and one 200M search per passing contender.
