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

  

generationStatus

  

```

  

  

`generationStatus` records whether the repertoire is currently safe for normal use:

  

  

```text

  

IDLE

  

GENERATING

  

```

  

  

The meaning is strict:

  

  

```text

  

IDLE

  

→ the generated repertoire is complete

  

→ normal user interaction is allowed

  

```

  

  

```text

  

GENERATING

  

→ the repertoire is being built or is incomplete after an interruption

  

→ normal user interaction is blocked

  

```

  

  

The backend must enforce the lock rather than relying only on disabled UI controls.

  

  

A generator crash or interruption does **not** clear the lock. The repertoire is still transitional and must remain unavailable for normal study/editing.

  

The next generation attempt does not resume the partial tree. It discards that partial generated structure and starts again from the root.

  

  

Only successful generation completion may return the repertoire to `IDLE`, after final tree checks and flashcard reconciliation have completed.

  

  

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

  

```

  

  

Only information that is genuinely position-global belongs here.

  

  

`ECO` and `openingName` do **not** belong to the global `Position`. Opening classification can depend on the move sequence that reached the board position, so it belongs to the concrete repertoire progression instead.

  

  

Wikibooks text also does **not** belong here. Wikibooks information is history-specific and follows the behaviour already established in [[W]].

  

  

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

  

  

Likewise, deleting human cache data must not delete reusable engine evaluations.

  

  

The intended relationship is:

  

  

```text

  

Position

  

→ shared PositionKey identity

  

  

RepertoireNode

  

→ repertoire structure and progression-specific metadata

  

  

human cache

  

→ temporary statistics about that PositionKey

  

  

engine cache

  

→ reusable evaluation of an exact FullFen

  

```

  

  

The engine cache may still refer back to the shared `Position` for grouping or lookup, but `PositionKey` alone is not sufficient engine-cache identity.

  

  

None of these cache lifetimes should own the repertoire tree.

  

  

## DB.04 — HumanDataSnapshot

  

One row represents one coherent period of human-explorer data for one repertoire.

  

Stores at least:

  

```text

id

repertoireId

startedAt

explorerRequestProfile / equivalent frozen request settings

```

  

A snapshot belongs to one repertoire, not globally to every repertoire.

  

Its compatibility depends only on settings that change the human-explorer request itself, for example:

  

```text

rating range

time controls

population/database filters

other explorer request filters

```

  

General generation-policy settings do **not** make the raw human snapshot incompatible.

  

For example, changing:

  

```text

depth limits

mainline popularity thresholds

Masters weighting

engine tolerances

```

  

may change derived repertoire decisions, but the same compatible human source data may still be reused.

  

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

→ eligible for deliberate replacement

→ keep using until a fresh human-data snapshot is deliberately started

```

  

A generation failure does not itself invalidate the snapshot.

  

### Rebuild model

  

Every repertoire generation/recalculation rebuilds the generated repertoire tree from the root.

  

The generated tree is derived state and is disposable.

  

The intended sequence is:

  

```text

generation requested

  

→ generationStatus = GENERATING

→ block normal user interaction

→ read and validate the current central config

→ compute configHash

→ freeze those effective config values in memory for this build

→ keep existing flashcards/SRS provisionally

→ delete the current generated repertoire tree

→ choose/reuse a compatible HumanDataSnapshot

→ generate again from the normal root position

→ fetch missing human data into that snapshot as positions are reached

→ reuse compatible engine caches

```

  

There is no parallel old-tree/new-tree versioning system.

  

The previous generated tree is not kept as a fallback copy.

  

### If generation fails or is interrupted

  

If generation stops or crashes halfway through:

  

```text

partial generated tree

→ may remain temporarily in the database

→ is not valid repertoire state

→ is disposable

  

generationStatus

→ remain GENERATING

  

normal user interaction

→ remain blocked

  

compatible HumanDataSnapshot

→ keep

  

compatible engine caches

→ keep

  

flashcards/SRS

→ keep provisionally

