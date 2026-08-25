---
tags:
  - in-progress
---
# RM — Repertoire nodes and moves

## Intention

RM owns the database operations for repertoire nodes and repertoire moves.

It should keep the stored repertoire graph internally consistent. Higher-level algorithm logic such as A4 decides _what_ should happen; RM checks that the requested database operation is valid and performs it safely.

The database model distinguishes three related identities:

- `history` / PGN identifies a concrete stored progression
    
- `PositionKey` identifies the chess position shared across transpositions
    
- `routeHistory` identifies one exact route represented by a move edge
    

A repertoire can therefore contain several genuine histories that reach the same chess position, while storing only one canonical node and continuation after the transposition.

## Node identity

`FullFen` is the authoritative chess state for a concrete progression.

`PositionKey` is derived from `FullFen` through [[FN]] and is used for shared-position identity.

The invariant must always hold:

```text
positionKeyFromFen(fullFen) === positionKey
```

Within one repertoire:

```text
repertoireId + history
→ unique concrete progression
```

and:

```text
repertoireId + PositionKey
→ unique canonical chess position
```

Different histories may reach the same `PositionKey`, but they must not create duplicate canonical nodes for that position.

## RM.01–RM.03 — Look up a node

RM provides two node lookups.

### Exact progression lookup

```text
repertoireId + exact history/PGN
→ existing node or nothing
```

This answers:

> "Have we already stored this exact progression?"

### Shared-position lookup

```text
repertoireId + PositionKey
→ existing canonical node or nothing
```

This answers:

> "Has this chess position already been reached through another history?"

RM only performs the lookup. A4 decides whether an existing shared position constitutes a transposition.

Finding a node must never mutate it.

If a `PositionKey` lookup finds an existing canonical node, RM returns it with its existing:

- `FullFen`
    
- `PositionKey`
    
- surviving history/PGN
    
- database identity
    

unchanged. A later transposing route must not overwrite the surviving progression with its own history.

## RM.04–RM.07 — Create a node

Node creation starts from a canonical `FullFen`, never from an already-shortened position key.

RM:

```text
FullFen
→ validate
→ derive PositionKey through FN
→ store both
```

Before creation:

```text
1. derive PositionKey from FullFen
2. look up repertoireId + exact history
3. if absent, look up repertoireId + PositionKey
4. create only if neither exists
```

An unexpected uniqueness conflict is a hard error. Do not silently convert a failed create into an update.

A newly created node stores at least:

```text
repertoireId
fullFen
positionKey
history
cumulativeProb
humanDataSnapshotId
```

The old trap/threat fields are removed.

The node's `humanDataSnapshotId` identifies the human-data snapshot from which its probability state was calculated. Human statistics from one snapshot period must not be silently mixed with another.

## Human-data snapshot

Human statistics are a time-dependent snapshot rather than permanent chess truth.

One human-data snapshot period lasts one week.

During that period:

```text
existing human data from this snapshot
→ reuse

new required position
→ fetch
→ attach current humanDataSnapshotId
```

If the repertoire is deliberately recalculated after that period, start a new snapshot and rebuild from the root with freshly fetched human data for every reached position.

Old human-data snapshots are replaced rather than retained historically.

Reusable engine evaluations are independent of this human-data snapshot and may survive repertoire rebuilds.

## Probability model

Use three probability concepts only.

### `prob`

Local probability of an OPPONENT move at its immediate position.

### `routeProbability`

Probability carried by one exact repertoire route.

This replaces the old name `trueProbability`.

### `cumulativeProb`

Sum of all unique route probabilities reaching one `PositionKey`.

```text
cumulativeProb
= sum of unique routeProbability contributions
```

For example:

```text
root = 1.0

OPPONENT move:
prob = 0.20
routeProbability = 0.20

later OPPONENT move:
prob = 0.50
routeProbability = 0.20 × 0.50
                 = 0.10

another route reaches the same PositionKey:
routeProbability = 0.03

cumulativeProb = 0.10 + 0.03
               = 0.13
```

`routeProbability` is stored on every move edge.

For OPPONENT:

```text
routeProbability
= parent routeProbability × prob
```

For RESPONSE:

```text
routeProbability
= parent routeProbability
```

The RESPONSE therefore carries the same route probability forward explicitly, making the next calculation straightforward.

The root is the one special starting case:

```text
root cumulativeProb = 1.0
```

## `cumulativeProb` ownership

`cumulativeProb` remains stored on the node because generation and depth checks need fast access to it.

However, it is derived data, not an independently editable source of truth.

