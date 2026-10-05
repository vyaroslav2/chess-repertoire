---
tags:
  - in-progress
---

# Human evidence

## The problem
Small samples lie. Nd7 (3 games, 33%) beat Bg7 (142 games, 44%) because a fixed 48% prior lifted it. If we rank moves by one score alone, a move with a few lucky games can end up on top.

## The goal
Pick a move other than the engine top move only when the human games give strong evidence it scores better. The engine keeps every choice sound.

## Data project: what we measure
From ~100,000[^1] games in the band we choose (rating gap under 100[^2], opening moves ~2–15). Use games that start with 1. d4 d5 and 1. e4 c6:

1. **The curve (prior centre).** Eval → expected win/draw/loss for Black. Example: "+1.00 → Black scores 43%."
2. The scatter (sets k). Group games by the same position and the same move. Keep groups with 200+ games. Within a group, results differ only by luck. Between groups, they also differ for real. Fit k directly on these groups' win/draw/loss counts. Report k with its uncertainty, and check whether one k fits all evals and move numbers.
3. **The minimum sample (follows from 1 and 2).** The fewest games with which a contender could ever pass.
4. Use the same eval source -- local Stockfish 19.

## The algorithm (draft)
0. Candidates: from anywhere (band games, Masters games, engine top moves). Scoring: band games only (Lichess 1600, 1800, 2000 groups). A Masters move can be a candidate, but it is judged at my level.[^3]
1. **Champion** = engine top move, even with zero games. It keeps the core rule clean. Its wide fog already makes it hard to beat with weak evidence.
2. **Each contender's prior** = k fake games at the curve's win/draw/loss for its own eval.
3. **Add its real games** (real counts, not ×5 weighted) → a Dirichlet "cloud" of believable scores.[^4]
4. Safe gain = the low end of (contender score − champion score) at the chosen confidence (e.g. 5th percentile for 95%). Pass if the safe gain > margin. Rank the moves that pass by safe gain. Near-ties go to the better eval.
5. **Engine check** from the top: within the per-move tolerance, and within the line's total cp budget.
6. **First to pass wins.** None pass → the champion.

## Dials
- **k:** measured from data. Not taste.
- **Confidence and margin:** tuned on 2025 games, within a range you are happy with. Lower = more adventurous.[^5]
- **Per-move cp tolerance and line cp budget:** taste. How much soundness you will trade.[^6]

### Is there a mathematically ideal k?
k is only best if the model fits the data. That needs checking, not assuming.

### Is this the solution?
For the problem we started with, yes:
* fewer unsupported switches, with the uncertainty made visible
* the curve and k are measured, not guessed; the confidence and margin are tuned on data
* the risk is one dial you understand ("95% sure")
* the engine cp limits and the line budget keep it sound

Limits to expect:
- Deep in the tree, most moves have few games. There the champion wins almost every time, so human data mostly shapes the early moves.
* Games are not fully independent (same players, transpositions). We also test several contenders and keep the best-looking one, which favours lucky samples. The final test on 2026 games shows how far the real error rate is from 5%.

### How well will it work?
My guess:
- A clear gain over today's method. Fewer unsupported switches, with the uncertainty made visible.
- Most positions will keep the champion.
- A small number of switches, where human data is strong. Those are the useful finds.

The 2026 final test will tell you.


### Next step: a small pilot
- **Scope:** 1. d4 d5 and Caro-Kann only, Lichess 1600–2000, Classical + Rapid.
- **Periods:** 2023–24 fit; 2025 tune; 2026 final test.
- **Output:** the curve, k (with its uncertainty), how well predictions match the 2026 games, and how many switches have enough evidence to judge.




[^1]: Let the data tell you: run with 50,000, then 100,000. Track two things: the total, and how many position + move groups have 200+ games. If the curve and k barely change, you have enough.

[^2]: Do not guess a cut-off. Test it: build the curve for gaps 0–50, 50–100 and 100–200. Keep every group whose curve looks the same as 0–50.

[^3]: 1. Candidates: take them from anywhere: your band's games, Masters games, the engine's top moves. Listing a move does no harm, because the test and the engine check decide. 2. Scoring: use your band only. In the Lichess explorer that is the 1600, 1800 and 2000 groups. So a Masters move can be a candidate, but it is judged on how it scores at my level.

[^4]: We use 1600-2000, Classical and Rapid.

[^5]: Pick the values on separate periods: - 2023–24: fit the curve and k; count each move's games. - 2025: try 70%, 80%, 95% (margin 0% or 1%); keep the best setting. - 2026: test the frozen setting once. This is the final verdict. Keep all positions from one game in the same period. Compare each switch with its champion in the same position.

[^6]:  The curve already contains it. It shows how much score each cp costs at each eval: - **Flat zone:** extra cp costs little. Safe to be adventurous. - **Steep zone:** score drops fast. Danger. Your +0.5 / +1.5 / +2.0 bands will show up as flat and steep parts of the curve. Keep the cp limits as a hard floor. A flat part of the curve can hide a big engine loss. A score budget (e.g. "at most 2 points per move, 4 per line") can be added as an extra check, never as a replacement.

[^7]: 95% is the model's belief, not a proven success rate. It becomes a real rate only if the 2026 test shows the model is well calibrated. Wrong switches are still engine-sound, but how much they lose must be measured.

[^8]: k answers: "How many games does a move need before its own record is as trustworthy as the curve?" - **Positions really differ little:** the curve is a good guess, so a move needs many games to overrule it → big k. - **Positions really differ a lot:** the curve is a rough guess, so a few games should overrule it → small k. So k is the break-even point. Below k games, trust the curve more. Above k, trust the move's own games more.

[^9]: We do not know it in advance. After the test, plot the leftover differences. Roughly bell-shaped → fine. A few extreme outliers (traps) → k still works on average. Just treat it with a bit more caution.

[^10]: Not guaranteed. The size of the downside must be measured.