```

  

The next generation attempt does **not** continue or repair that partial tree.

  

Instead:

  

```text

next attempt

→ read and validate the current config again

→ compute the current configHash

→ discard the partial generated tree

→ start again from the root

→ reuse the compatible HumanDataSnapshot

→ reuse compatible engine caches

```

  

There is no persisted full `configSnapshot` required for resumability, because partial-tree resumability is not part of the intended design.

  

### Starting a fresh human-data snapshot

  

A new HumanDataSnapshot is needed only when a deliberate refresh is requested or the existing snapshot is incompatible with the current human-explorer request settings.

  

Then:

  

```text

generationStatus = GENERATING

→ keep flashcards/SRS provisionally

→ delete current generated tree

→ delete/replace the old human move data for this repertoire

→ create the new HumanDataSnapshot

→ regenerate from the root

→ fetch human data as positions are reached

→ reuse compatible engine caches

```

  

Reusable engine caches are independent and remain intact.

  

### Successful completion

  

Only after the rebuild finishes successfully:

  

```text

→ reconcile flashcards against the finished tree

→ preserve cards for same repertoire + PositionKey + RESPONSE

→ replace cards where the RESPONSE changed

→ delete old cards absent from the finished tree

→ run final consistency checks

→ store configHash for the completed repertoire

→ generationStatus = IDLE

→ unlock normal user interaction

```

  

The completed `configHash` is provenance for the current finished tree.

  

The database does not need to persist a full generation config snapshot or GenerationRun resume state.

  

There is no need to preserve previous human snapshots historically.

  

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

  

### Identity

  

Remote engine-cache identity must use the exact concrete `FullFen` that was evaluated and the exact query policy used.

  

One current entry is kept per:

  

```text

FullFen

+ UCI/LAN move

+ source

+ evaluationProfile

```

  

`evaluationProfile` is a stable identifier for the analysis/query policy whose settings can affect the returned result set or scores.

  

Examples conceptually:

  

```text

"Lichess-default-v1"

"ChessDB-default-v1"

```

  

The profile may represent settings such as:

  

```text

MultiPV count

depth/nodes, if applicable

provider mode

other query options that materially affect results

```

  

Do not identify an engine evaluation only by `PositionKey`.

  

Two concrete progressions may share one `PositionKey` while having different rule-sensitive FEN state, particularly the half-move clock.

  

For example:

  

```text

same PositionKey

half-move clock = 0

```

  

and:

  

```text

same PositionKey

half-move clock = 99

```

  

must not automatically share one cached engine evaluation.

  

Likewise:

  

```text

same FullFen

same source

different evaluationProfile

→ different cache identity

```

  

### Stored evaluation meaning

  

Every stored move evaluation has one project-wide semantic meaning:

  

> the value of choosing this specific move from this exact source `FullFen`, normalised to the project's White-positive sign convention

  

This does not require every provider to expose scores in the same native format or describe them as "after the move". Provider-specific output is normalised into this common stored meaning.

  

Stores conceptually:

  

```text

FullFen

Position, if useful as a shared-position reference

UCI/LAN move

SAN, if useful

cp or mate

rank, if supplied/useful

source

evaluationProfile

sourceVersion, if the provider exposes one

```

  

`sourceVersion` is provenance metadata, not cache identity unless a future profile deliberately chooses to encode it.

  

### Replacement and lifetime

  

The cache keeps the latest available evaluation for the exact:

  

```text

FullFen

+ move

+ source

+ evaluationProfile

```

  

If a newer result for that same identity is explicitly stored:

  

```text

old result

→ replace

  

new result

→ retain

```

  

Remote engine evaluations have no routine expiry.

  

Normal generation does not automatically refresh a successfully fetched `FullFen + source + evaluationProfile`.

  

Remote results are effectively frozen until an explicit refresh action deliberately invalidates the corresponding fetch state and queries the provider again.

  

Human snapshot refreshes do not delete remote engine evaluations.

  

## DB.08 — RemoteEngineFetch

  

Remote engine/API fetch status is tracked independently from stored evaluation rows.

  

Fetch status belongs to the exact concrete FEN, source and query policy that were used.

  

Identity:

  

```text