For every non-root node:

```text
node.cumulativeProb
= sum of routeProbability
  on its unique incoming move routes
```

Callers must not perform:

```text
node.cumulativeProb += x
```

RM owns the operation that updates a route contribution and then recomputes the destination node's total atomically. This prevents the same transposition route from being counted repeatedly on reruns.

## Route identity

Every repertoire move stores:

```text
routeHistory
routeProbability
humanDataSnapshotId
```

`routeHistory` is the full exact history up to and including that edge.

It is immutable.

Within a repertoire:

```text
repertoireId + routeHistory
→ unique route
```

If the history changes, it is a different route: remove the old edge and create the new one.

This is especially important at transpositions.

Example:

```text
Line A
→ reaches X first
→ X becomes canonical
→ A continues after X

Line B
→ has its own nodes and flashcards
→ later reaches the same PositionKey X
→ its final edge points to X
→ B stops there
```

The final B edge keeps B's complete `routeHistory`, even though X retains A's surviving node history.

Therefore:

```text
move.routeHistory
may differ from
toNode.history
```

at a transposition.

## RM.08–RM.12 — Create or update a move

A move edge is identified by:

```text
fromNodeId + UCI/LAN move
```

not SAN.

`toNodeId` is destination data, not part of edge identity.

SAN is persisted only as cached display metadata.

```text
UCI/LAN
→ authoritative

SAN
→ derive from fromNode.fullFen + UCI/LAN
→ cache for UI/logging
```

A stale SAN mismatch is repaired automatically.

An illegal UCI/LAN move or a move that cannot be applied to the source `FullFen` is a hard error.

## Complete move state

Creation and ordinary replacement/update use one complete validated move state rather than arbitrary optional patches.

RM must not silently preserve stale values merely because the current caller omitted them.

```text
build complete state
→ validate
→ write atomically
```

The stored edge must never contain a mixture of old and new semantic state.

A narrowly scoped operation may still exist where its meaning is inherently narrow, for example later filling only the missing exact evaluation of an OPPONENT move.

## Repertoire consistency

RM derives the move's `repertoireId` from `fromNode.repertoireId`.

It verifies:

```text
fromNode.repertoireId
=
toNode.repertoireId
=
move.repertoireId
```

A cross-repertoire edge is a hard error.

`repertoireId` may remain stored on the move as useful checked redundancy, but it is not caller-authoritative.

## OPPONENT or RESPONSE

RM derives `playerTurn` from:

```text
repertoire colour
+ side to move in fromNode.fullFen
```

The caller does not decide it.

The stored value may be retained for convenient querying, but RM derives and validates it whenever the move is created or rewritten.

## Move legality and destination integrity

Before writing an edge, RM verifies both nodes internally:

```text
positionKeyFromFen(fromNode.fullFen)
=== fromNode.positionKey
```

and:

```text
positionKeyFromFen(toNode.fullFen)
=== toNode.positionKey
```

Then RM independently plays the authoritative UCI/LAN move from `fromNode.fullFen`.

The move must be legal for the side to move.

For a normal continuation:

```text
resulting FullFen
=== toNode.fullFen

resulting history
=== toNode.history
```

An already-existing node may be reused as a normal continuation during rerun/resume only if it represents that exact same progression.

For a transposition:

```text
resulting PositionKey
=== toNode.positionKey
```

but:

```text
resulting FullFen
need not equal toNode.fullFen

new routeHistory
need not equal toNode.history
```

because the existing canonical node keeps its own surviving progression.

A transposition target must already exist. The caller/A4 explicitly tells RM whether the edge is a normal continuation or a transposition; RM validates that claim rather than deciding transposition policy itself.

## Transpositions

A transposition is an ordinary repertoire move edge:

```text
fromNodeId
→ move
→ toNodeId = already-existing canonical node
```

There is no duplicate "transposition node".

The later line remains a genuine stored line up to that edge, with its own nodes, flashcards and `routeHistory`. It simply stops once it points into the already-existing canonical position.

The canonical position has:

```text
one PositionKey
one canonical RESPONSE
one flashcard/SRS state
```

A later transposing route inherits that RESPONSE rather than running response selection again.

Its `routeProbability` is added as another unique contribution to the canonical node's `cumulativeProb`.

### Transposition metadata

A canonical node may store `isTransposition = true` when two or more distinct repertoire routes currently reach that node.

This is derived metadata, not permanent historical truth.

`2 or more distinct incoming routes → isTransposition = true`

