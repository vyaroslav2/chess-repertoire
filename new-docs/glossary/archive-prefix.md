---
tags:
  - glossary
  - reviewed
aliases:
  - prefix
---
**Archive prefix** — the first N GB (`--gb`) of a Lichess monthly archive, as downloaded: still compressed, raw and unfiltered. Saved as `downloads/<run>/archive-prefix.pgn.zst`. Its SHA-256 goes in the run's manifest, so anyone can check they have the same bytes.

The archive is in time order, so the prefix holds the month's earliest games. The cut almost always falls inside a game; that last game has no result and is dropped.

The filter reads the prefix and writes the games it keeps to `sample.pgn`:
archive --> prefix --> filter --> `sample.pgn` --> `games` table.

Not the same as `sample.pgn`, which holds only the kept games, uncompressed.