FullFen

+ source

+ evaluationProfile

→ successfully fetched

```

  

A successful fetch means:

  

> this provider was queried successfully for this exact `FullFen` under this exact `evaluationProfile`, and the complete result returned by that query was processed

  

It does **not** mean that every legal move has an evaluation.

  

This distinguishes:

  

```text

no RemoteEngineFetch

→ this source/profile has not been queried successfully for this FullFen

```

  

from:

  

```text

RemoteEngineFetch exists

+ no evaluation row for candidate move

→ source was queried successfully

→ that candidate was not available in the returned analysis

```

  

and:

  

```text

RemoteEngineFetch exists

+ matching evaluation row exists

→ reuse the cached candidate evaluation

```

  

If a candidate move is absent from a successfully fetched result:

  

```text

do not automatically query the same source/profile again

→ treat that candidate as unavailable from this source

→ continue to the next source in the verification waterfall

```

  

This avoids repeatedly requesting the same analysis when the provider's top-move/MultiPV limits simply did not include that candidate.

  

A successful fetch for another `FullFen`, or for another `evaluationProfile`, must not suppress a required fetch for the current identity.

  

### Explicit refresh

  

Normal generation reuses successful remote fetches indefinitely.

  

A future explicit refresh action may deliberately invalidate the relevant `RemoteEngineFetch` state:

  

```text

explicit refresh

→ clear/invalidate selected fetch marker

→ query provider again

→ process complete returned result

→ replace matching cached evaluations where new results are returned

```

  

#roadmap User-facing/manual remote-engine refresh controls.

  

Local Deep Stockfish does not participate in this remote-fetch status.

  

## DB.09 — LocalDeepEvalCache

  

Local Deep Stockfish has a separate cache because its result has a different meaning and shape from remote engine rows.

  

Only **deep** local Stockfish results are stored.

  

There is no shallow local-engine cache.

  

### Identity

  

Local Deep Stockfish cache identity uses the exact `FullFen`, checked move and deep-analysis policy supplied to Stockfish.

  

One result is identified conceptually by:

  

```text

FullFen

+ checked UCI/LAN move

+ evaluationProfile

```

  

`evaluationProfile` is a stable identifier for the Local Deep analysis policy.

  

It represents settings that materially affect the analysis, such as:

  

```text

depth or nodes

MultiPV

threads/hash where intentionally part of the policy

other deep-engine options

```

  

Do not identify a Local Deep Stockfish result only by `PositionKey`.

  

Two repertoire nodes may share one `PositionKey` but have different concrete `FullFen` values. Their engine results must not be treated as interchangeable when the discarded FEN fields can affect rule-sensitive evaluation.

  

Likewise:

  

```text

same FullFen

same checked move

different evaluationProfile

→ different cache identity

```

  

### Stored result

  

One Local Deep Stockfish result always contains two explicit evaluations:

  

```text

checked move

+ checked move evaluation

  

top move

+ top move evaluation

```

  

They belong together.

  

Both evaluations use the project-wide move-evaluation meaning:

  

> the value of choosing that move from this exact source `FullFen`, normalised to White-positive

  

Stores conceptually:

  

```text

FullFen

Position, if useful as a shared-position reference

  

checked UCI/LAN move

checked cp or mate

  

top UCI/LAN move

top cp or mate

  

evaluationProfile

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

  

Stockfish version is provenance metadata.

  

Changing the Stockfish binary version alone does not invalidate a cached result if the result still belongs to the same exact:

  

```text

FullFen

+ checked move

+ evaluationProfile

```

  

A future deliberate analysis-policy change should use a different `evaluationProfile`.

  

### Replacing deep evidence

  

If the stored Local Deep result for the exact identity used by a current RESPONSE is deliberately replaced:

  

```text

same FullFen

+ same checked RESPONSE

+ same evaluationProfile

→ Local Deep evidence replaced

```

  

