---
tags:
  - processed
---
### F — Get human move data

**What the code does**  
F receives one chess position as a FEN string and returns three human-move datasets:

- Masters;
    
- Elite;
    
- Amateur.
    

The function first normalises the FEN to the four position-defining fields:

- piece placement;
    
- side to move;
    
- castling rights;
    
- en-passant state.
    

The halfmove clock and fullmove number are removed.

This normalised FEN is then used both:

- as the human-move cache key;
    
- in the Lichess Explorer requests.
    

The generator reads cached rows for all three databases:

- `"masters"`;
    
- `"elite"`;
    
- `"amateur"`.
    

The cache is used only if **all three** have at least one cached row.

An `_EMPTY_` placeholder counts as a cached row, so a database that was successfully queried but genuinely returned no moves can still count as complete.

If all three databases are cached, F rebuilds their move lists from the cache.

Rows whose SAN is `_EMPTY_` are ignored when rebuilding the actual move list.

For each cached move it restores:

- SAN;
    
- White wins;
    
- draws;
    
- Black wins;
    
- total games for that move.
    

It also calculates each database's `totalGames` by adding the cached game counts of its moves.

The three rebuilt datasets are then returned immediately. No Lichess requests are made.

There is one loss of information on this cache path: the reconstructed Masters result contains the moves and counts, but not the Masters `opening` object. So the opening name and ECO code supplied by a fresh Masters response are not reconstructed from this human-move cache.

If even **one** of Masters, Elite or Amateur has no cached rows, F does not use the other two cached datasets.

Instead, it prepares empty in-memory defaults for all three and starts fetching all three again.

For **Masters**, F asks the Lichess Masters Explorer for the normalised position.

If a response is returned, it:

- keeps the returned Masters data;
    
- sets `totalGames` to White wins + draws + Black wins;
    
- caches every returned move separately.
    

For every move, its cached games count is likewise calculated as:

White wins + draws + Black wins.

If the Masters request succeeds but its move list is empty, F saves one `_EMPTY_` row instead.

If the request ultimately fails or returns no usable data, it saves nothing for Masters and leaves the empty in-memory default in place.

F then waits **1 second**.

For **Elite**, F asks the normal Lichess Explorer for:

- classical games;
    
- rapid games;
    
- rating band `2500`.
    

It handles the result in the same way:

- calculate `totalGames`;
    
- cache each SAN move and its White/draw/Black counts;
    
- or save `_EMPTY_` if the request succeeded but returned no moves.
    

If the request fails or returns nothing, nothing is cached and the default empty result remains.

F waits another **1 second**.

For **Amateur**, F asks the Lichess Explorer for:

- classical games;
    
- rapid games;
    
- ratings `1600`, `1800` and `2000`.
    

It again:

- calculates `totalGames`;
    
- caches every returned move;
    
- saves `_EMPTY_` for a successful response with no moves;
    
- saves nothing if the request fails or returns nothing.
    

There is no extra wait after Amateur because F returns immediately afterwards.

The function finally returns:

`[masters, elite, amateur]`

The returned data can therefore be mixed.

For example:

- Masters may contain real data;
    
- Elite may be empty because its request failed;
    
- Amateur may contain real data.
    

F itself does not distinguish that failure-empty result from genuine usable empty data in its return type.

**Why this matters**  
F is the shared source of human move statistics for the repertoire algorithm.

A3 uses the returned human data to decide which White moves survive into the repertoire, while Diagram B uses human statistics when choosing the repertoire's Black response.

The cache prevents the generator from repeatedly querying Lichess for positions whose data has already been collected.

The three datasets deliberately represent different playing populations:

- Masters: Lichess Masters database;
    
- Elite: 2500-rated Lichess players, classical and rapid;
    
- Amateur: 1600, 1800 and 2000-rated Lichess players, classical and rapid.
    

Blitz and bullet games are excluded from both Elite and Amateur.

