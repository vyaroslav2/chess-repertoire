# Generator Scenario Runner

The scenario runner executes the production generator against a disposable database while replacing only the scenario inputs.

## Repetition scenarios

Black-response repetition:

```powershell
npm run scenario -- --line "1. Nf3 Nf6 2. Ng1 Ng8" --expect repetition
```

White/OPPONENT repetition:

```powershell
npm run scenario -- --line "1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3" --expect opponent-repetition
```

These modes verify same-route repetition detection, terminal move persistence, nullable destination handling, probability isolation, counters, and event logging. A Black response remains learnable as a flashcard; an OPPONENT move does not create a flashcard.

## Mate scenario

```powershell
npm run scenario -- --line "1. f3 e5 2. g4 Qh4#" --expect mate
```

The prefix moves are scripted. The final response simulates a Lichess mate evaluation (`cp = null`, `mate = -1`) at the evaluator boundary. The production generator then performs persistence and reconciliation.

This mode verifies that the mating response and flashcard are retained, the checkmated destination position is stored, no continuation is created, the mate is displayed as `M1`, the null-CP counter increments, and the destination terminates as game-over rather than as a depth-aborted branch.

The mate mode tests generator integration with a production-shaped evaluator result. The lower-level Lichess payload parser and mate-selection waterfall remain covered by their dedicated evaluator tests.

## Isolation

Every invocation creates a uniquely named SQLite database in the system temporary directory and removes it afterward. The normal development database is not used.

Future modes should reuse this harness and replace only the relevant external boundary—for example a ChessDB mate payload, API failure, or real local-Stockfish evaluation after a scripted prefix.