then the RESPONSE's existing verification no longer refers to the current stored evidence.

  

Therefore:

  

```text

deepVerified = false

→ DV must run again

```

  

Historical deep-engine results do not need to be kept as separate cache records for the same identity.

  

## DB.10 — RepertoireNode

  

  

One row represents one canonical stored progression in one repertoire.

  

  

Stores conceptually:

  

  

```text

  

id

  

repertoireId

  

  

FullFen

  

PositionKey

  

history

  

displayPgn, if persisted

  

  

ECO, if known

  

openingName, if known

  

  

cumulativeProb

  

isTransposition

  

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

  

  

### Canonical history

  

  

`history` is authoritative canonical move-sequence identity, not arbitrary PGN text.

  

  

Use a deterministic UCI/LAN move sequence, for example:

  

  

```text

  

e2e4 e7e5 g1f3 b8c6

  

```

  

  

Formatting differences, comments, annotations, move numbers or SAN spelling must never create different progression identities for the same move sequence.

  

  

PGN/SAN history is derived/display information. It may be persisted as cached display metadata if useful, but it is not authoritative identity.

  

  

The canonical history is useful for:

  

  

```text

  

exact progression lookup

  

reconstructing the concrete progression

  

debugging

  

history-specific behaviour

  

Wikibooks

  

opening classification

  

transposition handling

  

```

  

  

### Opening classification

  

  

`ECO` and `openingName` belong to the concrete progression represented by the canonical node, not to the global `Position`.

  

  

Different move sequences may transpose into the same `PositionKey` while having different legitimate opening classifications.

  

  

The canonical node therefore keeps the ECO/opening classification appropriate to its surviving canonical history.

Every surviving generated history node, including post-response leaf nodes, has a checked opening-metadata state: either `PRESENT` or `VALID_ABSENCE`, always with source `LICHESS_MASTERS`. A durable repertoire-and-history cache survives from-root node replacement and materialises that state onto rebuilt nodes.

When a successful Masters response omits its optional opening object, the exact history inherits the nearest earlier `PRESENT` classification on its own route. `VALID_ABSENCE` is stored only when neither the current response nor any earlier history prefix supplies a classification.

  

  

### Identity

  

  

Within one repertoire:

  

  

```text

  

repertoireId + canonical UCI/LAN history

  

→ exact progression lookup

  

```

  

  

and:

  

  

```text

  

repertoireId + PositionKey

  

→ one canonical shared chess position

  

```

  

  

Different histories may reach the same `PositionKey`.

  

  

`RepertoireNode.id` is disposable structural row identity. It must not be used as the stable identity of a repertoire position by long-lived or user-facing features.

  

  

The stable repertoire-position identity is:

  

  

```text

  

repertoireId + PositionKey

  

```

  

  

Flashcards, SRS, annotations, bookmarks, saved UI references and similar long-lived data should use stable repertoire-position identity rather than depending on a particular `RepertoireNode.id`.

  

  

The first surviving progression owns the canonical node from the transposition point onward.

  

  

A later line:

  

  

```text

  

keeps all of its genuine nodes before the merge

  

→ reaches the existing PositionKey

  

→ final edge points to existing canonical node

  

→ duplicate continuation stops

  

```

  

  

The canonical node's exact `FullFen`, canonical UCI/LAN history and progression-specific metadata belong to that surviving route. They are authoritative for the one shared continuation after the merge.

  

  

A later transposing route keeps its own exact route history and concrete state only up to its incoming transposition edge. It does not create a second continuation merely because its exact `FullFen` or opening classification differs.

  

  

If the branch that owns the canonical node is later deleted, that canonical node and its downstream continuation are deleted with it. Do not mutate the old canonical node in place to make another route its owner.

  

  

Any surviving route that later reaches the same `PositionKey` during regeneration creates/rebuilds the canonical node from its own exact `FullFen`, canonical UCI/LAN history and progression metadata. The generator then revisits probability, depth and expansion decisions from that rebuilt position.

  

  

### Transposition flag

  

  

`isTransposition` is derived from the current repertoire graph.

  

  

```text

  

2 or more distinct incoming non-repetition routes

  

→ true

  

  

0 or 1 distinct incoming non-repetition route

  

→ false

  

```

  

  

A repetition stop does not count as an incoming transposition route.

  

  

The flag exists for convenient querying and UI use.

  

  

The graph is the source of truth. If rerunning or rebuilding the repertoire changes the incoming routes, this flag must be updated so that stale transposition state is never left behind.

  

  

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

  

  

For every non-root canonical node:

  

  

```text

  

node.cumulativeProb

  

= sum of probability contributions

  

  from its incoming non-repetition move edges

  

```

  

  

The root is the special starting case:

  

  

```text

  

root cumulativeProb = 1.0

  

```

  

  

Incoming move-edge probability contributions are the source of truth for the node's cached aggregate.

  

  

A repetition terminal edge never contributes probability back into the earlier node it repeats.

  

  

## DB.11 — RepertoireMove

  

  

One row represents one repertoire move/edge.

  

  

Normally it connects two repertoire nodes. A terminal repetition edge deliberately has no destination node so that the stored repertoire graph remains acyclic.

  

  

Stores conceptually:

  

  

```text

  

id

  

repertoireId

  

  

fromNodeId

  

toNodeId, nullable only for a terminal repetition

  

  

UCI/LAN move

  

cached SAN

  

  

playerTurn:

  

OPPONENT or RESPONSE

  

  

routeHistory, for a terminating transposition/repetition route

  

routeProbability

  

stopReason

  

humanDataSnapshotId

  

```

  

  

A move is identified by:

  

  

```text

  

fromNodeId + UCI/LAN move

  

```

  

  

not SAN.

  

  

SAN is derived/cached display metadata.

  

  

### stopReason

  

  

A move edge may record why generation deliberately stopped following that line.

  

  

For a route that merges into an already-existing canonical node:

  

  

```text

  

stopReason = "Transposition"

  

```

  

  

For a move that returns to a `PositionKey` already seen earlier on the same route:

  

  

```text

  

stopReason = "Repetition"

  

toNodeId = null

  

```

  

  

The repetition move may be stored for completeness, but it must not point back to the earlier node, contribute probability to that node or continue generation. This keeps the stored repertoire graph acyclic.

  

  

`stopReason` is derived from the current structure. If a rerun changes the route so the reason no longer applies, the old value must be cleared or replaced.

  

  

### routeHistory

  

  

`routeHistory` is not the identity of every shared continuation edge.

  

  

Canonical progression identity lives on the source node as its canonical UCI/LAN `history`.

  

  

For an ordinary canonical continuation:

  

  

```text

  

source node canonical history

  

+ edge UCI/LAN move

  

→ exact canonical continuation history

  

```

  

  

No separate full route history is required merely to identify that shared edge.

  

  

For an incoming route that deliberately terminates at a merge or repetition, preserve its exact canonical UCI/LAN route history on that terminal edge:

  

  

```text

  

stopReason = "Transposition"

  

or

  

stopReason = "Repetition"

  

→ routeHistory required

  

```

  

  

At a transposition:

  

  

```text

  

incoming edge routeHistory

  

may differ from

  

target node canonical history

  

```

  

  

because the later route preserves how it reached the merge while the target node keeps the surviving canonical progression.

  

  

After the merge, shared continuation edges rely on the canonical node's history. They do not pretend to represent every incoming route that reaches that node.

  

  

### routeProbability

  

  

Keep the name `routeProbability`, but define it as the probability mass carried by this move edge from its source node.

  

  

It is not always the probability of one original exact route.

  

  

For an OPPONENT move:

  

  

```text

  

routeProbability

  

= fromNode.cumulativeProb × prob

  

```

  

  

For a RESPONSE:

  

  

```text

  

routeProbability

  

= fromNode.cumulativeProb

  

```

  

  

Before any transposition, this naturally equals the probability of the single route reaching that edge.

  

  

At a transposition, several incoming edges may contribute separately to the same canonical node:

  

  

```text

  

incoming A = 0.10

  

incoming B = 0.03

  

  

X.cumulativeProb = 0.13

  

```

  

  

The shared continuation after X starts from the combined value:

  

  

```text

  

RESPONSE from X

  

→ routeProbability = 0.13

  

  

next OPPONENT move with prob = 0.50

  

→ routeProbability = 0.13 × 0.50

  

→ 0.065

  

```

  

  

Do not continue propagating only A's `0.10` or B's `0.03` after the merge.

  

  

A repetition terminal edge must record the actual probability mass that reached the repeated move. That terminal probability is diagnostic evidence only: the edge has no destination and is excluded from every canonical node's `cumulativeProb`.

For example, if a route has probability `2%` and the repeating White move has conditional probability `0.10%`, the repetition terminal records `0.002%`. A deterministic Black response does not multiply that value. The `0.002%` is not added back to the repeated ancestor because it is a later revisit contained inside an already-counted route, not another mutually exclusive route into that node.

  

  

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

  
  

deepVerified

  

```

  

  

`source` is only the engine/API source of the stored evaluation.

  

  

Controlled evaluation-source values are:

  

  

```text

  

"Lichess Cloud Evaluation"

  

"ChessDB"

  

"Local Deep Stockfish"

  

```

  

  

`"Hardcoded Opening"` is not an evaluation source. It belongs only to `selectionMethod`.

  

  

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

  

  

`deepVerified = true` means the exact current stored RESPONSE has survived Local Deep Stockfish verification against the current stored Local Deep evidence for its exact `FullFen + RESPONSE + evaluationProfile`.

  

Refreshing or replacing only Lichess/ChessDB evidence does **not** clear `deepVerified` if:

  

```text

RESPONSE UCI/LAN unchanged

canonical FullFen unchanged

Local Deep evidence unchanged

```

  

Replacing the relevant Local Deep evidence does clear it.

  

  

## DB.12 — Evaluation representation

  

  

  

All stored repertoire and engine evaluations use one project-wide semantic meaning and sign convention.

  

For a move, the stored evaluation means:

  

> the value of choosing this specific move from this exact source `FullFen`

  

The provider's native representation is normalised into this meaning before storage.

  

  

  

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

  

  

  

## DB.13 — Transposition and repetition structure

  

  

### Ordinary transposition

  

  

A transposition is an ordinary `RepertoireMove` whose:

  

  

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

  

stopReason = "Transposition"

  

```

  

  

while X keeps the surviving canonical route's:

  

  

```text

  

FullFen

  

canonical UCI/LAN history

  

ECO/openingName, if known

  

```

  

  

X's canonical `FullFen` is the concrete state used for the one shared continuation after X, including move generation and engine evaluation.

  

  

The later transposition route keeps its own exact progression information only up to the incoming transposition edge. It does not create another continuation after X.

  

  

X is marked:

  

  

```text

  

isTransposition = true

  

```

  

  

while two or more distinct non-repetition incoming routes currently reach it.

  

  

There is only one continuation after X.

  

  

### Repetition stop

  

  

If a route reaches a `PositionKey` that already occurred earlier on that **same route**, this is not an ordinary transposition.

  

  

```text

  

same-route PositionKey already seen

  

→ stopReason = "Repetition"

  

→ store terminal move if desired

  

→ toNodeId = null

  

→ do not add another contribution to the earlier node

  

→ do not continue generation

  

```

  

  

The final move can be reconstructed from its source `FullFen` and UCI/LAN move, so no duplicate node is required.

  

  

This rule prevents directed cycles in the stored repertoire graph.

  

  

It is a structural generation rule only. It does not implement full threefold-repetition adjudication, which remains separate/deferred.

  

  

### Canonical branch deletion

  

  

If the branch that owns X is deleted:

  

  

```text

  

X

  

+ its canonical downstream continuation

  

→ delete with that branch

  

