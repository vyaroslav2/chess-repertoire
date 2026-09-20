---
aliases:
tags:
  - in-progress
  - glossary
---
The first four FEN fields, with the halfmove clock and fullmove number removed.

```
full FEN:
rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1

normalised FEN:
rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -
```

We're ignoring the threefold and fifty-move rules by design. `positionKey` drops the clocks, so the same position gets the same answer whether it's its first or third occurrence.