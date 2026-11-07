---
tags:
  - draft
---
# How the selector judges human moves

A step-by-step explanation of how the selector decides whether a human move overrules the engine's move. It starts from coin flips. The specs are [[HES]], [[HEK]] and [[HEG]]. Figures said to come from the selector were worked out with its own code (`src/lib/core/selector.ts`).

## Step 1: how far a fair coin strays from its average

**One flip.** Count heads as 1 and tails as 0. The average is 0.5, but a single flip never lands on it. It always misses by 0.5, either above or below.

**Variance.** We want one number for the usual size of the miss. We can't just average the misses, because +0.5 and −0.5 cancel to 0. So we square each one first, which removes the minus sign:

- Heads: 0.5 × 0.5 = 0.25
- Tails: (−0.5) × (−0.5) = 0.25

The average of these squares is **0.25**. That's the variance.

**Standard deviation.** Squaring also changed the scale, so we undo it with a square root: √0.25 = **0.5**. That's the standard deviation, the usual size of the miss. Below, it's often called the **usual miss**.

**Many flips.** Variances add up, so 100 flips have a variance of 100 × 0.25 = 25. The standard deviation is √25 = **5 heads**. We expect 50 heads.

**The bell curve.** Do 100 flips, write down the heads, and repeat many times. Plot the counts and you get a bell shape, with most results near 50 and few far away. In any bell curve, about 68% of results lie within one standard deviation of the average. That's roughly two in three.

So 100 flips give between 45 and 55 heads (50 ± 5) about 68% of the time.

| Flips  | Expected heads | Usual miss, in heads | Usual miss, as a share of flips |
| -----: | -------------: | -------------------: | ------------------------------: |
|      1 |            0.5 |                  0.5 |                             50% |
|    100 |             50 |                    5 |                              5% |
| 10,000 |          5,000 |                   50 |                            0.5% |

So 10,000 flips give between 4,950 and 5,050 heads about 68% of the time. As a share of flips, the usual miss is always 50% ÷ √flips. For 100 flips, that's 50% ÷ 10 = 5%.

**Why the number of games matters.** A move scoring 55% over 100 games could be luck, as that's only one standard deviation above 50%. Over 10,000 flips, a fair coin gives about 5,000 heads, and 55% would be 5,500. That's 500 above, or 10 standard deviations, so it's almost certainly real.

## Step 2: from a coin to a chess move

**A move is like a coin.** Each game is one flip. A coin has a chance of heads, and a move has a chance of scoring, which we call its **true score**.

**Score.** A coin has two results, but a game has three. We count from Black's side: a win is 1 point, a draw is 0.5 and a loss is 0. A move's score is its average points per game.

**The curve.** The eval gives a first guess at the true score. We measured how Black scores at each eval, on real games from moves 2–15 of the Caro-Kann and 1. d4 d5. The eval is from White's view, so −1.00 is good for Black.

| Eval  | Black's score |
| ----- | ------------: |
| −1.00 |         58.2% |
| 0.00  |         50.5% |
| +1.00 |         43.6% |

So at 0.00 a move is about a fair coin. At −1.00 it's a coin with a 58% chance of heads for Black. Draws are rare: about 6% at every eval from −2 to +2.

**One big difference.** We know a real coin's chance of heads, but not a move's true score. The eval gives only a first guess, and the move's games then tell us more.

**Variance of a score.** This works like the coin. Take a made-up move with 100 games: 40 wins, 30 draws and 30 losses. Real games have far fewer draws, but these numbers keep the sums simple.

- Points: 40 × 1 + 30 × 0.5 + 30 × 0 = 55
- Score: 55 ÷ 100 = **55%**

Each game misses the average of 0.55 by some amount, and we square each miss:

- Win: 1 − 0.55 = 0.45, squared is 0.2025
- Draw: 0.5 − 0.55 = −0.05, squared is 0.0025
- Loss: 0 − 0.55 = −0.55, squared is 0.3025

On the coin, 100 flips gave 50 × 0.25 + 50 × 0.25 = 25. We do the same here, using the number of games with each result:

40 × 0.2025 + 30 × 0.0025 + 30 × 0.3025 = 8.1 + 0.075 + 9.075 = **17.25**