```

  

  

Incoming transposition edges that pointed to the deleted structure disappear according to the normal structural deletion rules.

  

  

The old X is not retained and rewritten to belong to another route.

  

  

When a surviving route is walked again and reaches that same `PositionKey`:

  

  

```text

  

create/rebuild X

  

→ use that route's exact FullFen

  

→ use that route's canonical UCI/LAN history

  

→ use that route's progression-specific opening metadata

  

→ recalculate probability

  

→ re-run depth/expansion decisions

  

→ rebuild or extend the continuation as required

  

```

  

  

Any newly created RESPONSE starts with the normal fresh verification state. Old `deepVerified` state from the deleted canonical continuation does not survive the deletion.

  

  

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

  

  

  

because tree rows may be reorganised, deleted or recreated while the learned item itself remains unchanged.

  

  

  

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

  

  

  

### Position removed by a completed rebuild

  

  

  

If a position from the previous repertoire does not exist in the successfully completed rebuilt tree:

  

  

  

```text

  

  

old position absent from finished tree

  

  

→ delete its flashcard

  

  

→ delete its SRS state

  

  

```

  

  

  

Do not perform this cleanup at the start of the rebuild.

  

  

  

Existing cards remain temporarily available as preservation candidates while generation is in progress. Obsolete cards are removed only after the new tree has completed successfully, so an interrupted rebuild cannot prematurely destroy reusable SRS progress.

  

  

  

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

  

  

→ one row per PositionKey

  

  

```

  

  

  

```text

  

  

human move cache

  

  

→ repertoire-specific

  

  

→ belongs to one HumanDataSnapshot

  

  

→ keyed through shared PositionKey identity

  

  

→ reusable for one week+

  

  

→ deliberately nuked when a fresh snapshot begins

  

  

```

  

  

  

```text

  

  

remote engine cache

  

  

→ global

  

  

→ keyed by exact FullFen + move + source

  

  

→ reusable indefinitely

  

  

→ keep latest result per exact FullFen/move/source

  

  

```

  

  

  

```text

  

  

Local Deep Stockfish cache

  

  

→ global

  

  

→ keyed by exact FullFen + checked move

  

  

→ reusable indefinitely

  

  

→ keep current deep checked-vs-top result

  

  

```

  

  

  

```text

  

  

repertoire tree

  

  

→ belongs to one repertoire

  

  

→ every current node/move belongs to one current HumanDataSnapshot

  

  

→ rebuilt from root when a fresh human snapshot starts

  

  

→ independent of engine-cache lifetimes

  

  

```

  

  

  

```text

  

  

flashcards/SRS

  

  

→ belong to one repertoire

  

  

→ stable by PositionKey + RESPONSE

  

  

→ independent of transient node/move row IDs

  

  

→ preserved provisionally during rebuild

  

  

→ obsolete cards deleted only after successful rebuild completion

  

  

```

  

  

  

## Main changes from the current database

  

  

  

The intended DB architecture therefore changes the current model substantially:

  

  

  

- replace `PositionCache` with permanent global `Position`

  

  

- remove destructive cache → repertoire ownership

  

  

- keep global `Position` limited to genuine PositionKey-level identity

  

  

- keep Wikibooks text off global `Position`

  

  

- add repertoire-specific `HumanDataSnapshot`

  

  

- use one-week+ human snapshot lifetime

  

  

- delete old human data deliberately when starting a fresh snapshot

  

  

- remove `_EMPTY_` fake move rows

  

  

- add explicit successful human-fetch status

  

  

- identify human moves by UCI/LAN rather than SAN

  

  

- keep SAN as returned/display metadata

  

  

- separate remote engine cache from Local Deep Stockfish cache

  

  

- key all engine evaluations by exact `FullFen`, not only `PositionKey`

  

  

- key remote fetch status by exact `FullFen + source`

  

  

- keep one current result per exact FullFen/move/source for remote engines

  

  

- store source/provider version when available

  

  

- store only deep local-engine results

  

  

