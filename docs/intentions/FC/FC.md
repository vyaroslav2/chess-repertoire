---
tags:
  - processed
---
### FC — Save one human move cache row

**What the code does**  
FC receives one human-move cache record from F.

The caller provides:

- the position;
    
- the database/source type;
    
- the SAN move;
    
- total games for that move;
    
- White wins;
    
- draws;
    
- Black wins.
    

Before storing anything, FC normalises the FEN again.

This is redundant when FC is called from F, because F has already normalised the position before passing it in. Running `normalizeFen()` twice does not change the result, so this is harmless duplication rather than a behavioural problem.

FC then identifies a cache row using the combination:

```text
normalised position
+ database type
+ SAN move
```

That combination is the unique key.

So, for example:

```text
position X
+ amateur
+ e4
```

is a different cache entry from:

```text
position X
+ amateur
+ d4
```

and also different from:

```text
position X
+ elite
+ e4
```

If a row with that exact key already exists, FC updates only its four numerical values:

- games;
    
- White wins;
    
- draws;
    
- Black wins.
    

The position, database type and SAN do not change because they are the identity of the row itself.

If no matching row exists, FC creates a new one containing:

- the normalised position;
    
- database type;
    
- SAN;
    
- games;
    
- White wins;
    
- draws;
    
- Black wins.
    

The operation is implemented as a database `upsert`, meaning "update if this exact row exists; otherwise create it".

After that, the individual cache row is saved and control returns to F.

FC is called once for every move returned by a successful human-data fetch.

It is also called once with the special SAN:

`_EMPTY_`

when F successfully checks a source but gets no moves. That placeholder lets F remember that the source was genuinely checked and empty rather than simply never fetched.

**Why this matters**  
FC is the low-level writer for the human Explorer cache.

Its job is deliberately narrow:

> save or update one move from one human-data source for one position.

It does not know what "Amateur" or "Elite" means statistically, and it does not calculate probability.

It simply persists the raw counts that F later reconstructs into human-move datasets.

Those raw counts are enough to calculate locally:

```text
moveGames = White wins + draws + Black wins
```

and later:

```text
move popularity = moveGames / totalGames
```

So there is no need for FC to store a separate probability value.

**Why it may have been designed this way**  
Likely: one row per SAN makes individual moves easy to read and update without storing a whole Explorer response as one large object.

The upsert also makes repeated writes of the same SAN straightforward: if Lichess returns fresh counts for `e4`, those numbers replace the old `e4` numbers.

**Also affects:**  
[[F]]

Notes:

#note The key thing to remember about FC is: **it saves one row, not one complete Lichess response**. That is why the stale-row bug cannot really be solved by tweaking the current upsert alone; F/FC need a bucket-level "replace snapshot" operation.