---
tags:
  - processed
---
### F.02 — Normalise the FEN

**What the code does**  
F takes the full FEN it received in [[F.01]] and normalises it before using it for cache lookups.

The normalised FEN keeps only the first four FEN fields:

- piece placement;
    
- side to move;
    
- castling rights;
    
- en-passant state.
    

It removes:

- the halfmove clock;
    
- the fullmove number.
    

So, for example:

`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`

becomes:

`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -`

The helper used for this is the same normalisation convention used elsewhere in the project for shared position-cache identity.

F then uses this normalised FEN when checking whether human-move data has already been cached for the position.

After that, the algorithm continues to [[F.03]].

**Why this matters**  
Human move data should belong to the chess position itself, not to the move counters in the FEN.

The halfmove clock and fullmove number do not change which legal moves or opening statistics belong to the board position.

Removing those two fields therefore prevents duplicate cache entries for positions that are strategically identical but reached with different counters.

Keeping castling rights and en-passant state is important because those can change the legal moves available from the position.

**Why it may have been designed this way**  
Likely: the cache needs one stable key for equivalent chess positions.

Using the four meaningful position-state fields gives the cache that stable identity while ignoring counters that are irrelevant to human move statistics.

**Also affects:**  
[[F.01]]  
[[F.03]]  
[[A4.08]]

Notes: