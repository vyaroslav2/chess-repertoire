---
tags:
  - processed
---

# DB — Database structure and ownership

## Intention

The database should separate four different kinds of data clearly:

```text
permanent chess-position identity
repertoire-specific tree structure
temporary human-data snapshots
reusable engine evaluations
```

These parts may refer to the same chess position, but they have different lifetimes and must not accidentally delete or invalidate one another.

The current database mixes some of these responsibilities. In particular, `PositionCache` currently owns `RepertoireNode` rows through a cascading foreign key, so deleting cached position data can delete repertoire structure and study data. That ownership direction is not intended.

## DB.01 — User

One row represents one user.

Stores:

```text
id
username
```

A user may own many repertoires.

## DB.02 — Repertoire

One row represents one independent repertoire and study set.

Stores at least:

```text
id
title
colour: White or Black
user
```

A repertoire always starts from the normal chess starting position.

There is no custom starting-position mode.

The repertoire colour is fixed for the lifetime of that repertoire:

```text
White repertoire
→ White moves are RESPONSE
→ Black moves are OPPONENT

Black repertoire
→ Black moves are RESPONSE
→ White moves are OPPONENT
```

If the opposite colour is wanted, that is a different repertoire.

SRS progress is also repertoire-specific. Two repertoires may happen to contain the same `PositionKey + RESPONSE`, but they still have separate cards and study progress.

### Human-explorer settings

#roadmap Rating-range, time-control and similar human-explorer settings are future repertoire-definition options and are out of scope for the current implementation.

When those options eventually exist, a different set of human-explorer settings should be treated as a different repertoire/study set rather than modifying an existing repertoire in place.

## DB.03 — Position

Replace the current disposable `PositionCache` concept with a permanent global `Position`.

One row represents one unique [[position-key]] across the whole application.

```text
Position
→ global
→ one row per PositionKey
```

Stores:

```text
PositionKey
ECO, if known
openingName, if known
```

`ECO` and `openingName` belong to the unique normalised position and therefore live here.

Wikibooks text does **not** belong here. Wikibooks information is history-specific and follows the behaviour already established in [[W]].

### Lifetime

A `Position` is permanent shared chess identity.

Deleting:

```text
a repertoire
a repertoire node
a branch
a flashcard
human cache data
```

must not delete the `Position`.

Likewise, deleting human cache data must not delete reusable engine evaluations attached to that position.

The intended relationship is:

```text
Position
→ shared chess identity

RepertoireNode
→ repertoire structure that uses that position

human cache
→ temporary statistics about that position

engine cache
→ reusable evaluations of that position
```

None of those cache lifetimes should own the repertoire tree.

## DB.04 — HumanDataSnapshot

One row represents one coherent period of human-explorer data for one repertoire.

Stores at least:

```text
id
repertoireId
startedAt
```

When explorer population settings are eventually implemented, the snapshot also records the exact frozen settings used for that dataset.

A snapshot belongs to one repertoire, not globally to every repertoire.

This is necessary because human move statistics may later depend on repertoire-specific choices such as:

```text
rating range
time controls
other explorer filters
```

Two repertoires may therefore legitimately have different human statistics for the same `PositionKey`.

### Snapshot lifetime

A human snapshot is reusable for **one week or longer**.

Seven days does not mean:

```text
168 hours reached
→ data instantly expires
```

Instead:

```text
snapshot age < 7 days
→ definitely reuse

snapshot age >= 7 days
→ eligible for replacement
→ keep using until a deliberate fresh build starts
```

This prevents a repertoire generation from crossing an expiry boundary halfway through and mixing two human datasets.

When a fresh snapshot is deliberately started:

```text
delete all old human move data for this repertoire
→ create new HumanDataSnapshot
→ start generation from root
→ fetch human data as positions are reached
→ attach everything to the new snapshot
```

If generation stops halfway through, that simply means the new snapshot is incomplete. Missing positions are fetched when generation resumes.

There is no need to preserve the previous human snapshot as a fallback copy.

## DB.05 — HumanExplorerFetch

One row records that one human database was successfully queried for one position under one snapshot.

Conceptually:

```text
Position
+ HumanDataSnapshot
+ database type
→ successful fetch record
```

Database type:

```text
Masters
Elite
Amateur
```

This replaces the fake `_EMPTY_` move.

The distinction becomes:

```text
no HumanExplorerFetch
→ this source has not been fetched
```

```text
HumanExplorerFetch exists
+ zero human move rows
→ source was fetched successfully
→ genuinely no moves were returned
```

```text
HumanExplorerFetch exists
+ move rows exist
→ source was fetched successfully
→ use those moves
```

The successful fetch marker and its move rows represent one complete fetch result.

## DB.06 — ExplorerMoveCache

One row stores the human-game statistics for one actual chess move returned by one human database.

Identity:

```text
Position
+ HumanDataSnapshot
+ database type
+ UCI/LAN move
```

Stores:

```text
UCI/LAN move
SAN
games
White wins
draws
Black wins
```

Human explorer APIs may return SAN.

The cache converts that SAN to UCI/LAN using the exact source position before storing the move.

```text
API SAN
→ validate against Position
→ convert to UCI/LAN
→ UCI/LAN becomes authoritative identity
→ keep SAN as source/display text
```

This keeps human-cache move identity consistent with the rest of the project.

If even one returned SAN cannot be legally converted from the exact source position:

```text
→ reject the complete database fetch
→ store none of its move rows
→ do not mark the fetch successful
→ report/log the invalid response
```

Do not silently drop one broken move and preserve a partial statistical dataset.

### Lifetime

Human move rows are temporary.

They belong to one `HumanDataSnapshot`.

Starting a fresh snapshot for that repertoire removes the previous human move cache.

They are reusable only within the lifetime of their snapshot.

## DB.07 — RemoteEngineEvalCache

Remote engine/API evaluations are independent of human snapshots and are reusable indefinitely.

This cache is for remote sources such as:

```text
Lichess Cloud Evaluation
ChessDB
```

One current entry is kept per:

```text
Position
+ UCI/LAN move
+ source
```

The cache keeps the latest available evaluation for that source rather than preserving historical versions.

Stores conceptually:

```text
Position
UCI/LAN move
SAN, if useful
cp or mate
rank, if supplied/useful
source
sourceVersion, if the provider exposes one
```

`sourceVersion` is metadata, not part of cache identity.

If a newer result from the same source is stored:

```text
same Position
+ same move
+ same source
→ replace old result
→ retain newest result
```

Engine evaluations have no routine expiry.

Human snapshot refreshes do not delete them.

## DB.08 — RemoteEngineFetch

Remote engine/API fetch status is tracked independently from stored evaluation rows.

Conceptually:

```text
Position
+ source
→ successfully fetched
```

This distinguishes:

```text
not fetched
```

from:

```text
fetched successfully but nothing usable returned
```

Local Deep Stockfish does not participate in this remote-fetch status.

This also prevents the old behaviour where the existence of some unrelated engine-cache row could incorrectly suppress a needed API fetch.

## DB.09 — LocalDeepEvalCache

Local Deep Stockfish has a separate cache because its result has a different meaning and shape from remote engine rows.

Only **deep** local Stockfish results are stored.

There is no shallow local-engine cache.

One Local Deep Stockfish result always contains two explicit evaluations:

```text
checked move
+ checked move evaluation

top move
+ top move evaluation
```

They belong together.

Stores conceptually:

```text
Position

checked UCI/LAN move
checked cp or mate

top UCI/LAN move
top cp or mate

Stockfish version
```

If the checked move itself is also Stockfish's top move, both halves are still stored explicitly:

```text
checked move = e7e5
checked evaluation = +0.20

top move = e7e5
top evaluation = +0.20
```

Do not rely on implied equality.

A Local Deep Stockfish cache entry is invalid if either half is missing.

### Version behaviour

The cache keeps one current Local Deep Stockfish result per checked position/move.

If the local engine version changes and the move is evaluated again:

```text
old result
→ replaced

new result
→ stored with current Stockfish version
```

Historical engine versions are not retained as separate cache records.

## DB.10 — RepertoireNode

One row represents one genuine stored progression in one repertoire.

Stores conceptually:

```text
id
repertoireId

FullFen
PositionKey
exact history/PGN

cumulativeProb
humanDataSnapshotId
```

The old:

```text
isAmateurTrap
isMasterThreat
```

fields are removed from the intended node model.

### FullFen and PositionKey

A node stores both:

```text
FullFen
→ authoritative concrete progression state

PositionKey
→ shared chess-position identity
```

The invariant is:

```text
positionKeyFromFen(fullFen) === positionKey
```

The node must not reconstruct its `FullFen` from a shortened position key.

### Exact history

Keep the exact PGN/history on every `RepertoireNode`.

This is useful for:

```text
exact progression lookup
debugging
history-specific behaviour
Wikibooks
transposition handling
```

The graph of move edges represents the repertoire structure, but the node's exact history remains valuable persistent state.

### Identity

Within one repertoire:

```text
repertoireId + exact history
→ exact progression lookup
```

and:

```text
repertoireId + PositionKey
→ one canonical shared chess position
```

Different histories may reach the same `PositionKey`.

The first surviving progression owns the canonical node from the transposition point onward.

A later line:

```text
keeps all of its genuine nodes before the merge
→ reaches the existing PositionKey
→ final edge points to existing canonical node
→ duplicate continuation stops
```

### Cache independence

`RepertoireNode` must not be destructively owned by `Position` or any cache row.

Deleting cached data must never cascade into:

```text
repertoire nodes
repertoire moves
flashcards
SRS progress
```

### cumulativeProb

`cumulativeProb` remains physically stored on the node for fast access.

It is derived from incoming route probabilities:

```text
node.cumulativeProb
= sum of incoming unique routeProbability contributions
```

The root is the special starting case:

```text
root cumulativeProb = 1.0
```

The incoming route data is the source of truth; the node field is a cached aggregate.

## DB.11 — RepertoireMove

One row represents one move/edge between two repertoire nodes.

Stores conceptually:

```text
id
repertoireId

fromNodeId
toNodeId

UCI/LAN move
cached SAN

playerTurn:
OPPONENT or RESPONSE

routeHistory
routeProbability
humanDataSnapshotId
```

A move is identified by:

```text
fromNodeId + UCI/LAN move
```

not SAN.

SAN is derived/cached display metadata.

### routeHistory

Every move edge stores its full `routeHistory`.

Within a repertoire:

```text
repertoireId + routeHistory
→ unique exact route
```

`routeHistory` is immutable.

If the route history changes:

```text
old edge
→ remove

new history
→ create different edge
```

At a transposition:

```text
move.routeHistory
may differ from
toNode.history
```

because the later transposing route keeps its own exact history on the incoming edge while the target node keeps the surviving canonical history.

### routeProbability

Rename the old `trueProbability` concept to:

```text
routeProbability
```

Every move edge stores it.

For an OPPONENT move:

```text
new routeProbability
= parent routeProbability × prob
```

For a RESPONSE:

```text
new routeProbability
= parent routeProbability
```

The RESPONSE explicitly carries the probability forward so the following OPPONENT move can read it directly from its parent edge.

### OPPONENT-specific data

An OPPONENT edge stores:

```text
prob
routeProbability
```

and may eventually have:

```text
cp or mate
source
```

for UI evaluation.

Missing OPPONENT evaluation is not a repertoire-generation error.

### RESPONSE-specific data

A RESPONSE edge stores its exact selected evaluation and provenance:

```text
cp or mate
source
selectionMethod
moveOrigin
selectionReason
deepVerified
```

`source` is the source whose evaluation currently justifies the selected RESPONSE.

Controlled `selectionMethod` values include:

```text
"Ordinary API"
"Corrected after Deep Verification"
"Local Engine Fallback"
"Hardcoded Opening"
```

Controlled `moveOrigin` values:

```text
"Human Move"
"Engine Move"
```

`deepVerified = true` means the exact current stored RESPONSE has survived Local Deep Stockfish verification.

## DB.12 — Evaluation representation

All stored repertoire and engine evaluations use one project-wide sign convention.

Centipawns:

```text
positive
→ better for White

negative
→ better for Black
```

Mate:

```text
positive mate
→ White mates

negative mate
→ Black mates
```

Examples:

```text
#1
→ White mates in 1

#-3
→ Black mates in 3
```

`mate = 0` is invalid.

For any one evaluation:

```text
cp present
→ mate absent
```

or:

```text
mate present
→ cp absent
```

Never convert mate into an artificial centipawn value.

## DB.13 — Transposition structure

A transposition is not represented by a special transposition node.

It is an ordinary `RepertoireMove` whose:

```text
toNodeId
```

points to an already-existing canonical node with the reached `PositionKey`.

Example:

```text
Line A
→ ... → X → Y → Z

Line B
→ ... → final edge → X
→ B stops
```

Line B remains a genuine stored line before X.

Its final edge stores B's own:

```text
routeHistory
routeProbability
```

while X keeps A's surviving node history.

There is only one continuation after X.

## DB.14 — RepertoirePositionStat / flashcard

A flashcard is a repertoire-specific training item.

Its stable chess identity is:

```text
repertoireId
+ PositionKey
+ target RESPONSE UCI/LAN
```

It must **not** depend for its existence on a particular:

```text
RepertoireNode.id
RepertoireMove.id
```

because tree rows may be reorganised or recreated while the learned item itself remains unchanged.

### Same training item

If regeneration produces:

```text
same repertoire
+ same PositionKey
+ same RESPONSE
```

then:

```text
keep existing card
keep all SRS progress
do nothing
```

### RESPONSE changed

If regeneration produces:

```text
same PositionKey
+ different RESPONSE
```

then the move the user has to play has changed.

Therefore:

```text
delete old card
→ create new card
→ fresh SRS state
```

Do not simply point the old SRS record at the new response.

### Separate repertoires

Even if two repertoires contain identical:

```text
PositionKey + RESPONSE
```

they have separate flashcards and separate SRS progress.

## DB.15 — Study data

A flashcard stores the FSRS/SRS information required by the study system, such as:

```text
due
stability
difficulty
elapsed days
scheduled days
reps
lapses
state
last review
createdAt
```

Any explanatory text or tags that remain useful may also live with the card, but they are not part of its chess identity.

## Initial learning order

#roadmap Order newly added flashcards by `cumulativeProb`, highest first, so the most probable positions enter the **initial learning queue** first.

Once those cards enter ordinary SRS scheduling:

```text
day-to-day reviews
→ follow SRS scheduling
→ do not remain globally ordered by cumulativeProb
```

`cumulativeProb` affects the order in which new material is introduced, not the normal review sequence.

## Cache lifetime summary

```text
Position
→ global
→ permanent
```

```text
human move cache
→ repertoire-specific
→ belongs to one HumanDataSnapshot
→ reusable for one week+
→ deliberately nuked when a fresh snapshot begins
```

```text
remote engine cache
→ global by Position/move/source
→ reusable indefinitely
→ keep latest result per source
```

```text
Local Deep Stockfish cache
→ global by Position/checked move
→ reusable indefinitely
→ keep current deep checked-vs-top result
```

```text
repertoire tree
→ belongs to one repertoire
→ independent of all cache lifetimes
```

```text
flashcards/SRS
→ belong to one repertoire
→ stable by PositionKey + RESPONSE
→ independent of transient node/move row IDs
```

## Main changes from the current database

The intended DB architecture therefore changes the current model substantially:

- replace `PositionCache` with permanent global `Position`
    
- remove destructive cache → repertoire ownership
    
- keep `ECO` and `openingName` on global `Position`
    
- keep Wikibooks text off global `Position`
    
- add repertoire-specific `HumanDataSnapshot`
    
- use one-week+ human snapshot lifetime
    
- delete old human data deliberately when starting a fresh snapshot
    
- remove `_EMPTY_` fake move rows
    
- add explicit successful human-fetch status
    
- identify human moves by UCI/LAN rather than SAN
    
- keep SAN as returned/display metadata
    
- separate remote engine cache from Local Deep Stockfish cache
    
- keep one current result per position/move/source for remote engines
    
- store source/provider version when available
    
- store only deep local-engine results
    
- store checked move + top move evaluations together for Local Deep Stockfish
    
- keep exact `FullFen`, `PositionKey` and exact history on `RepertoireNode`
    
- remove Amateur Trap and Master Threat node fields
    
- keep `cumulativeProb` stored as a derived cached aggregate
    
- change repertoire move identity to `fromNodeId + UCI/LAN`
    
- rename `trueProbability` to `routeProbability`
    
- store `routeHistory` and `routeProbability` on every move
    
- separate OPPONENT and RESPONSE-specific meaning cleanly
    
- make flashcard identity independent of node/move database row IDs
    
- identify the learned item by `repertoireId + PositionKey + RESPONSE`
    
- preserve SRS only when both the position and RESPONSE remain unchanged
    

These changes turn DB from a cache-centred ownership model into a model where permanent chess identity, repertoire structure, human statistical snapshots, engine evidence, and study state each have their own clear lifecycle.