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
