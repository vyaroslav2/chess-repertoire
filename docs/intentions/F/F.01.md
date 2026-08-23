---
tags:
  - processed
---
### F.01 — Get human move data for this chess position

**What the code does**  
This is the entry point to the shared human-move fetching flow.

The caller gives F one chess position as a FEN string:

`fetchAllDatabases(fen)`

F then takes responsibility for returning human move data from three sources:

- Masters;
    
- Elite;
    
- Amateur.
    

The function eventually returns them together as:

`[masters, elite, amateur]`

F.01 itself does not fetch anything yet and does not decide whether the cache or Lichess will be used.

It simply receives the position and starts the shared lookup flow. The next box, [[F.02]], normalises the FEN before any cache lookup or API request is made. ([GitHub](https://github.com/vyaroslav2/chess-repertoire/blob/master/src/lib/api/lichess.ts "chess-repertoire/src/lib/api/lichess.ts at master · vyaroslav2/chess-repertoire · GitHub"))

**Why this matters**  
This gives the rest of the repertoire generator one common way to ask:

> "What human moves have been played from this position?"

The caller does not need to know:

- whether the data is already cached;
    
- which Lichess endpoint provides each group;
    
- whether a request needs retrying;
    
- how cached rows are rebuilt into move data.
    

Those details are handled inside F.

The three returned datasets are later used by the White-move filtering logic and by Diagram B when considering Black responses.

**Why it may have been designed this way**  
Likely: human-data fetching is shared by several parts of the generator, so keeping it in one function avoids duplicating the cache and API logic in each caller.

It also gives Masters, Elite and Amateur data one consistent interface even though they are fetched with different Lichess queries.

**Also affects:**  
[[F.02]]  
[[A3.02]]  
[[B]]

Notes: