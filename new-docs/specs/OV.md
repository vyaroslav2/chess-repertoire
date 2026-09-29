---
tags:
  - reviewed
---
# OV — Overview

OV is the map. It says what the generator is, what one run does, in what order, and which rules hold everywhere. It defines nothing on its own: every figure, field and message belongs to the spec it points at.

## What this is

OV.01 The generator builds one opening repertoire tree for one side. The side is Black; White is the opponent.

OV.02 The two sides are treated differently, and this asymmetry is the whole design:
* **White** — every move popular enough to be worth meeting is kept. One position, many White moves ([[HM]]).
* **Black** — exactly one move is chosen, the move that goes into the repertoire. One position, one Black move ([[EW]]).

OV.03 A run reads from two kinds of source and writes to one place. It reads human game statistics (Lichess Explorer) and engine evaluations (Lichess Cloud Eval, ChessDB, local Stockfish); it writes [[node|nodes]] and moves into the database ([[DB]]). Everything fetched is cached and never fetched twice ([[DB|DB.30]]).

OV.04 A run is a rebuild, not an update. The tree is wiped at the start ([[S2|S2.04]]) and grown again from the root. The caches survive the wipe, which is what makes wiping affordable. There is no reconciliation.[^1]

## The map

OV.05 

| Note                          | Covers                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| [[S0]]                        | Stop-request handling (Ctrl+C)                                                     |
| [[S1]]                        | Start run, lock check, log routing                                                 |
| [[LF]]                        | Lockfile handling                                                                  |
| [[S2]]                        | User, repertoire, wipe, seed the queue                                             |
| [[S3]]                        | The main queue loop                                                                |
| [[EX]]                        | Explorer data: fetching and caching                                                |
| [[HM]]                        | White candidate moves and how they are filtered                                    |
| [[TR.excalidraw\|TR]]         | Transpositions and the probability cascade                                         |
| [[EW]]                        | The engine waterfall and Black's single response                                   |
| [[RE.excalidraw\|RE]]         | The checks that run after Black's response: game over, depth budget                |
| [[HM.excalidraw\|HM diagram]] | The checks on each kept White move: too rare, game over, repetition, transposition |
| [[DB]]                        | What a record contains                                                             |
| [[TGL]]                       | What the run log prints                                                            |
| [[generation-config]]         | Every tunable setting                                                              |
| [[file-naming]]               | How notes, block IDs and log messages are written                                  |
| [[tag-vocabulary]]            | What each tag means, and when to use it                                            |


## One run, in order

OV.06 **Set up.** Register the stop listener ([[S0|S0.01]]). Take the lock ([[S1|S1.02]], [[LF]]). Start logging to the console and to the run log ([[TGL]]).

OV.07 **Seed.** Find or create the user and the repertoire, wipe the old tree, put the root position on the queue with a probability of 100% ([[S2]]).

OV.08 **Loop.** Take a position off the queue. It is always a position with White to move. Everything below happens to that one position, then the loop repeats ([[S3]]).

OV.09 **Ask what White plays here.** Look up the position in the Explorer cache; fetch it from Lichess only if it has never been fetched under this [[cache-profile|cache profile]] ([[EX]]). No games at all means this route ends here.

OV.10 **Keep the White moves worth meeting.** Work out each move's share of games, drop the rare ones into `rareDropped`, and keep the rest ([[HM]]). Each kept move produces a child position with Black to move.

OV.11 **Place the child.** If that position has already been reached by an earlier route, the earlier route owns it: mark the child as a pointer and cascade its probability through to the owner ([[TR.excalidraw|TR]]). No second Black answer is needed there, so the route ends.

OV.12 **Choose Black's move.** For a child the tree owns, score the human candidates, then run the engine waterfall — Lichess Cloud Eval, then ChessDB, then local Stockfish — and pick the single repertoire move ([[EW]]). Whatever an API chose is checked against local Stockfish before it is kept.

OV.13 **Push what comes next.** Playing Black's move gives a position with White to move again. That position is checked before it goes anywhere ([[RE.excalidraw|RE]]): if the game is over, or the position has spent its depth budget ([[generation-config]], `depthBudget`), the route ends here and nothing is queued. Otherwise it goes back on the queue. Every ending is recorded with a reason ([[DB|DB.20]]).

OV.14 **Finish.** The queue empties, or you press Ctrl+C, or something goes wrong. Each ends the run with its own closing tag — `[FINISHED]`, `[STOPPED]` or `[FAILED]` ([[S0|S0.05]]) — and the same cleanup runs either way: disconnect the database, release the lock ([[LF|LF.10]]).

## Rules that hold everywhere

OV.15 **A cached answer is permanent truth.** It never expires. Only a changed [[cache-profile|cache profile]] makes the generator ask again ([[DB|DB.35]]).

OV.18 **Probability is conserved.** Everything that leaves the tree is counted: popularity filtering into `rareDropped`, games missing from Lichess Explorer's answer into `unaccountedDropped`, and cascade remainders into `tinyDroppedTotal`. Endings plus `rareDroppedTotal` plus `unaccountedDroppedTotal` plus `tinyDroppedTotal` must come to 100% at the end of the run ([[S3|S3.11]]). A cascade must not change the sum of all four ([[TR.excalidraw|TR.41]]).

OV.19 **Every Black response is verified by local Stockfish.** `deepVerified` is checked for all of them at the end of a run; a single `false` is a hard error ([[DB|DB.14]]).

OV.20 **A hard error stops the run.** Nothing is repaired, nothing is retried past its configured limit. The partial tree is left on disk and the run closes as `[FAILED]`. A tree from a run that did not close as `[FINISHED]` is treated as corrupt, and that is the user's call, not the code's ([[S0|S0.05]]).

## Out of scope

OV.21 These docs describe generation and storage only. They deliberately say nothing about:
* Spaced repetition and card scheduling. #roadmap
* Reconciliation — abandoned; wipe and rebuild is the only strategy. 
* Wikibooks text, which is kept working in code but not documented. #deferred
* The final UI card order ([[HM|HM.05]] gives sorting, not the finished order). #roadmap
* Reopening a branch when a transposition lifts its depth budget into a deeper band. #roadmap
* Engine evaluation of White moves ([[DB|DB.10]]). #roadmap
* Generating a repertoire for White. The generator builds a Black repertoire only; the White side is postponed. #roadmap

OV.22 Where these notes and the production code disagree, these notes win.[^2]

[^1]: Reconciliation — matching an existing tree against fresh data and patching the difference — was tried and abandoned. Wipe and rebuild is the intended truth ([[S2|S2.04]]).

[^2]: These notes are written as intentions. Some of the existing code is older than these design rules and conflicts with them. When a conflict happens, we don't change the notes — we rewrite the code to match the notes.

