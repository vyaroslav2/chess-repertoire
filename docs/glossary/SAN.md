---
tags:
  - glossary
---

### SAN — Standard Algebraic Notation

SAN is the standard text format used to write a chess move.

Examples:

- `e4` — a pawn moves to e4
    
- `Nf3` — a knight moves to f3
    
- `Bxe6` — a bishop captures something on e6
    
- `O-O` — kingside castling
    
- `Qh7+` — the queen moves to h7 and gives check
    
- `Qh7#` — the queen moves to h7 and gives checkmate
     
- `O-O-O#` — queenside castling with checkmate
    
- `Qh3xf1#` — a queen needs full-square disambiguation, captures and gives mate
    
- `exd8=Q+`[^1] — a pawn from the e-file captures something on d8, promotes to a queen, and gives check


SAN describes the **move itself**, not the whole position.

In this project, SAN is also used as the identifier when matching the same move across Masters, Elite and Amateur data. For example, if all three datasets contain `Nf3`, the generator treats them as the same chess move and can then compare the separate statistics attached to `Nf3` in each dataset.

[^1]: #note  In standard SAN, the maximum is 7 characters.
