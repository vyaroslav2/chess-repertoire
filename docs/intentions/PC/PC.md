---
tags:
  - processed
---
### PC — Get or create the cached record for a chess position

**What the code does**  
PC receives:

- a FEN;
    
- optionally, opening metadata containing ECO and opening name;
    
- optionally, the move history that led to the position.
    

It first normalises the FEN and looks for an existing `PositionCache` row using that normalised FEN as the key.

The normalised FEN keeps the position-defining fields and removes the move counters, so different histories can share the same global cache row when they reach the same chess position.

If no `PositionCache` row exists, PC creates one.

Before creation, if move history was supplied, it asks Wikibooks for an opening description using that history.

The new row then stores:

- the normalised FEN;
    
- ECO, if supplied;
    
- opening name, if supplied;
    
- Wikibooks text, if found.
    

If no move history was supplied, Wikibooks is not queried.

So a newly created position can legitimately begin with:

```text
ECO: null
openingName: null
wikiText: null
```

and still be a valid global position-cache row.

---

If the row **already exists**, PC checks whether:

- opening metadata was supplied;
    
- that metadata contains an opening name;
    
- the cached row currently has no opening name.
    

Only if all three are true does PC update the existing row.

Before that update, if:

- `wikiText` is still missing;
    
- and move history is available,
    

PC asks Wikibooks for opening text.

It then updates:

- ECO;
    
- opening name;
    
- Wikibooks text, preserving existing text if it already had some.
    

If the existing row **already has an opening name**, PC returns it unchanged.

That means later calls do not replace the existing opening name or ECO with newly supplied metadata, even if the new information came from a different move order.

It also means a position that already has an opening name but still has `wikiText: null` does **not** get another Wikibooks attempt, because the whole update branch is entered only when the opening name is missing.

The helper finally returns either:

- the newly created row;
    
- the updated existing row;
    
- or the unchanged existing row.
    

---

**Where PC is currently called**  
The diagram notes four calls, all from the generator:

1. for the starting position, without opening metadata or move history;
    
2. for the position currently being expanded, with opening metadata and history;
    
3. after White's move, with history but no opening metadata;
    
4. after Black's move, with history but no opening metadata.
    

That means many positions are first created **before** opening metadata is available.

For example:

```text
position after ...Nf6
    ↓
created in PC during A4
    ↓
openingName = null
ECO = null
possibly wikiText exists
    ↓
later position comes off queue
    ↓
F gets Masters data
    ↓
PC is called again with opening metadata
    ↓
missing name/ECO can now be filled
```

This is why PC supports updating an existing row rather than only creating it once.

**Why this matters**  
`PositionCache` is intended to hold information that belongs to the chess position globally rather than to one repertoire.

So information such as:

- full/normalised position identity;
    
- ECO;
    
- opening name;
    
- Wikibooks description;
    
- human-data caches;
    
- engine evaluations;
    

can be reused when different repertoires or different move orders reach the same position.

PC is therefore part of the shared-position layer, not the repertoire tree itself.

That matches the architecture we already settled on: repertoire paths and training cards belong to a repertoire, while stable information about a chess position belongs in a global position record.

**Why it may have been designed this way**  
Likely: positions are often first encountered while generating a continuation, before all descriptive metadata is available.

Creating the global cache row immediately lets other data attach to the position, while a later expansion can fill in ECO and opening name when Masters metadata becomes available.

Using normalised FEN as the shared key prevents the same board state being duplicated merely because it was reached on a different move number.

**Also affects:**  
[[F]]  
[[A1]]  
[[A4.07]]  
[[A4.24]]  
[[A4.33]]  
[[A4.34]]  


Notes:

#note Opening name and ECO are metadata for the chess position itself. Each distinct position/FEN should store the opening identity returned for that position, so as the game progresses and the board changes, the saved opening name can become progressively more specific. The UI will use this position-level metadata when displaying the repertoire tree.

#bug PC only fills `openingName` and ECO when the cached position has no opening name. Once a name exists, later metadata for that same position is ignored. The intended model is that opening metadata belongs to the position/FEN and should reflect the authoritative opening information for that position. PC should be able to update the stored opening name and ECO when valid metadata for that position is obtained, rather than permanently keeping whichever name happened to be stored first.