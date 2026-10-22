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

HEV.30 **Not the curve yet.** This is a plain count: the games put into eval bands, and Black's results in each band. The real curve is a smooth line fitted through the games, not through bands. But the count already shows its shape.

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

## Group sizes

HEV.40 **Most groups have one game.** As in January (HER.21):

| Games in the group | Groups | Games |
| --- | --- | --- |
| 1 | 39,207 | 39,207 |
| 2–9 | 1,471 | 4,486 |
| 10–49 | 127 | 2,336 |
| 50–199 | 26 | 2,364 |
| 200+ | 5 | 1,607 |

One-game groups help the curve only. k is fitted on the 1,629 groups with 2+ games (10,793 games).

HEV.41 **The five biggest groups** are all at Black's move 2, between +23 and +34 cp: 1. d4 d5 2. c4 e6, c6 or dxc4, and 1. e4 c6 2. d4 d5 or 2. Nf3 d5. The scatter check needs another plot (decided 2026-10-10).

## Files

HEV.50 In `experiments/he/data/runs/2024-02-3000mb/`:
* `results-a.jsonl`, `results-b.jsonl` — the Colab results, as received. Never changed.
* `evals.jsonl` — one line per group: position, move, win/draw/loss counts (Black's view), move numbers, `cpWhite` or `mateWhite`, depth, nodes, and which file it came from.
* `evals-manifest.json` — the counts above, and the fingerprints (SHA-256) of both results files, so we can tell if a file changes later.

## Next

- Fit the curve: a smooth line from eval to Black's win/draw/loss.
- Fit k on the groups with 2+ games, and check it by group size.
- The sensitivity check: fit again without time losses and without games that ended soon after the sampled move.
- March 2024: download, jobs, search, import; compare with February.
