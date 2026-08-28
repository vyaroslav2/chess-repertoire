---
tags:
  - note
  - roadmap
---
# LOG – Transparency of Engine and Score Selection

## Status

Known: The user requires complete transparency into how White's candidate moves and Black's responses are selected and evaluated by the generator.

Currently, the terminal output (and the saved markdown log files) print summaries like:
Evaluating White Move: Nc3 (Reason: Amateur popularity, Prob: 13.2%)
Black responds with: d5 -> Score: 48.0% | Weighted Vol: 26 | Lichess Cloud Evaluation Eval: 0.40

This does not provide enough diagnostic information about *why* a move was picked, what the engine ranges were, or what alternative evaluations looked like before a decision was made.

## Intended Behaviour

Everything that is used for score calculation and move selection must be explicitly printed to the terminal and written to the run log (docs/logs/treegen-*.md). 

The generator must act as a fully transparent pipeline, exposing the raw data that feeds into its decisions.

### White's Moves
When White's moves are fetched and filtered, the log must explicitly print:
- The time control parameters applied (e.g., Blitz, Rapid, Classical)
- The rating limits/filters applied (e.g., Masters, Elite bounds, Amateur bounds)
- The raw statistics that fed into the probability calculation.

### Black's Responses
When evaluating Black's responses, the log must explicitly trace the engine verification waterfall, printing:
- **Lichess Cloud Evaluations**: The raw CP or Mate scores returned.
- **ChessDB Evaluations**: The raw evaluations pulled from ChessDB.
- **Local Deep Stockfish**: When the local fallback or local verification is triggered, the engine's exact search constraints (depth/nodes/time) and the resulting evaluations.

By logging this full diagnostic trail, a reader can exactly reproduce and verify the generator's internal decision-making without having to rely on opaque summaries.

### Transpositions and repetitions

Transpositions and same-route repetitions are different events and must never share an ambiguous `Skipped` counter.

The live and final diagnostics must maintain separate counters:

```text
Transpositions: +1 => N total
Repetition Stops: +1 => N total
```

Every transposition event must print the incoming route, the canonical route it merged into, and that the canonical Black response/continuation was reused rather than evaluated twice.

Every repetition event must print the complete terminal route, the earlier route position that it repeated, the terminal move, the actual terminal route probability, and that the move was retained while no destination or continuation was created.

A RESPONSE move that completes a repetition remains the target of the flashcard attached to its source position. Playing that answer completes the card and ends the route. An OPPONENT move that completes a repetition is retained as structural route evidence but does not create a new RESPONSE card.