- key Local Deep Stockfish results by exact `FullFen + checked move`

  

  

- store checked move + top move evaluations together for Local Deep Stockfish

  

  

- keep exact `FullFen`, `PositionKey`, canonical UCI/LAN history and progression-specific ECO/opening metadata on `RepertoireNode`

  

  

- remove Amateur Trap and Master Threat node fields

  

  

- keep `cumulativeProb` stored as a derived cached aggregate

  

  

- store derived `isTransposition` metadata on canonical nodes

  

  

- store `stopReason = "Transposition"` on incoming transposition edges and `stopReason = "Repetition"` on same-route repetition terminals

  

  

- change repertoire move identity to `fromNodeId + UCI/LAN`

  

  

- rename `trueProbability` to `routeProbability`

  

  

- store `routeProbability` on move edges; keep full `routeHistory` on terminating transposition/repetition routes

  

  

- separate OPPONENT and RESPONSE-specific meaning cleanly

  

  

- make flashcard identity independent of node/move database row IDs

  

  

- identify the learned item by `repertoireId + PositionKey + RESPONSE`

  

  

- preserve SRS only when both the position and RESPONSE remain unchanged

  

  

- rebuild the generated repertoire tree completely when a fresh human snapshot starts

  

  

- never mix nodes or moves from different human snapshots in the current tree

  

  

- treat `RepertoireNode.id` as disposable row identity and `repertoireId + PositionKey` as stable repertoire-position identity

  

  

- keep the canonical route's exact `FullFen` as the concrete state for the shared continuation after a transposition

  

  

- delete a canonical node with its owning branch rather than promoting another route in place

  

  

- let a surviving route rebuild that position from its own exact `FullFen` and history when encountered again

  

  

- preserve old flashcards provisionally during a rebuild and delete absent cards only after successful completion

  

  

- persist generation state and keep the repertoire locked through interrupted/failed generation until successful completion

  

- use canonical UCI/LAN move sequences for progression identity and treat PGN/SAN as display metadata

  

- keep `ECO` and `openingName` on concrete repertoire progressions rather than global `Position`

  

- define `routeProbability` as probability mass carried from `fromNode.cumulativeProb`

  

- propagate combined `cumulativeProb` through shared continuation after transpositions

  

- prevent repertoire graph cycles by terminating same-route repetitions

  

- exclude repetition terminals from canonical-node `cumulativeProb`

  

- prune downstream structure when decreased cumulative probability no longer justifies its depth

  

- keep `"Hardcoded Opening"` only as RESPONSE `selectionMethod`, never as evaluation source

  

  

  

- distinguish successful remote fetch from availability of any particular candidate move

- do not automatically re-query a successfully fetched remote source/profile when a candidate was absent

- freeze remote-engine results during normal generation and refresh them only explicitly

- define every stored move evaluation as the value of choosing that move from the exact source FullFen, normalised White-positive

- add `evaluationProfile` to remote engine evaluation and fetch identity

- add `evaluationProfile` to Local Deep Stockfish cache identity

- treat Stockfish version as provenance metadata rather than cache identity

- invalidate `deepVerified` when the relevant Local Deep evidence is replaced

- preserve `deepVerified` when only remote evidence changes and RESPONSE/FullFen/Local Deep evidence remain unchanged

- add `moveOrigin = "Hardcoded Move"`

- remove persistent `selectionReason`

  

- rebuild the generated repertoire tree from the root on every generation/recalculation

- discard partial generated trees instead of resuming them

- keep compatible HumanDataSnapshot and engine caches across failed/restarted builds

- make HumanDataSnapshot compatibility depend only on human-explorer request settings

- keep config values frozen only in memory for one active build

- store only the completed repertoire's configHash as config provenance

- remove persisted full configSnapshot / GenerationRun resume state

- do not maintain parallel old-tree/new-tree versions

  

These changes turn DB from a cache-centred ownership model into a model where permanent chess identity, repertoire structure, human statistical snapshots, exact-FEN engine evidence, and study state each have their own clear lifecycle.