That's the variance of 100 games. The standard deviation is √17.25 = **about 4.15 points**, or 4.15% of 100 games.

If 55% were the move's true score, 100 games would score between 50.85% and 59.15% about 68% of the time. It's the same logic as the coin: 5 heads in 100 flips is 5%, and 4.15 points in 100 games is 4.15%.

**Draws reduce luck.** The same score can come from different results:

- 40 wins, 30 draws, 30 losses: score 55%, usual miss 4.15 points over 100 games
- 50 wins, 10 draws, 40 losses: score 55%, usual miss 4.72 points over 100 games

More draws means less luck. So the selector keeps wins, draws and losses apart, rather than using the score alone. The curve gives all three too: at 0.00, it expects 47.5% wins, 5.9% draws and 46.6% losses for Black.

In real use, a move's score is only what we saw, not its true score. Step 3 deals with that.

## Step 3: combining the eval and the games

**The problem.** Say a move has 3 games and 3 wins, so it scores 100%. Nobody believes that's its true score, because a small sample can stray a long way. With 10,000 games, though, we'd trust the sample to show how the move scores for these players. It doesn't show that the move is objectively better (see the last section).

So we want a rule that leans on the eval when there are few games, and on the games when there are many.

**Pretend games.** We turn the eval's guess into pretend games, then add the real ones. Pretend games are also called fake games or the prior, and their effect is called smoothing. They have two parts: an expected score, which comes from the eval, and a weight, which is how many games they count as.

Say the eval's guess is 50%, and we give it the weight of 100 pretend games. That's 50 points from 100 games.

- **Few real games:** 10 games scoring 80% add 8 points. (50 + 8) ÷ (100 + 10) = **52.7%**
- **Many real games:** 1,000 games scoring 60% add 600 points. (50 + 600) ÷ (100 + 1,000) = **59.1%**

The 80% moved the guess only slightly, because it came from only 10 games. The 60% almost replaced it, because it came from 1,000.

The result is the move's **belief**: our best guess at its true score. It plays the part of the coin's chance of heads. The selector does this sum for wins, draws and losses separately, but the score comes out the same.

**How many pretend games?** 100 was for easy sums. The real number is called **k**, and we measured it rather than chose it. If real moves stay close to the eval's guess, the eval is reliable and k is large. If they stray far, k is small.

### Bent coins

Imagine a box of coins that land heads 50% of the time on average. Each one is bent a little, so one lands heads 47% of the time and another 53%. Moves work the same way. Moves with the same eval score what the curve predicts on average, but each has its own true score, a little above or below. The eval alone can't see this.

k measures how bent the coins are: the more bent, the smaller k. Part of the bend comes from who plays the move, not the move itself. If stronger players prefer a move, it scores better partly because they're stronger (HEK.30).

**An example.** Three moves, all at eval −1.29, each played 100 times. The curve says 60%.

|                                         | Move 1 | Move 2 | Move 3 |
| --------------------------------------- | -----: | -----: | -----: |
| **World A:** all three really score 60% |    57% |    62% |    59% |
| **World B:** they really score 45%, 60% and 75% | 44% |    61% |    77% |

- In world A, the results differ only by luck. Over 100 games, a move's score nearly always lands within 10 points of its true score. So a move that really scores 60% can score anything from 50% to 70%.
- In world B, the results spread far more than luck allows. The moves really are different.

The real data looks like a mild form of world B, and k measures how mild.

### How we get k

k answers one question: how far does a move's true score stray from the eval's guess? That stray is the **true spread**, the standard deviation of the true scores around the guess (stage 5 below). k is the same spread, written as a number of games (stage 6).

**1. Collect moves.** A group is one position and one move, with its wins, draws and losses from the Lichess Explorer. We took 5,123 groups, up to 500 for each Black move number, each with at least 50 games.

The typical group has **334 games**: that's the median. The mean is 5,788, because a few huge groups pull it up. The largest has 3.9 million.

The mean and the median both describe a typical value, in different ways. Take five groups with 10, 20, 30, 40 and 1,000 games:

- **Mean:** add them all up and divide by how many there are. 1,100 ÷ 5 = **220**.
- **Median:** put them in order and take the middle one. That's **30**.

One huge group pulls the mean up, but barely affects the median. So half our groups have fewer than 334 games, even though the mean is 5,788.

Groups get smaller deeper in the game:

| Black's move | Median games | Mean games |
| ------------ | -----------: | ---------: |
| 2            |          825 |     41,274 |
| 5            |          446 |      2,578 |
| 8            |          246 |        655 |
| 11           |          193 |        423 |

**2. Get two scores for each group.** The expected score comes from the eval, read off the curve. The real score comes from the games.

**3. Find the gaps.** Here are four made-up groups, with 10,000 games each. That's far more than a real group, to keep luck small and the sums simple.

| Move | Expected | Real | Gap |
| ---- | -------: | ---: | --: |
| A    |      50% |  53% |  +3 |
| B    |      52% |  48% |  −4 |
| C    |      47% |  49% |  +2 |
| D    |      55% |  51% |  −4 |

**4. Is it luck?** From step 1, the usual miss for 10,000 games is 0.5 points. Gaps of 2 to 4 points are far too big for that. So moves with the same eval really do score differently.

**5. Measure the true spread.** This is the coin's method again. Square the gaps and average them:

(9 + 16 + 4 + 16) ÷ 4 = 11.25

That still includes luck, whose variance is 0.5 × 0.5 = 0.25. So we take it away:

11.25 − 0.25 = 11, and √11 = **3.3 points**

**6. Turn points into games.** How many coin flips have a usual miss of 3.3 points? From step 1, the usual miss is 50 ÷ √flips, in points. So we solve:

50 ÷ √k = 3.3, so √k = 15, so **k = 225**

So the eval's guess is about as reliable as a sample of 225 games. There are two ways to guess a move's true score:

- **Ask the eval.** The guess is usually off by 3.3 points, which is the true spread.
- **Play 225 games and read the score.** The guess is usually off by 3.3 points, because of luck.

The causes differ, but the size of the error is the same. That's what "as reliable" means, and why the eval counts as 225 pretend games.

Say the eval's guess is 50%, and 225 real games score 56%. Both are equally reliable, so the belief is halfway, at 53%. With more than 225 real games, the belief moves closer to the games.

**7. Repeat for each move number.** A bigger true spread gives a smaller k. The true spread is about 3.1 points at move 2, 4.5 at move 8 and 7.1 at move 15. That gives the k values in the table further down.

### How the computer finds k

Stages 5 and 6 show the idea. The real fit differs in two ways. Groups have different sizes, so their luck differs too. And it uses wins, draws and losses separately, because draws reduce luck (step 2).

**"Fit"** means choosing numbers so that a formula matches the data as closely as possible. Drawing a line through points is one kind of fit, but a fit can also find a single number. We did three separate fits:

| Fit             | What it finds                       | How it's used                 |
| --------------- | ----------------------------------- | ----------------------------- |
| The curve       | a line from eval to expected result | gives the eval's guess        |
| k for each move | one number per move number          | "Measured k" in the k table   |
| The smooth line | a line through those k values       | "k we use" in the k table     |

**The idea.** Pick a k and ask: if this k were true, how likely are the results we actually saw? Do that for many values of k, and keep the one that makes them most likely. The standard name for this is **maximum likelihood**.

It's like a simulation run backwards. A simulation starts with k and produces results. This starts with the results and asks which k most likely produced them. Nothing is actually simulated, though: the computer works out each k's chance directly with a formula.

**A simple example.** Take the four gaps from stage 3: +3, −4, +2 and −4. Each k predicts a usual gap, which combines the true spread and the luck. Here is each k's chance of giving our four gaps, compared with the best k:

|       k | Usual gap it predicts, in points | Chance of our four gaps, against the best k |
| ------: | -------------------------------: | ------------------------------------------: |
|       5 |                             22.4 |                                        0.4% |
|      50 |                              7.1 |                                         24% |
|     100 |                              5.0 |                                         60% |
|     225 |                              3.4 |                                        100% |
|     500 |                              2.3 |                                         47% |
|   1,000 |                              1.7 |                                          3% |
| 100,000 |                              0.5 |                                 almost none |

- **k too small:** it predicts big gaps of 7 to 22 points, but we only saw 2 to 4. That's surprising.
- **k too large:** it predicts tiny gaps under 1 point, so a gap of 4 is almost impossible. That's surprising too.
- **In between:** the best k here is 227, about the same as the 225 from stage 6.

**How it searches.** The computer looks for the best k between 0.5 and 100,000 (HEV.71). These are just limits wide enough to hold any sensible answer:

- **Half a game.** k is only a weight in a sum, so it needn't be a whole number. The selector really does use 122.5 at move 8. At k = 0.5, the eval's guess counts for almost nothing.
- **100,000.** At that k, the true spread is 50 ÷ √100,000 = 0.16 points, so the coins are hardly bent at all. The code uses it to stand for "no true spread".

It tries 201 values, each about 6% larger than the last: 0.5, 0.53, 0.56, and so on up to 100,000. It takes the best one, then zooms in between its two neighbours until the answer stops changing.

**A real example: move 8.** This is the real sum on its 500 groups (327,340 games). Lower is better, and 0 marks the best k. Each extra 1 makes our results about 2.7 times less likely.

|       k | Surprise above the best |
| ------: | ----------------------: |
|       5 |                   1,013 |
|      20 |                     355 |
|      50 |                      90 |
|     100 |                     4.1 |
|     120 |                       0 |
|     150 |                     6.0 |
|     200 |                      32 |
|     500 |                     254 |
| 100,000 |                   2,133 |

It's a clear valley with its floor at k = 120, the "Measured k" for move 8 in the table below.

### k at each move

k falls as the game goes on, because moves stray further from the guess. It depends only on the move number, so every move at move 8 has the same k.

| Black's move | Measured k | k we use | True spread, in points | Groups |
| ------------ | ---------: | -------: | ---------------------: | -----: |
| 2            |        224 |      265 |                    3.1 |    500 |
| 3            |        243 |      233 |                    3.3 |    500 |
| 4            |        221 |      205 |                    3.5 |    500 |
| 5            |        210 |      180 |                    3.7 |    500 |
| 6            |        157 |      158 |                    4.0 |    500 |
| 7            |        138 |      139 |                    4.2 |    500 |
| 8            |        120 |      122 |                    4.5 |    500 |
| 9            |        111 |      108 |                    4.8 |    500 |
| 10           |         91 |       95 |                    5.1 |    500 |
| 11           |         80 |       83 |                    5.5 |    420 |
| 12           |         66 |       73 |                    5.8 |    140 |
| 13           |         88 |       64 |                    6.2 |     47 |
| 14           |         84 |       57 |                    6.6 |      7 |
| 15           |         67 |       50 |                    7.1 |      6 |

"Measured k" is each move's own fit (HEK.81). "k we use" is the smooth line through them (HEK.83), and the true spread is 50 ÷ √k, from that line. Moves 13–15 have few groups, so their measured values are rough.

**What k means for the belief.** At move 2, 100 real games make up 100 ÷ (265 + 100) = 27% of the belief. At move 15, they make up 100 ÷ (50 + 100) = 67%. So the deeper a move, the more each game counts. But deeper moves also have fewer games, which partly cancels this out.

k is fixed for a move number, but each move has its own number of games, so each gets its own balance between the eval and its games. Here are three moves at move 8. Each has an eval guess of 50%, and each scores 60% in its games:

| Real games | Sum                          | Games' share | Belief |
| ---------: | ---------------------------- | -----------: | -----: |
|         10 | (61 + 6) ÷ (122 + 10)        |           8% |  50.8% |
|        246 | (61 + 147.6) ÷ (122 + 246)   |          67% |  56.7% |
|      5,000 | (61 + 3,000) ÷ (122 + 5,000) |          98% |  59.8% |

The 61 is the pretend games' points: 122 × 50%. The move with 10 games stays near the eval, and the one with 5,000 goes almost all the way to its games.

## Step 4: how sure we can be of a belief

**The question.** A belief is one number, but it's still a guess. How far could the move's true score be from it?

