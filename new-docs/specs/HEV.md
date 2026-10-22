---
tags:
  - temp
  - in-progress
---
# HEV — HE evaluations, February 2024

A temporary note. It records what we did with the Stockfish results from Colab, and what they show. When the curve and k are settled, the parts worth keeping move into [[HER]] and this note goes.

Run: `2024-02-3000mb`. 50,000 games from 1–2 February 2024, in 40,836 groups (a group = one position + the move Black played).

## What an evaluation is here

HEV.01 **One search per group.** Stockfish looks at the group's position, but may only consider the move Black played. It answers: "after this move, who is better, and by how much?" The answer is in centipawns (cp).

HEV.02 **The same settings everywhere.** Stockfish 19, 2 million nodes per search, one thread, 64 MB hash, the hash emptied before each search. With these settings, the same search gives the same answer on any machine. Only the speed differs.

HEV.03 **Who did what.** Your friend searched groups 1–20,000 (`jobs-a.jsonl` → `results-a.jsonl`). You searched 20,001–40,836 (`jobs-b.jsonl` → `results-b.jsonl`). Both on Google Colab, with `colab/he_colab.py` unchanged.

## The import

HEV.10 **What the import does.** It reads the two results files, checks every line, and writes one file, `evals.jsonl`: each group with its win/draw/loss counts and the eval of its move. Run it once:

`npm --prefix experiments/he run results -- --run 2024-02-3000mb`

It refuses to run again over an existing `evals.jsonl`, so a result is never overwritten by mistake.

HEV.11 **It stops at the first problem.** It writes nothing unless every check passes:
* Each file starts with a `session` line (written each time Colab started), and every session used the right Stockfish release (checked by its fingerprint), bench 2,497,913, 2M nodes, 64 MB, one thread.
* Both files came from the very same Stockfish program (the same fingerprint).
* Each results file belongs to its own jobs file: a result in `results-a` must be a job in `jobs-a`.
* Every job has a result. None is missing.
* Each result is for the right move, and that move is legal in the position.
* The score is exact, not a "at least" or "at most" score.
* The figures on each line agree with Stockfish's own text on the same line.
* A job searched twice (possible after Colab drops a session) must give the same answer both times.
* Each job matches its group in `groups.jsonl`: same position, same move.

HEV.12 **The score is turned to White's view, once.** Stockfish scores from the side to move, which is always Black here. So Stockfish's −22 means "Black is 0.22 pawns worse", and the import stores +22: "White is 0.22 pawns better". All HE figures use White's view. A plus means White is better.

HEV.13 **Mates are kept apart.** When Stockfish sees a forced mate, there is no cp score, only "mate in n". These groups get `mateWhite` (plus: White mates, minus: Black mates) and no `cpWhite`. They stay out of the curve.

HEV.14 **Win/draw/loss stay in Black's view,** as in `groups.jsonl`: `wins` are Black's wins. Only the eval is in White's view.

## Results of the import

HEV.20 **Every check passed.**

| | Friend (a) | You (b) |
| --- | --- | --- |
| Jobs | 20,000 | 20,836 |
| Results | 20,000 | 20,836 |
| Missing | 0 | 0 |
| Colab sessions | 8 | 19 |
| Jobs searched twice | 0 | 0 |

Both used the same Stockfish program. All 40,836 groups now have an eval; together they hold all 50,000 games.

HEV.21 **Mates.** 90 groups (91 games) have a mate score: 73 where White mates, 17 where Black mates. They leave the curve. 40,746 groups (49,909 games) have a cp score.

HEV.22 **How deep the searches went.** 2M nodes reached depth 24 in the middle case, as in the test of 11 October ([[HE]] footnote 11). The shallowest went to depth 13; these are positions where one side is far ahead (+5 to +9 pawns), with many pieces still on the board. The deepest went to depth 245, Stockfish's limit; all of them are mates, found at once.

HEV.23 **How the evals spread.** Each game counted once:

| Eval (White's view) | Games |
| --- | --- |
| below −300 | 1,954 |
| −300 to −100 | 2,299 |
| −100 to −50 | 2,045 |
| −50 to 0 | 7,248 |
| 0 to +50 | 19,546 |
| +50 to +100 | 5,704 |
| +100 to +300 | 6,406 |
| +300 and above | 4,707 |

Counted by group instead, half the evals lie between −12 and +110, and the middle one is +26: after Black's move, White is usually a little better, as expected for White.

HEV.24 **The local recheck.** 20 jobs picked at random from each file were searched again on this PC (Windows, not Colab). All 40 gave exactly the same result: the same score, depth, node count and line of moves. Only the speed differed. So both halves can be trusted and joined.

`npm --prefix experiments/he run recheck -- --run 2024-02-3000mb --engine stockfish-windows-x86-64-universal/stockfish/stockfish-windows-x86-64-universal.exe`

The random pick is fixed, so running it again checks the same 40 jobs. It took about 5 minutes.

## A first look at the curve

HEV.30 **Not the curve yet** (that is HEV.60–68). This is a plain count: the games put into eval bands, and Black's results in each band. The real curve is a smooth line fitted through the games, not through bands. But the count already shows its shape.

| Eval (White's view) | Games | Black wins | Draws | Black loses | Black's score |
| --- | --- | --- | --- | --- | --- |
| below −300 | 1,954 | 73.1% | 3.1% | 23.8% | 74.7% |
| −300 to −150 | 1,384 | 60.0% | 5.9% | 34.1% | 63.0% |
| −150 to −75 | 1,665 | 55.1% | 5.8% | 39.2% | 58.0% |
| −75 to −25 | 3,601 | 51.0% | 6.2% | 42.7% | 54.1% |
| −25 to +25 | 16,459 | 46.9% | 6.5% | 46.6% | 50.2% |
| +25 to +75 | 11,543 | 43.8% | 5.6% | 50.5% | 46.6% |
| +75 to +150 | 4,938 | 41.0% | 5.3% | 53.6% | 43.7% |
| +150 to +300 | 3,658 | 38.4% | 5.3% | 56.3% | 41.0% |
| +300 and above | 4,707 | 27.0% | 3.5% | 69.4% | 28.8% |

Score = wins + half the draws.

HEV.31 **What it shows.**
* The score falls steadily as White's eval rises. The eval does predict results.
* It falls slowly. At these ratings, being a pawn worse costs Black only about 6–8 points of score. Even 3 pawns down, Black still scores about 29%.
* Draws are rare: about 6%.
* An even position (−25 to +25) gives 50.2%: no lean to either side.

## The fitted curve

HEV.60 **What the curve is.** For any eval, it gives Black's chance to win, draw and lose. It is the prior centre in [[HE]]: a contender's fake games are spread by the curve's win/draw/loss at its own eval. It is fitted on all 49,909 games with a cp eval, one-game groups included. Mates stay out.

`npm --prefix experiments/he run curve -- --run 2024-02-3000mb`

HEV.61 **How it is fitted, in plain words.**
* The model gives three chances that always add up to 100%. As White's eval rises, Black's loss chance rises and win chance falls. Draws are likeliest where the two meet.
* The line is not forced to be a simple S. It may bend at 7 points: −6, −3, −1, 0, +1, +3 and +6 pawns. Beyond ±6 pawns it runs straight. An eval beyond ±10 pawns counts as ±10.
* The computer picks the line under which the real results are the least surprising.

HEV.62 **Choosing the shape.** Three versions were tried: a straight line (3 numbers), a line bending at 5 points (6 numbers) and at 7 points (8 numbers). More bends always fit the games they learn from better, so the test must use games they have not seen. Each version learned from four fifths of the groups and was scored on the fifth held back, five times over.

| Version | Numbers | Surprise per unseen game |
| --- | --- | --- |
| No eval at all (same chances for every move) | 2 | 1.2549 |
| Straight | 3 | 1.2257 |
| 5 bends | 6 | 1.2255 |
| 7 bends | 8 | **1.2248** |

Surprise is in bits; lower is better. The 7-bend line wins, so it is the curve. The gains look small because one move's eval explains only a little of how a game ends: the eval cuts the surprise by about 2.4%. Most of what decides a game at this level happens later.

HEV.63 **The curve.** Eval in White's view. Range = the 95% range of Black's score (HEV.66).

| Eval | Black wins | Draws | Black loses | Black's score | Range |
| --- | --- | --- | --- | --- | --- |
| −1000 | 90.7% | 1.8% | 7.5% | 91.6% | 89.4–93.8 |
| −600 | 75.0% | 4.1% | 20.9% | 77.0% | 75.3–79.1 |
| −500 | 69.2% | 4.8% | 26.0% | 71.6% | 69.3–73.7 |
| −400 | 63.9% | 5.2% | 30.9% | 66.5% | 63.5–68.9 |
| −300 | 60.4% | 5.5% | 34.1% | 63.2% | 60.6–65.2 |
| −200 | 59.2% | 5.5% | 35.3% | 61.9% | 60.4–63.6 |
| −100 | 55.8% | 5.7% | 38.5% | 58.7% | 57.1–60.2 |
| 0 | 47.4% | 5.9% | 46.8% | 50.3% | 49.7–50.9 |
| +100 | 40.7% | 5.8% | 53.5% | 43.6% | 42.6–44.6 |
| +200 | 38.6% | 5.7% | 55.7% | 41.4% | 40.2–42.6 |
| +300 | 37.7% | 5.6% | 56.7% | 40.5% | 39.0–42.0 |
| +400 | 34.6% | 5.5% | 60.0% | 37.3% | 35.5–38.9 |
| +500 | 29.7% | 5.1% | 65.2% | 32.3% | 30.9–33.6 |
| +600 | 24.5% | 4.6% | 70.9% | 26.8% | 25.6–27.9 |
| +1000 | 9.8% | 2.3% | 87.9% | 10.9% | 9.7–12.8 |

`curve.json` has every 25 cp from −1000 to +1000.

![[hev-curve-feb.svg]]

HEV.64 **What it shows.** The curve has three parts:
* **Near 0, steep.** From −100 to +100 Black's score falls from 58.7% to 43.6%: about 7–8 points per pawn.
* **From 1 to 3 pawns, almost flat.** From +100 to +300 it falls only 3 points (43.6% → 40.5%); from −100 to −300, 4.5 points. Here a bigger eval barely changes the result.
* **Beyond 4 pawns, steep again.** From +400 to +600 it falls 10 points. A big eval usually means real material, which club players do convert.

Level (0) gives 50.3%: no lean to either side. Being better helps Black slightly more than being worse hurts: −100 gives +8.4 points, +100 gives −6.7.

The flat middle part is in the raw counts too (HEV.30), so it is not made by the line. Why it is flat, we can only guess: a 1–3 pawn eval after an early move is often a tactic or a long-term edge that club players do not see or cannot use. March will show whether it holds.

HEV.65 **How well it fits.** Each band of HEV.30, compared with the curve:
* **Score: good.** In every band, the curve is within the noise you expect from the number of games (never more than 1.5 standard errors off).
* **Draws: rough.** The curve keeps draws between about 2% and 6%, with a gentle peak at 0. The real draws are 6.4–6.6% near 0, and lower than the curve in some bands: 2.2% at −400 to −300 (curve 5.4%), 3.3% at +400 to +600 (curve 5.1%). The model ties draws to the same line as wins and losses, so it cannot follow them closely. For the score this hardly matters (a draw counts half). For the win/draw/loss split of a prior it matters a little. A model with its own line for draws can be tried later.

HEV.66 **How sure we are.** The groups were drawn again at random, with replacement, 200 times, and the curve refitted each time. The range in HEV.63 holds 95% of those curves. It is narrow where games are many: ±0.6 points at 0, about ±1 at ±100, ±1.5–2.5 from ±300 to ±500, ±2 at ±1000.

HEV.67 **What it means for HE.** Two examples of a prior centre:
* A move at −200 (Black 2 pawns better): 59.2% win, 5.5% draw, 35.3% loss; score 61.9%. The made-up illustration in [[HE]] said 68%.
* A move at +100: score 43.6%.

In the flat part, moves 1–3 pawns apart get almost the same prior. So there, the move's own games decide more, and the engine's cp limits keep the choice sound.

HEV.68 **Limits.**
* Two days of games: 1–2 February 2024 only. March is the check.
* The curve belongs to 2M-node evals. A deeper eval must not be read off it ([[HE]] item 4).
* It is the main run: every game counts. The sensitivity check (without time losses and early endings) is still to do.

## Group sizes

HEV.40 **Most groups have one game.** As in January (HER.21):

| Games in the group | Groups | Games |
| --- | --- | --- |
| 1 | 39,207 | 39,207 |
| 2–9 | 1,471 | 4,486 |
| 10–49 | 127 | 2,336 |
| 50–199 | 26 | 2,364 |
| 200+ | 5 | 1,607 |

One-game groups help the curve only. k is fitted on the groups with 2+ games: 1,629 (10,793 games), less one mate group, so 1,628 (10,791 games).

HEV.41 **The five biggest groups** are all at Black's move 2, between +23 and +34 cp: 1. d4 d5 2. c4 e6, c6 or dxc4, and 1. e4 c6 2. d4 d5 or 2. Nf3 d5. The scatter check needs another plot (decided 2026-10-10).

## k

HEV.70 **What k is.** The curve gives the usual result for a move at its eval. A real move may do better or worse than usual: a trap, an easy plan, a line people misplay. k measures how much real moves stray from the curve.
* In [[HE]], each contender starts with k fake games at the curve's win/draw/loss, then adds its real games. So k is also the break-even point: with k real games, a move's own record weighs as much as the curve.
* **Small k** (say 10): moves stray a lot. A few games should overrule the curve.
* **Big k** (say 1,000): moves stray little. Only many games should overrule it.

HEV.71 **How it is measured.** Even if every move scored exactly as the curve says, a group's results would still wander by chance, like coin flips: 5 games can easily give 4 wins. k looks for scatter *beyond* that chance. The computer tries every k from 0.5 to 100,000 and keeps the one under which the groups' real results are least surprising. Only groups with 2+ games count: one game cannot show scatter. Small groups count for less by nature: their results are mostly chance.

`npm --prefix experiments/he run k -- --run 2024-02-3000mb`

The method was checked on made-up groups: given a known k of 30, it found a range around 30; given no scatter at all, it found a very large k with no upper limit.

HEV.72 **The result: no scatter beyond chance.** On all 1,628 groups with 2+ games:

| | |
| --- | --- |
| Best k | about 7,500 |
| 95% range | from 335 up, with no upper limit |
| Gain over "no scatter at all" | 0.0 bits |

In plain words: the groups' results look exactly like coin flips around the curve. The data cannot tell k = 7,500 from k = 1,000,000. It can only say that k is very unlikely to be below about 335.

The five biggest groups show it by hand. Each is within about one standard error of the curve (an ordinary amount of chance):

| Move (Black's move 2) | Games | Real score | Curve | Off by |
| --- | --- | --- | --- | --- |
| 1. e4 c6 2. d4 d5 | 541 | 50.7% | 48.2% | +1.2 SE |
| 1. e4 c6 2. Nf3 d5 | 322 | 51.9% | 48.4% | +1.2 SE |
| 1. d4 d5 2. c4 e6 | 315 | 45.9% | 48.2% | −0.8 SE |
| 1. d4 d5 2. c4 dxc4 | 228 | 45.0% | 47.5% | −0.8 SE |
| 1. d4 d5 2. c4 c6 | 201 | 48.8% | 48.3% | +0.1 SE |

HEV.73 **By group size, eval and move.** [[HE]] asks for k in each part separately.

| Part | Groups | Games | Best k | 95% range |
| --- | --- | --- | --- | --- |
| 2–9 games | 1,470 | 4,484 | 150 | 38 up |
| 10–49 games | 127 | 2,336 | 600 | 79 up |
| 50–199 games | 26 | 2,364 | none found | 236 up |
| 200+ games | 5 | 1,607 | 4,600 | 188 up |
| Eval below −150 | 4 | 8 | — | too few |
| Eval −150 to −50 | 35 | 231 | 35 | 7 up |
| Eval −50 to +50 | 1,246 | 9,115 | none found | 372 up |
| Eval +50 to +150 | 291 | 1,284 | 380 | 39 up |
| Eval +150 and above | 52 | 153 | none found | 7 up |
| Black's move 2–3 | 496 | 6,721 | none found | 459 up |
| Black's move 4–6 | 991 | 3,748 | 100 | 39 up |
| Black's move 7–10 | 139 | 318 | 32 | 6 up |
| Black's move 11–15 | 2 | 4 | — | too few |

"None found" = no scatter at all fits best. "Up" = no upper limit.

* **The parts agree.** Every range has no upper limit, and every range overlaps the others. So one k is enough for now, as [[HE]] allows.
* **But the evidence sits in one place.** 9,115 of the 10,791 games are within ±50 cp, and 6,721 are at Black's move 2–3: the main opening lines. There, moves really do differ little, so a big k is no surprise.
* **Later moves hint at more scatter, weakly.** Moves 4–6 give k ≈ 100, moves 7–10 k ≈ 32, evals −150 to −50 k ≈ 35. None is clear of chance: each range runs up to "no limit". This is where traps and misplayed lines live, and where we have few repeated groups.

HEV.74 **Why so few later moves repeat.** Each game gives one move, picked at random from move 2 to 15 (HER.12). Two games share a group only if they reach the same position *and* drew the same move number. That happens often at move 2, rarely at move 10. More games help, but slowly: doubling the games roughly quadruples the pairs, but most new pairs again fall at moves 2–4.

HEV.75 **What it means for HE.**
* With k at least 335, a contender's own games weigh little until it has hundreds. A move with 100 games: its own record counts for at most 100 / (100 + 335) = 23%, the curve for the rest.
* So, as [[HE]] expected, the champion (the engine's top move) will almost always stay. Human data can only overrule it in the main lines with hundreds of games.
* The minimum sample (HE item 3) will be large: hundreds of games.

HEV.76 **Open: which k to use.**
* **335, the low end.** The most generous to human games that this data allows. My suggestion as a working value.
* **The best fit (about 7,500).** Close to "ignore human games". Not useful: the data cannot pin it down.
* **Wait for March.** A second 50,000, and then 100,000 together, may narrow the range. Later-move groups stay rare either way (HEV.74).
#question
## Looking at the games

HEV.80 **The dot page.** One page shows every game as a dot: its eval across, Black's result up (win, draw or loss). The dots of one result form a band, spread a little up and down so they don't hide each other. Over them: the fitted curve with its 95% range, and orange squares for Black's real score in each eval band of the games shown.

`npm --prefix experiments/he run dots -- --run 2024-02-3000mb`

It writes `dots.html` into the run's folder (8 MB). It needs no internet. Making it again replaces it. The browser pane in the Claude app can't open a file that big, so there it is served from this PC by the `he-runs` entry in `.claude/launch.json`. Opened straight from the folder in Edge or Firefox, it works as it is.

HEV.81 **What you can choose.**
* **Show:** a random 100, 1,000 or 10,000 games, or all. "New sample" draws another; each sample has a number, so the same sample can be drawn again.
* **Black's move:** from–to, 2 to 15.
* **Opening:** both, 1. d4 d5 or 1. e4 c6.
* **Group:** any size, one-game groups only, 2+ or 10+ games.
* **Eval range:** ±300, ±600 or ±1000. Evals beyond the range sit at its edge.

HEV.82 **Checking a game.** Click a dot. The panel shows the game: a link to it on Lichess that opens after Black's sampled move, the date, both players and ratings, the opening, the sampled move, its eval and depth, the result, how many games share its group, the results file and id of its search, the position (FEN), and a MySQL query for the same game. So each dot leads to three sources: Lichess (the real game), the results file (the real search), and MySQL.

Example, checked by hand: game `g8gCaNm4`, Black's move 5… Nc6, eval −0.06. Its line in `results-a.jsonl` (id 3817) says Stockfish gave +6 from Black's side, which is −0.06 from White's. Its PGN in `sample.pgn` says 1-0, as the page does.

HEV.83 **The games in MySQL.** A new table, `sampled_moves`, holds one row per game: the sampled move (number, SAN, UCI), the position before it, its group and search (`group_id`, `results`), the group's size, and the eval (`cp_white` or `mate_white`, and depth). It joins `games` by `game_id`. Loading it again overwrites rows, never doubles them.

`npm --prefix experiments/he run load-moves -- --run 2024-02-3000mb`

Loaded on 2026-10-22: 50,000 rows, every one with its game in `games`; 49,909 with a cp eval, 91 with a mate. MySQL now listens on port 13306, not 3306: Windows had reserved the ports 3270–3369 for itself, so Docker could not open 3306.

Example query, Black's score by move number (it gives 46–50% at every move, 2 to 15):

```sql
SELECT move_number, COUNT(*) AS games,
  ROUND(100 * AVG(CASE result WHEN '0-1' THEN 1 WHEN '1/2-1/2' THEN 0.5 ELSE 0 END), 1) AS black_score
FROM games JOIN sampled_moves USING (game_id)
GROUP BY move_number ORDER BY move_number;
```

## Files

HEV.50 In `experiments/he/data/runs/2024-02-3000mb/`:
* `results-a.jsonl`, `results-b.jsonl` — the Colab results, as received. Never changed.
* `evals.jsonl` — one line per group: position, move, win/draw/loss counts (Black's view), move numbers, `cpWhite` or `mateWhite`, depth, nodes, and which file it came from.
* `evals-manifest.json` — the counts above, and the fingerprints (SHA-256) of both results files, so we can tell if a file changes later.
* `curve.json` — the three versions and their scores, the chosen curve's numbers, the curve every 25 cp with its range, and the band check.
* `curve.svg` — the picture, copied to `new-docs/images/hev-curve-feb.svg`.
* `k.json` — k overall and by size, eval and move number, each with its range and group and game counts.
* `dots.html` — the dot page (HEV.80).

## Next

- Try a curve with its own line for draws (HEV.65), and keep it only if it wins on unseen games.
- Decide the working k (HEV.76).
- The sensitivity check: fit again without time losses and without games that ended soon after the sampled move.
- March 2024: download, jobs, search, import; compare with February.


