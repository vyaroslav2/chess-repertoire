---
tags:
  - glossary
  - reviewed
aliases:
  - gauge
  - eval bar
  - thermometer
---
**Eval gauge** — the bar between the board and the move list. It shows the [[eval]] of the position on the board as winning chances, not as pawns. A copy of Lichess's.

* **What the fill means:** White's share of the bar is White's chance of winning, as Lichess estimates it from real games. 50% is level. The share comes from the eval through an S-shaped curve:
  `White's share = 50 + 50 × (2 / (1 + e^(−0.00368208 × cp)) − 1)`, with cp in [[centipawn|centipawns]].
* **The marks:** they split the bar into eighths of winning chances, not pawns. So they fall at odd evals:


|Mark|White’s share|Eval|
|---|---|---|
|middle|50%|0.00|
|1st|62.5%|±1.39|
|2nd|75%|±2.98|
|3rd|87.5%|±5.28|


  ±3 sitting on a mark is a coincidence.
* **Each pawn counts for less:** 0 → 1 moves the bar 9.1 points, 1 → 2 moves it 8.5, 2 → 3 moves it 7.5, and 5 → 10 only 11 in all. Going from +1 to +2 changes a game far more than going from +8 to +9.
* **Never full:** evals are capped at ±10, which fills 97.5%. A mate goes a little further: mate in 10 or more fills 98.3%, mate in 1 fills 99.9%.
* **No eval:** a position without one (the start, a wrong move) keeps the last fill, at half strength.
* **Flipped:** it turns over with the board. From Black's side, White's share is at the top.