**Turning the coin round.** In step 1, we knew the coin's chance and asked how far a sample could stray. Now we've seen a sample and ask how far the true score could be.

**Total games.** In step 3, the eval counts as k games. So pretend games and real games add up, and the belief is as reliable as a sample of that size: total = real games + k. From step 1, its usual miss is 50 ÷ √total, in points. The 50 is a single flip's usual miss of 0.5, written as 50 points out of 100.

For the middle move below, the total is 246 + 122 = 368. Then √368 = 19.2, and 50 ÷ 19.2 = 2.6 points.

Here are the three moves from step 3, at move 8 with k = 122:

| Real games | Total games | Belief | Usual miss, in points |
| ---------: | ----------: | -----: | --------------------: |
|         10 |         132 |  50.8% |                   4.4 |
|        246 |         368 |  56.7% |                   2.6 |
|      5,000 |       5,122 |  59.8% |                   0.7 |

So for the middle move, the true score is probably around 56.7%, give or take 2.6 points. About 68% of the time, we'd expect it to lie between 54.1% and 59.3%.

More games do two things: the belief moves closer to the games, and we become more sure of it.

**The cloud.** The selector doesn't use this formula. Instead, for each move, it makes 20,000 random **picks** of believable true scores. The code calls them draws, as in drawing a card. They have nothing to do with drawn games.

**What one pick is.** Think of the bent coin again. Say we've seen 368 flips, pretend and real, with 56.7% heads. Which coins could have given that? A 57% coin, easily. A 55% coin, fairly easily. A 50% coin, hardly ever. A pick chooses one possible coin at random, and each coin comes up as often as it could have produced what we saw.

For a chess move, a pick is one possible true score, chosen the same way from the pretend and real wins, draws and losses.

Do that 20,000 times, and you get 20,000 possible true scores. Most land near the belief, and a few land far away. Together they make a bell shape called the **cloud**, with the belief in the middle. Its width shows how unsure we are.

The first five picks for the middle move were 58.5%, 54.3%, 55.9%, 57.2% and 59.9%. Its cloud has a usual miss of 2.5 points, close to the 2.6 above. It's slightly smaller because draws reduce luck, as in step 2.

Like the search for k, this works backwards: it starts from what we saw and asks which true scores fit it.

## Step 5: comparing two moves

**The two moves.** The **champion** is the engine's move. A **contender** is another move that might overrule it. Each has its own cloud of 20,000 picks, so we can compare them.

**An example at move 8, with k = 122,** from the selector's code:

- **Champion:** eval's guess 50%, and 2,000 games scoring 50%. Its belief is 50.0%.
- **Contender:** eval's guess 48%, because the engine rates it a little lower, and 246 games scoring 60%. Its belief is 56.0%.

**1. Pair up the picks and subtract.** Take one pick from each cloud. The gain is the contender's pick minus the champion's. Here are the first five pairs:

| Contender | Champion | Gain, in points |
| --------: | -------: | --------------: |
|     57.3% |    51.8% |             5.5 |
|     55.0% |    49.7% |             5.2 |
|     60.5% |    49.9% |            10.6 |
|     53.6% |    49.6% |             4.1 |
|     56.7% |    50.2% |             6.5 |

**2. Repeat 20,000 times.** That gives 20,000 gains, which form a new cloud. Its middle is 6.0 points, the difference between the two beliefs. But it's spread out, because we aren't sure of either move.

**3. Look at the unlucky end.** Put the gains in order, smallest first, and take number 2,000, which is 10% of the way along. That's the **safe gain**. Here it's 2.5 points.

So 2,000 gains (10%) are below the safe gain, and 18,000 (90%) are above it. Each gain is one believable outcome. So in 90% of believable outcomes, the contender is at least 2.5 points better. That's what "90% sure" means here.

In the code, it works the other way round. We choose 90% first, as a setting. The selector then takes the gain at 100% − 90% = 10% of the way along. For 95%, it would take number 1,000 instead, which is lower, so harder to pass.

**4. Compare it with the margin.** The margin is 1 point. If the safe gain is above it, the contender passes this check.

**Three contenders against the same champion:**

| Games | Score | Belief | Middle gain | Safe gain | Passes? |
| ----: | ----: | -----: | ----------: | --------: | ------- |
|   246 | 60.0% |  56.0% |         6.0 |       2.5 | Yes     |
|   200 | 58.0% |  54.2% |         4.2 |       0.5 | No      |
|    40 | 61.3% |  51.2% |         1.2 |      −3.8 | No      |

The last one has the best score, but only 40 games, so the eval's guess holds its belief down and its cloud stays wide. The middle one looks 4.2 points better, but we can't be 90% sure of more than 0.5.

The 90% and the 1 point are settings we chose (HES.104). The rest is measured.

### Why the unlucky end, not the middle?

The unlucky end guards against luck. Half the believable gains lie below the middle, so a move judged on the middle would often be worse than it looked.

The 40-game contender above shows this. Its middle gain is 1.2, above the 1-point margin, so it would pass on the middle. But its safe gain is −3.8: it could easily be worse than the champion.

**Why not a bigger margin on the middle?** Here are four contenders against the same champion. Each has a middle gain of about 4 points, but a different number of games. The figures are from the selector's code.

| Games | Middle gain | Chance it's no better | Safe gain |
| ----: | ----------: | --------------------: | --------: |
|    40 |         4.0 |                   15% |      −1.0 |
|   100 |         3.9 |                   13% |      −0.5 |
|   300 |         3.9 |                    6% |       0.6 |
| 5,000 |         4.0 |                  0.1% |       2.4 |

"Chance it's no better" is the share of the 20,000 gains at zero or below.

Try a fixed margin of 3 points on the middle. All four pass, including the 40-game move, which has a 15% chance of being no better than the champion. Raise it to 5 points, and all four fail, including the 5,000-game move, which is almost surely better. No single margin works. It would have to shrink as the games grow.

The safe gain does that by itself. It starts from the middle and takes off more when we're less sure. With the 1-point margin, only the 5,000-game move passes.

**Why 20,000 picks, not a formula?** A formula would work too: the middle minus 1.28 times the usual miss of the gains. Here it gives the same safe gains, to within 0.03 points. The picks are just an easy way to get that usual miss. They take in both moves' doubt, the three results and small samples, with no extra maths.

## Step 6: the final checks and the choice

So far we've judged one contender against the champion. Here is the full order of checks, and what happens when several contenders pass.

**1. A quick check first.** An engine search takes time, so the selector first gives each contender its best possible case. That's its real games plus the champion's guess, since a contender's guess is never better than that (point 3). If even the best case can't pass, the move is dropped with no search. Most moves are dropped here.

The three contenders from step 5:

| Games | Best-case safe gain | Searched? | Safe gain after search |
| ----: | ------------------: | --------- | ---------------------: |
|   246 |                 3.2 | Yes       |                    2.5 |
|   200 |                 1.3 | Yes       |                    0.5 |
|    40 |                −2.3 | No        |                      — |

The bar here is 0.5 points, not 1, to allow for the picks' own noise. The 200-game move gets through, but fails once its own eval is known. So the quick check only rules moves out. It never lets one in (HES.13).

**2. The engine search.** Each remaining contender gets its own short search (2M nodes). This gives its eval, and so its guess. A move with a mate score is dropped, because mates aren't on the curve. If the champion has one, the champion stays (HES.14).

**3. A guess is never better than the champion's.** The champion comes from a much deeper search (200M nodes). If the short search rates a contender above it, the contender still gets the champion's guess. Otherwise a contender could win just because the weaker search disagrees. A switch must come from the human games (HES.21).

**4. The safe gain.** As in step 5, it must be above 1 point.

**5. The engine check.** A move that passes must also be no more than 30 cp worse than the champion (HES.17). On the curve, 30 cp costs about 2.4 points of expected score. The 246-game contender's guess of 48% puts it about 25 cp worse, so it passes.

The generator adds two things (HEG.31–32):

- **It measures the cp loss with the deeper 200M search.** So every move that passes the safe gain gets a 200M search, and its cp loss is measured against the champion's 200M eval. The winner's eval in the tree comes from that search, like every other move's. The 2M eval is used only for the guess, because the curve was measured on 2M evals.
- **The line budget.** The cp lost by all the switches along one line adds up, and the total may not exceed 50 cp. Say two earlier switches in a line cost 20 and 25 cp. Then only 5 cp is left, so a third switch costing 10 cp fails, even though it's under 30.