`0 or 1 distinct incoming route → isTransposition = false`

Whenever a rerun, branch deletion, RESPONSE replacement or other structural change adds or removes an incoming route, RM must update `isTransposition` so that it matches the current graph.

A node must not remain marked as a transposition merely because it was one in an earlier version of the repertoire.

A route that stops because it merges into an already-existing canonical node records `stopReason = "Transposition"` on the incoming transposition edge.

If a later rerun changes that route so that it no longer ends in a transposition, the old `stopReason` must be cleared or replaced.

The stored metadata must always describe the current repertoire structure.

## Probability propagation after a transposition

If a new transposition raises an already-processed node's `cumulativeProb`, merely updating that node is insufficient.

The increase is propagated through the existing downstream structure:

```text
X cumulativeProb increases
→ recompute affected downstream routeProbability values
→ recompute affected descendant cumulativeProb values
→ re-run expansion/depth decisions
```

If this reaches another transposition, update that shared node too and continue through its surviving downstream structure.

Existing moves are not rebuilt just because probability increased. New generation occurs only where the higher probability now justifies additional depth.

## OPPONENT move data

An OPPONENT edge stores:

```text
UCI/LAN move
cached SAN
prob
routeProbability
routeHistory
humanDataSnapshotId
optional cp or mate
optional evaluationSource
```

`prob` is required.

`routeProbability` is required.

An exact engine evaluation is eventually wanted for every OPPONENT move for UI use, but generation does not wait for it.

Initially:

```text
cp = null
mate = null
evaluationSource = null
```

is valid for an OPPONENT move.

A background process may later fill only:

```text
cp / mate
evaluationSource
```

It must re-check that the result still belongs to the same current source node and UCI/LAN move before writing it. A later better exact evaluation may replace the old OPPONENT evaluation without affecting the repertoire structure.

OPPONENT moves do not have:

```text
selectionMethod
moveOrigin
selectionReason
deepVerified
```

in the RESPONSE-selection sense.

## RESPONSE move data

A RESPONSE edge stores:

```text
UCI/LAN move
cached SAN
routeProbability
routeHistory
humanDataSnapshotId

cp or mate
source

selectionMethod
moveOrigin
selectionReason

deepVerified
```

A RESPONSE must have an exact evaluation before it is finalised.

## Evaluation representation

All stored evaluations use one colour-absolute convention.

```text
positive cp
→ better for White

negative cp
→ better for Black
```

Mate uses signed `#N` semantics:

```text
#1  → White mates in 1
#3  → White mates in 3

#-1 → Black mates in 1
#-4 → Black mates in 4
```

Internally `mate` may be a signed integer; `#` is display notation.

`mate = 0` is invalid.

`cp` and `mate` are mutually exclusive:

```text
normal evaluation
→ cp present
→ mate null

forced mate
→ cp null
→ mate non-zero
```

Never convert mate to an artificial centipawn value.

Whenever an evaluation exists, its source is required and written atomically with it.

Controlled source values include:

```text
"Lichess Cloud Evaluation"
"ChessDB"
"Local Deep Stockfish"
"Hardcoded Opening"
```

## RESPONSE provenance

Keep two separate controlled concepts.

### `moveOrigin`

```text
"Human Move"
"Engine Move"
```

"Human Move" means the response came from the human candidate-move list.

"Engine Move" means no human candidate survived and the engine supplied the response.

### `selectionMethod`

```text
"Ordinary API"
"Corrected after Deep Verification"
"Local Engine Fallback"
"Hardcoded Opening"
```

These concepts are independent.

For example:

```text
selectionMethod = "Corrected after Deep Verification"
moveOrigin = "Human Move"
```

is valid if deep verification vetoed the previous response but a different human candidate survived the deep local check.

Likewise:

```text
selectionMethod = "Corrected after Deep Verification"
moveOrigin = "Engine Move"
```

is valid if no human candidate survived and Local Deep Stockfish supplied the replacement.

`selectionReason` also belongs only to RESPONSE moves.

## Source and deep verification

For a newly selected RESPONSE, `source` identifies the evaluation source whose result currently justifies that response.

If the RESPONSE later survives Local Deep Stockfish verification:

```text
same RESPONSE survives tolerance
→ keep original stored evaluation
→ keep original source
→ deepVerified = true
```

Do not overwrite a valid Lichess/ChessDB selection evaluation merely because Local Deep Stockfish produced a different deep score while confirming that the same move remains acceptable.

This preserves useful provenance: the original source/evaluation still explains why that RESPONSE entered the repertoire.