There is also a deliberate-looking gap between those groups: ratings between 2200 and 2499 are not requested by either Elite or Amateur.

The `_EMPTY_` rows are important because they distinguish:

> "We successfully checked this database and there were no moves"

from:

> "We have never successfully cached this database."

Without the placeholder, a genuine zero-move result would look permanently uncached and would be fetched again on every run.

**Why it may have been designed this way**  
Likely: F was designed to give the rest of the generator one simple interface for all human statistics while hiding the cache, request parameters and retry behaviour.

Requiring all three cache groups before using the cache also keeps the returned datasets from silently combining old cached data with newly fetched data.

However, this simplicity comes at a cost: a single failed source causes future calls to fetch all three sources again rather than reusing the two successful ones.

Likely: the one-second waits were added to reduce pressure on the Lichess Explorer API. Unlike the delay we found in [[A4.29]], these waits occur **between the actual external requests**, so they are positioned where rate limiting can have an effect.

**Also affects:**  
[[A3.02]]  
[[A3.05]]  
[[B]]  
[[FR]]  
[[PC]]

Notes:


#bug F currently sends the normalised four-field FEN to Lichess Explorer. API requests should use the full six-field FEN; normalised FEN should be reserved for local shared-position/cache identity.

#bug If a required human-data fetch still fails after retries are exhausted, generation must stop with a hard error. The current code can treat a failed request as an empty dataset, making failure indistinguishable from a genuine zero-result response and allowing repertoire decisions to be made from incomplete data.

#bug Re-fetching a human-data bucket does not replace its previous cached move set. Returned SANs are upserted individually, so old SAN rows absent from the latest response can remain stale. A successful fresh fetch should replace the complete cached snapshot for that exact bucket.

#bug The current 1-second spacing between Lichess Explorer requests is too short for the intended 25-requests-per-minute limit. Rate limiting should be centralised at the actual Lichess request layer and use approximately one request every 3 seconds, including granular requests and retries. https://lichess.org/@/thibault/blog/the-opening-explorer-now-requires-authentication/FSWh9Zg3

#roadmap Granular human-data cache. Replace the coarse Amateur/Elite/Masters storage with per-bucket caching, where a bucket is one rating band and one time control. The current algorithm keeps using its intended subset; the finer data underneath serves future needs. Six parts:

- Store Explorer data as independent rating/time-control buckets, not the current coarse groups.

- Collect a broad global set once: rating bands from 1000 up, across ultrabullet, bullet, blitz, rapid and classical where supported. Exclude correspondence and the 400 band.

- Treat Amateur (1600/1800/2000) and Elite (2500) as views assembled from the granular buckets rather than as the stored datasets. Masters stays a separate source.

- Track each bucket's state independently: populated, successfully empty, missing, or failed — all distinct. An _EMPTY_ marker applies only to the exact bucket that was queried and came back empty.

- Ordinary generation fills only missing buckets. Refreshing an already-complete bucket is a separate, explicit action, not a side effect of some other bucket being missing.

- Let future repertoire configuration pick rating ranges and time controls from the cached granular data without a new crawl.

Depends on the stale-upsert and all-or-nothing bugs above being resolved, since both concern how a bucket is cached and refreshed.

#note ECO, opening name and Wikibooks text belong to the shared global position cache rather than the human-move cache. Their persistence/reuse is covered by the position-cache design.

#note totalGames can be reconstructed by summing the game counts of all SAN moves returned for a bucket.

#note A successful API response with no moves should be cached explicitly so it is distinguishable from missing or failed data.

#note The production Amateur calculation currently uses ratings 1600, 1800 and 2000. The 2200 band is intentionally not used. Elite 2500 and Masters serve separate purposes, including reply selection and Master Threat detection.

#note Blitz and bullet are not used by today's Amateur/Elite repertoire calculation, but the future granular cache should collect them. Correspondence is deliberately excluded.