HE's `select` report measures the cp loss at 2M and has no line budget.

**6. The choice.** If several contenders pass everything, the one with the highest safe gain wins. But if others are within 0.5 points of it, the gains are too close to tell apart, so the engine settles it: the better 2M eval wins. If none pass, the champion stays (HES.18).

A made-up example:

| Move | Safe gain | cp worse, at 2M |
| ---- | --------: | --------------: |
| X    |       2.6 |              25 |
| Y    |       2.3 |               5 |
| Z    |       1.4 |               0 |

X is top, and Y is within 0.5 of it. Y has the better eval, so Y wins. Z is 1.2 points behind, too far to count.

### The whole method, in one go

1. The champion is the engine's top move.
2. Every other move with games gets the quick best-case check.
3. The moves that survive get a short search. Their guess comes from the eval, but it's never better than the champion's.
4. Pretend games plus real games give a belief, and 20,000 picks give its cloud.
5. The safe gain, at 90%, must be above 1 point.
6. The move may be at most 30 cp worse than the champion, and must fit the line budget.
7. The highest safe gain wins, and a near-tie goes to the better eval. If nothing passes, the champion stays.

### Did it work?

The selector chose 16 switches on games from 2023–25. They were then tested on games from January to May 2026, which it had never seen (HES.110–116).

| Games, Jan–May 2026 | Better than the champion | Gain, in points |
| ------------------- | -----------------------: | --------------: |
| All                 |                 15 of 16 |       3.8 ± 0.2 |
| 1600                |                 16 of 16 |       4.2 ± 0.3 |
| 1800                |                 14 of 16 |       3.4 ± 0.3 |
| 2000                |                 10 of 16 |       4.0 ± 0.5 |

Each gain is a weighted average, in which a switch with more games counts for more. The one miss overall was 4...Nc6 in the Advance. It gained 2.8 points in 2025 but lost 0.5 in 2026.

## Why not always play the engine's move?

A fair objection: the engine knows best, so why not always play its top move?

The objection asks which move is best. We ask which move scores best for players like us, against players like us. The engine wins the first question outright. But its eval assumes strong play from both sides for the rest of the game, and the engine won't be at the board to play the next moves.

We aren't choosing humans over the engine. The engine's move is the default. Its eval sets the first guess, and a switch has to stay within the cp limit. Human games overrule it only when the evidence is strong.

So why take human moves at all? Human results show that some moves score better than the engine's move, by more than luck explains. Perhaps the position after them is simpler or safer to play, or harder for the opponent.

**What we measured.** The final test above: 15 of 16 switches scored better on games the selector had never seen, by 3.8 ± 0.2 points. The gains hold in each rating group, so they don't come only from stronger players choosing those moves.

**Limits:**

- All 16 switches are in Black's first four moves, so the test says little about deeper moves.
- A sample also shows who plays a move, not only the move itself (HEK.30). If stronger players prefer a move, it scores better partly because they're stronger. Checking each rating group on its own reduces this bias, but doesn't remove it, because each group still spans 200 points.
- Edges can fade. Nc6 in the Advance (1. e4 c6 2. d4 d5 3. e5 c5 4. Nf3 Nc6, where the engine plays 4...cxd4) gained 2.8 points in 2025, then lost 0.5 in 2026 (HES.114).
- In the 2000 group, 10 of 16 switches scored better. The other six scored −0.2, −0.3, −1.0, −1.1, −8.3 and −12.5 points. The two big losses are rare moves, with 98 and 149 games across all rating groups, so they could easily be luck. The group's gain of 4.0 ± 0.5 is still clear, because those two count for little in the weighted average.
- The curve, k and the final test's switches all came from 1600–2199 games, but the generator now reads 1600–1999. On 1600–1999 the curve still holds, and k differs by at most 7% at moves 2–10, so both stay as they are (HEK.90–92). The switches weren't retested on that range.
- The data shows that a move scores better, not why.