If deep verification vetoes the RESPONSE, replacement is a separate workflow. After user approval, the old RESPONSE and its downstream structure are removed and the approved replacement is created fresh with:

```text
source = "Local Deep Stockfish"
selectionMethod = "Corrected after Deep Verification"
moveOrigin = "Human Move" or "Engine Move"
deepVerified = true
```

depending on whether the new response came from the rebuilt HCM list or from the engine fallback.

## Deep-verification correction

A DV veto does not automatically change the repertoire.

The human candidate list is rebuilt exactly as ordinary generation builds it:

```text
current human-move cache
→ same HCM filtering
→ same HCM ranking/order
```

The API verification layer is skipped.

Local Deep Stockfish assesses the HCMs in that original order.

```text
first HCM that survives local tolerance
→ proposed replacement Human Move

no HCM survives
→ top Local Deep Stockfish move
→ proposed replacement Engine Move
```

The script stops and waits for the user's decision.

If rejected:

```text
→ database repertoire remains unchanged
```

If approved:

```text
→ delete old RESPONSE edge
→ delete everything after it
→ create replacement RESPONSE fresh
→ stop at the replacement
→ later generator run rebuilds the missing continuation
```

No archive or audit copy of the removed subtree is kept.

## Destructive truncation and reruns

The repertoire deliberately favours simple destructive regeneration over complicated preservation logic.

When the selected RESPONSE actually changes:

```text
old RESPONSE
→ delete

everything downstream
→ delete

replacement
→ create

later run
→ rebuild gaps
```

Transposition connections into deleted nodes disappear with the deleted structure.

A missing continuation after such deletion is an ordinary unfinished branch, not corruption.

No persistent `finalised` marker is required.

Every generator rerun re-walks the repertoire using the current configuration and the current human-data snapshot.

If recomputation chooses the same UCI/LAN RESPONSE:

```text
→ keep downstream tree
→ update current source/evaluation/provenance if current recomputation differs
```

If it chooses a different UCI/LAN RESPONSE:

```text
→ delete old RESPONSE + everything downstream
→ create new RESPONSE
→ rebuild
```

Similarly, the stored OPPONENT branch set must match the recomputed set:

```text
still selected
→ keep/recompute

no longer selected
→ delete edge + downstream

newly selected
→ create and generate
```

Repertoire-tree deletion does not delete reusable source caches.

#deferred Cache garbage collection.

## Flashcards and SRS

Flashcard identity follows `PositionKey`, not exact move history.

```text
different histories
→ same PositionKey
→ same training position
→ same flashcard
→ same SRS progress
```

One `PositionKey` must therefore have one canonical RESPONSE.

If a fresh weekly human-data rebuild leaves the same training position and same RESPONSE intact:

```text
→ preserve flashcard
→ preserve all SRS progress
→ update cumulativeProb and other current statistical metadata
```

If repertoire content is removed or the trained RESPONSE changes:

```text
→ remove affected old cards
→ create cards for genuinely new training positions
```

#roadmap Order newly added flashcards by `cumulativeProb`, highest first, so the most probable positions enter the initial learning queue first. After cards enter normal SRS scheduling, day-to-day reviews should follow the SRS schedule rather than `cumulativeProb`.

## Changes from the current RM diagram/code

The present RM diagram/code will eventually need to change substantially:

- replace shortened-FEN-only node storage with canonical `FullFen` + `PositionKey`
    
- add canonical-position lookup by `repertoireId + PositionKey`
    
- enforce unique `repertoireId + PositionKey`
    
- remove trap/threat fields
    
- add `humanDataSnapshotId`
    
- change move identity from `fromNodeId + SAN` to `fromNodeId + UCI/LAN`
    
- keep SAN only as derived cached metadata
    
- rename `trueProbability` to `routeProbability`
    
- store `routeProbability` and full `routeHistory` on every move edge
    
- make `repertoireId + routeHistory` unique
    
- derive `playerTurn` and move `repertoireId` rather than trusting caller values
    
- replace source-specific repertoire evaluation fields with generic `cp`, `mate` and controlled `source`
    
- add RESPONSE provenance fields `selectionMethod` and `moveOrigin`
    
- use complete validated atomic move writes instead of loose optional-field upserts
    
- centralise route contribution updates and `cumulativeProb` recomputation in RM
    

The current implementation still creates nodes from `normalizeFen`, identifies move upserts by `fromNodeId + san`, and permits partial move data that leaves omitted old fields untouched, so the intended RM architecture is materially different from the present implementation.