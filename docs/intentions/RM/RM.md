---
tags:
  - processed
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

  

repertoireId + canonical UCI/LAN history

  

→ unique concrete canonical progression

  

```

  

  

and:

  

  

```text

  

repertoireId + PositionKey

  

→ unique canonical chess position

  

```

  

  

Canonical `history` is a deterministic sequence of UCI/LAN moves, not arbitrary PGN text.

  

  

For example:

  

  

```text

  

e2e4 e7e5 g1f3 b8c6

  

```

  

  

PGN/SAN history is derived/display metadata. Formatting, annotations, comments or move-number presentation must never change progression identity.

  

  

Different histories may reach the same `PositionKey`, but they must not create duplicate canonical nodes for that position.

  

  

`RepertoireNode.id` is disposable structural row identity.

  

  

For anything long-lived or user-facing, the stable repertoire-position identity is:

  

  

```text

  

repertoireId + PositionKey

  

```

  

  

Flashcards, SRS, annotations, bookmarks and similar saved app state must not depend on a particular node row surviving regeneration.

  

  

`ECO` and `openingName` are progression-specific metadata. They belong to the canonical progression/node rather than the global `Position`, because different move orders can legitimately transpose into the same `PositionKey` with different opening classifications.

  

  

## RM.01–RM.03 — Look up a node

  

  

RM provides two node lookups.

  

  

### Exact progression lookup

  

  

```text

  

repertoireId + canonical UCI/LAN history

  

→ existing node or nothing

  

```

  

  

This answers:

  

  

> "Have we already stored this exact move sequence as the canonical progression?"

  

  

### Shared-position lookup

  

  

```text

  

repertoireId + PositionKey

  

→ existing canonical node or nothing

  

```

  

  

This answers:

  

  

> "Has this chess position already been reached through another history?"

  

  

RM only performs the lookup. A4 decides whether an existing shared position constitutes a transposition or whether the same-route repetition rule applies.

  

  

Finding a node must never mutate it.

  

  

If a `PositionKey` lookup finds an existing canonical node, RM returns it with its existing:

  

  

- `FullFen`

  

- `PositionKey`

  

- canonical UCI/LAN history

  

- progression-specific ECO/opening metadata, if present

  

- database identity

  

  

unchanged. A later transposing route must not overwrite the surviving progression with its own history or opening classification.

  

  

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

  

2. construct/validate canonical UCI/LAN history

  

3. look up repertoireId + canonical history

  

4. if absent, look up repertoireId + PositionKey

  

5. create only if neither exists

  

```

  

  

An unexpected uniqueness conflict is a hard error. Do not silently convert a failed create into an update.

  

  

A newly created node stores at least:

  

  

```text

  

repertoireId

  

fullFen

  

positionKey

  

canonical UCI/LAN history

  

ECO/openingName, if known

  

cumulativeProb

  

humanDataSnapshotId

  

```

  

  

PGN/SAN may be cached for display, but it is not progression identity.

  

  

The old trap/threat fields are removed.

  

  

The node's `humanDataSnapshotId` identifies the human-data snapshot from which its probability state was calculated. Human statistics from one snapshot period must not be silently mixed with another.

  

  

## Human-data snapshot

  

Human statistics are source data, not generated repertoire structure.

  

A HumanDataSnapshot is compatible when its human-explorer request settings match the request context required by the repertoire.

  

Compatibility depends on source-request settings such as:

  

```text

rating range

time controls

population/database filters

other explorer request filters

```

  

It does not depend on the whole generation config.

  

Therefore changes to derived-policy settings such as:

  

```text

depth limits

mainline thresholds

Masters weighting

engine tolerances

```

  

do not by themselves require new human data.

  

A snapshot younger than one week is definitely reusable. An older compatible snapshot remains usable until a deliberate fresh human-data build starts.

  

## Rebuild lifecycle

  

Every generation/recalculation rebuilds the derived repertoire tree from the root.

  

RM does not support resuming a partially generated tree.

  

The lifecycle is:

  

```text

generationStatus = GENERATING

→ normal user interaction locked

→ retain flashcards/SRS provisionally

→ delete current generated repertoire tree

→ use current in-memory validated config for this build

→ reuse compatible HumanDataSnapshot

→ reuse compatible engine caches

→ rebuild nodes and moves from the root

```

  

The old generated tree is not retained as a fallback copy and there is no parallel old-tree/new-tree version.

  

If generation fails or is interrupted:

  

```text

partial tree

→ invalid/disposable

  

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

  

The next attempt:

  

```text

→ reads and validates the current config again

→ deletes any partial generated tree

→ starts again from the root

→ reuses compatible source/cache data

```

  

It does **not** continue the partial structure.

  

A failed build does not itself invalidate the HumanDataSnapshot.

  

A new snapshot is created only when the human source data is deliberately refreshed or when the current explorer-request settings are incompatible with that snapshot.

  

### Successful completion

  

Only after:

  

```text

tree generation completes

→ flashcards are reconciled

→ obsolete cards are removed

→ final consistency checks pass

```

  

may the generation workflow:

  

```text

store the completed configHash

→ generationStatus = IDLE

→ unlock the repertoire

```

  

The full config snapshot is not persisted for resume purposes.

  

## Probability model

  

  

Use three probability concepts.

  

  

### `prob`

  

  

Local probability of an OPPONENT move at its immediate source position.

  

  

### `routeProbability`

  

  

Keep the existing name, but define it as:

  

  

> the probability mass carried by this move edge from its source node

  

  

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

  

  

Before a transposition, this naturally equals the probability of the single route that reached the edge.

  

  

### `cumulativeProb`

  

  

Combined probability mass reaching one canonical `PositionKey`.

  

  

For every non-root canonical node:

  

  

```text

  

cumulativeProb

  

= sum of routeProbability

  

  on incoming non-repetition edges

  

```

  

  

The root is the special starting case:

  

  

```text

  

root cumulativeProb = 1.0

  

```

  

  

### Example with a transposition

  

  

```text

  

Route A reaches X

  

→ incoming routeProbability = 0.10

  

  

Route B reaches X

  

→ incoming routeProbability = 0.03

  

  

X.cumulativeProb

  

= 0.10 + 0.03

  

= 0.13

  

```

  

  

The shared continuation after X starts from the **combined** `0.13`.

  

  

For a RESPONSE from X:

  

  

```text

  

routeProbability = 0.13

  

```

  

  

If the following OPPONENT move has:

  

  

```text

  

prob = 0.50

  

```

  

  

then:

  

  

```text

  

routeProbability

  

= 0.13 × 0.50

  

= 0.065

  

```

  

  

Do not continue propagating only Route A's `0.10` or Route B's `0.03` after the merge.

  

  

### Repetition exclusion

  

  

A same-route repetition terminal is not another probability contribution into the earlier repeated node.

  

  

It may record the probability mass that reached its terminal move for logging/UI if useful, but:

  

  

```text

  

stopReason = "Repetition"

  

→ exclude from destination cumulativeProb

  

→ no destination node

  

→ no further propagation

  

```

  

  

## `cumulativeProb` ownership

  

  

`cumulativeProb` remains stored on the node because generation and depth checks need fast access to it.

  

  

However, it is derived data, not an independently editable source of truth.

  

  

For every non-root node:

  

  

```text

  

node.cumulativeProb

  

= sum of routeProbability

  

  on its incoming non-repetition move edges

  

```

  

  

Callers must not perform:

  

  

```text

  

node.cumulativeProb += x

  

```

  

  

RM owns the operation that changes incoming contributions and recomputes the destination node's total atomically.

  

  

This prevents one transposition contribution from being counted repeatedly on reruns and ensures removed routes stop contributing.

  

  

Whenever `cumulativeProb` changes, the downstream probability state and depth decisions must be revisited.

  

  

If it increases:

  

  

```text

  

higher cumulativeProb

  

→ recompute downstream edge probabilities

  

→ recompute descendant cumulativeProb

  

→ extend generation where the new depth budget requires it

  

```

  

  

If it decreases:

  

  

```text

  

lower cumulativeProb

  

→ recompute downstream edge probabilities

  

→ recompute descendant cumulativeProb

  

→ recalculate effective depth limits

  

→ prune continuation that is now deeper than the current rules justify

  

```

  

  

A generation always rebuilds from the root, so the resulting structure should be the clean result of the current compatible human-data snapshot and current validated configuration.

  

  

## Route identity

  

  

Canonical exact progression identity lives on `RepertoireNode.history` as a deterministic UCI/LAN move sequence.

  

  

Ordinary shared continuation edges are already identified by:

  

  

```text

  

fromNodeId + UCI/LAN move

  

```

  

  

Their exact canonical history can be derived from:

  

  

```text

  

fromNode.history

  

+ move UCI/LAN

  

```

  

  

They do not need to pretend to carry the history of every route that reaches the source node.

  

  

### Terminal routeHistory

  

  

`routeHistory` is kept where an exact non-canonical incoming route deliberately stops.

  

  

It is required for:

  

  

```text

  

stopReason = "Transposition"

  

stopReason = "Repetition"

  

```

  

  

and stores the full canonical UCI/LAN sequence up to and including that terminal move.

  

  

Example:

  

  

```text

  

Line A

  

→ reaches X first

  

→ X becomes canonical

  

→ A continues after X

  

  

Line B

  

→ later reaches the same PositionKey X

  

→ final B edge stores B's routeHistory

  

→ final B edge points to X

  

→ stopReason = "Transposition"

  

→ B stops

  

```

  

  

The final B edge keeps B's exact route history, while X retains A's canonical node history.

  

  

Therefore:

  

  

```text

  

terminal transposition edge.routeHistory

  

may differ from

  

toNode.history

  

```

  

  

After X, shared continuation edges rely on X's canonical history. They do not claim to represent both A and B histories.

  

  

A repetition terminal similarly stores the exact UCI/LAN route that returned to an earlier `PositionKey`, but it has no `toNodeId` and cannot create a cycle.

  

  

## RM.08–RM.12 — Create or update a move

  

  

  

A move edge is identified by:

  

  

  

```text

  

  

fromNodeId + UCI/LAN move

  

  

```

  

  

  

not SAN.

  

  

  

`toNodeId` is destination data, not part of edge identity.

  

  

For an ordinary continuation or transposition, `toNodeId` is required.

  

  

For a same-route repetition terminal:

  

  

```text

  

stopReason = "Repetition"

  

→ toNodeId = null

  

```

  

  

so the final move may be preserved without creating a directed cycle back to an ancestor.

  

  

  

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

  

  

Before writing an edge, RM verifies the source node internally:

  

  

```text

  

positionKeyFromFen(fromNode.fullFen)

  

=== fromNode.positionKey

  

```

  

  

RM independently plays the authoritative UCI/LAN move from `fromNode.fullFen`.

  

  

The move must be legal for the side to move.

  

  

For a normal continuation, RM also verifies:

  

  

```text

  

positionKeyFromFen(toNode.fullFen)

  

=== toNode.positionKey

  

```

  

  

and:

  

  

```text

  

resulting FullFen

  

=== toNode.fullFen

  

  

resulting canonical UCI/LAN history

  

=== toNode.history

  

```

  

  

An already-existing node may be reused as a normal continuation during rerun/resume only if it represents that exact same canonical progression.

  

  

For an ordinary transposition:

  

  

```text

  

resulting PositionKey

  

=== toNode.positionKey

  

```

  

  

but:

  

  

```text

  

resulting FullFen

  

need not equal toNode.fullFen

  

  

incoming routeHistory

  

need not equal toNode.history

  

```

  

  

because the existing canonical node keeps its own surviving progression.

  

  

A transposition target must already exist.

  

  

For a same-route repetition:

  

  

```text

  

resulting PositionKey

  

= a PositionKey already seen earlier on the current route

  

  

stopReason = "Repetition"

  

toNodeId = null

  

```

  

  

RM validates the legal resulting position but must not create or point to a destination node for that repetition terminal.

  

  

The caller/A4 explicitly tells RM whether the edge is a normal continuation, ordinary transposition or repetition termination; RM validates that claim rather than deciding higher-level generation policy itself.

  

  

## Transpositions and repetitions

  

  

### Ordinary transposition

  

  

A normal transposition is an ordinary repertoire move edge:

  

  

```text

  

fromNodeId

  

→ move

  

→ toNodeId = already-existing canonical node

  

```

  

  

There is no duplicate transposition node.

  

  

The later line remains a genuine stored line up to that edge, with its own preceding nodes and exact terminal `routeHistory`. It stops once it points into the already-existing canonical position.

  

  

The canonical position has:

  

  

```text

  

one PositionKey

  

one canonical FullFen

  

one canonical UCI/LAN history

  

one canonical opening classification

  

one canonical RESPONSE

  

one flashcard/SRS state

  

```

  

  

A later transposing route inherits that RESPONSE rather than running response selection again.

  

  

The canonical node's surviving `FullFen` is authoritative for the one shared continuation after the merge. It is the concrete FEN used for subsequent move generation and engine evaluation.

  

  

The later transposing route preserves its own exact progression only up to the incoming transposition edge. Its resulting `FullFen` need only produce the same `PositionKey`; it does not create a second continuation because discarded FEN fields or opening classification differ.

  

  

Its incoming `routeProbability` is added as another contribution to the canonical node's `cumulativeProb`.

  

  

### Repetition is not a transposition

  

  

Before treating a reached `PositionKey` as an ordinary transposition, the generator must check whether that same `PositionKey` already occurred earlier on the **current route**.

  

  

If yes:

  

  

```text

  

stopReason = "Repetition"

  

→ store terminal move if required

  

→ store exact terminal routeHistory

  

→ toNodeId = null

  

→ do not add probability back into the earlier node

  

→ do not continue generation

  

```

  

  

This prevents directed cycles such as:

  

  

```text

  

X → Y → X

  

```

  

  

from entering the repertoire graph or probability model.

  

  

This is a structural anti-cycle rule. It does not implement full threefold-repetition adjudication.

  

  

### Transposition metadata

  

  

A canonical node may store `isTransposition = true` when two or more distinct non-repetition repertoire routes currently reach that node.

  

  

This is derived metadata, not permanent historical truth.

  

  

`2 or more distinct incoming non-repetition routes → isTransposition = true`

  

  

`0 or 1 distinct incoming non-repetition route → isTransposition = false`

  

  

Repetition terminals do not count.

  

  

Whenever a rerun, branch deletion, RESPONSE replacement or other structural change adds or removes an incoming route, RM must update `isTransposition` so that it matches the current graph.

  

  

A node must not remain marked as a transposition merely because it was one in an earlier version of the repertoire.

  

  

A route that stops because it merges into an already-existing canonical node records:

  

  

```text

  

stopReason = "Transposition"

  

```

  

  

on that incoming edge.

  

  

If a later rerun changes the route so that the reason no longer applies, the old `stopReason` must be cleared or replaced.

  

  

The stored metadata must always describe the current repertoire structure.

  

  

### If the canonical owning branch disappears

  

  

If destructive regeneration deletes the branch that owns canonical position X:

  

  

```text

  

X

  

+ its canonical downstream continuation

  

→ delete

  

```

  

  

Any transposition edges that pointed into the deleted structure disappear through the normal deletion rules.

  

  

Do not keep X and mutate its `FullFen`, history or opening classification in place to promote another route.

  

  

When a surviving route is walked again and reaches the same `PositionKey`:

  

  

```text

  

create/rebuild X from that surviving route

  

→ use its exact FullFen

  

→ use its canonical UCI/LAN history

  

→ use its progression-specific ECO/openingName

  

→ recompute cumulative probability

  

→ re-run depth/expansion decisions

  

→ rebuild or extend the continuation as required

  

```

  

  

Because the previous canonical continuation was deleted, its old RESPONSE verification state does not survive. Newly rebuilt RESPONSES follow the normal fresh verification process.

  

  

## Probability propagation after a transposition

  

  

When a transposition changes an already-processed node's `cumulativeProb`, merely updating that node is insufficient.

  

  

The canonical shared continuation always starts from the node's **combined** `cumulativeProb`.

  

  

If a new incoming route raises X:

  

  

```text

  

X cumulativeProb increases

  

→ recompute existing outgoing routeProbability from X

  

→ recompute affected descendant cumulativeProb values

  

→ re-run expansion/depth decisions

  

→ extend where the higher probability now justifies additional depth

  

```

  

  

If an incoming route disappears and lowers X:

  

  

```text

  

X cumulativeProb decreases

  

→ recompute existing outgoing routeProbability from X

  

→ recompute affected descendant cumulativeProb values

  

→ re-run expansion/depth decisions

  

→ prune structure that is now deeper than the current probability budget justifies

  

```

  

  

If propagation reaches another transposition, recompute that shared node from all of its current incoming non-repetition contributions and continue through its canonical downstream structure.

  

  

Do not propagate one original incoming route's probability through the shared continuation after a merge.

  

  

## OPPONENT move data

  

  

An OPPONENT edge stores:

  

  

```text

  

UCI/LAN move

  

cached SAN

  

prob

  

routeProbability

  

humanDataSnapshotId

  

optional cp or mate

  

optional evaluationSource

  

```

  

  

A terminating transposition/repetition edge also stores its exact `routeHistory` and `stopReason`.

  

  

`prob` is required.

  

  

`routeProbability` is required and is calculated from the source node's combined probability:

  

  

```text

  

routeProbability

  

= fromNode.cumulativeProb × prob

  

```

  

  

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

  

deepVerified

  

```

  

  

in the RESPONSE-selection sense.

  

  

## RESPONSE move data

  

  

A RESPONSE edge stores:

  

  

```text

  

UCI/LAN move

  

cached SAN

  

routeProbability

  

humanDataSnapshotId

  

  

cp or mate

  

source

  

  

selectionMethod

  

moveOrigin

  
  

  

deepVerified

  

```

  

  

A terminating transposition/repetition RESPONSE edge, if such a terminal case occurs, also stores its exact `routeHistory` and `stopReason`.

  

  

A normal RESPONSE carries the source node's combined probability:

  

  

```text

  

routeProbability

  

= fromNode.cumulativeProb

  

```

  

  

A RESPONSE must have an exact evaluation before it is finalised.

  

Remote and Local Deep cache reuse must also match the required `evaluationProfile`; matching only `FullFen` and move is insufficient when the analysis policy differs.

  

  

## Evaluation representation

  

  

  

All stored evaluations use one project-wide move-evaluation meaning and one colour-absolute convention.

  

For a move, the stored evaluation means:

  

> the value of choosing this specific move from this exact source `FullFen`

  

Lichess, ChessDB and Local Deep Stockfish may expose their analysis differently, but RM stores the normalised move value consistently.

  

  

  

```text

  

  

positive cp

  

  

→ better for White

  

  

  

negative cp

  

  

→ better for Black

  

  

```

  

  

  

Mate uses signed `#N` semantics:

  

  

  

```text

  

  

#1  → White mates in 1

  

  

#3  → White mates in 3

  

  

  

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

  

  

  

Controlled evaluation-source values are:

  

  

```text

  

"Lichess Cloud Evaluation"

  

"ChessDB"

  

"Local Deep Stockfish"

  

```

  

  

`"Hardcoded Opening"` is not an evaluation source. It belongs only to `selectionMethod`, because it explains how the RESPONSE was chosen rather than where its evaluation came from.

  

  

  

## RESPONSE provenance

  

  

  

Keep two separate controlled concepts.

  

  

  

### `moveOrigin`

  

  

  

```text

  

  

"Human Move"

  

  

"Engine Move"

  

  

```

  

  

  

"Human Move" means the response came from the human candidate-move list.

  

  

  

"Engine Move" means no human candidate survived and the engine supplied the response.

  

"Hardcoded Move" means the move itself came from deliberate hardcoded opening logic rather than from human-candidate ranking or engine fallback.

  

For a hardcoded opening RESPONSE:

  

```text

selectionMethod = "Hardcoded Opening"

moveOrigin = "Hardcoded Move"

source = actual evaluation source

```

  

  

  

### `selectionMethod`

  

  

  

```text

  

  

"Ordinary API"

  

  

"Corrected after Deep Verification"

  

  

"Local Engine Fallback"

  

  

"Hardcoded Opening"

  

  

```

  

  

For a hardcoded opening RESPONSE:

  

  

```text

  

selectionMethod = "Hardcoded Opening"

  

source = actual evaluation source

  

```

  

  

The evaluation source must still be Lichess, ChessDB or Local Deep Stockfish. A hardcoded move is not finalised without the exact evaluation required of every RESPONSE.

  

  

  

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

  

### Evidence refresh

  

Remote evidence and deep-verification evidence have different lifecycles.

  

If only Lichess/ChessDB evidence is explicitly refreshed:

  

```text

same RESPONSE

+ same canonical FullFen

+ same Local Deep evidence

→ keep deepVerified = true

```

  

Remote evidence may change the stored remote evaluation/provenance as appropriate, but it does not by itself undo Local Deep verification.

  

If the Local Deep Stockfish result used for the exact current:

  

```text

FullFen

+ RESPONSE UCI/LAN

+ evaluationProfile

```

  

is replaced:

  

```text

deepVerified = false

→ DV must run again

```

  

This keeps `deepVerified = true` tied to the current stored deep-local evidence rather than to an older result that no longer exists.

  

Changing `evaluationProfile` also means different Local Deep evidence, so the old verification cannot be reused automatically.

  

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

  

  

  

Every ordinary generator rerun re-walks the repertoire using the current configuration and the current human-data snapshot.

  

  

  

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

  

  

  

If recomputation changes incoming probability contributions, RM also propagates the new `cumulativeProb` values. Increased probability may extend a branch; decreased probability may prune continuation that is now deeper than the current depth budget allows.

  

  

A deliberate **new human-data snapshot** is different from an ordinary rerun. It discards the old generated tree first and rebuilds the whole repertoire from the root so that old-snapshot and new-snapshot structure cannot coexist.

  

  

  

Repertoire-tree deletion does not delete reusable engine caches.

  

  

  

#deferred Cache garbage collection.

  

  

  

## Flashcards and SRS

  

  

  

Flashcard identity follows `PositionKey`, not exact move history or transient database row IDs.

  

  

  

```text

  

  

different histories

  

  

→ same PositionKey

  

  

→ same training position

  

  

→ same flashcard

  

  

→ same SRS progress

  

  

```

  

  

  

One `PositionKey` must therefore have one canonical RESPONSE.

  

  

  

The stable learned-item identity is:

  

  

  

```text

  

  

repertoireId

  

  

+ PositionKey

  

  

+ RESPONSE UCI/LAN

  

  

```

  

  

  

A `RepertoireNode.id` or `RepertoireMove.id` must not be required for a card to survive regeneration.

  

  

  

### During a fresh human-data rebuild

  

  

  

Deleting the old generated tree must not immediately delete all flashcards.

  

  

  

Keep existing cards provisionally while the new tree is being generated.

  

  

  

When a rebuilt position appears:

  

  

  

```text

  

  

same PositionKey

  

  

+ same RESPONSE

  

  

→ preserve flashcard

  

  

→ preserve all SRS progress

  

  

→ update current statistical metadata as needed

  

  

```

  

  

  

If the rebuilt position uses a different RESPONSE:

  

  

  

```text

  

  

same PositionKey

  

  

+ different RESPONSE

  

  

→ delete old card

  

  

→ create new card

  

  

→ fresh SRS state

  

  

```

  

  

  

If an old position has not appeared yet, do not delete its card merely because generation is incomplete.

  

  

  

Only after the new repertoire tree completes successfully:

  

  

  

```text

  

  

old card has no matching PositionKey + RESPONSE

  

  

in the finished new tree

  

  

→ delete old card

  

  

→ delete its SRS state

  

  

```

  

  

  

This makes interrupted generation safe for existing study progress.

  

  

  

#roadmap Order newly added flashcards by `cumulativeProb`, highest first, so the most probable positions enter the initial learning queue first. After cards enter normal SRS scheduling, day-to-day reviews should follow the SRS schedule rather than `cumulativeProb`.

  

  

  

## Changes from the current RM diagram/code

  

  

  

The present RM diagram/code will eventually need to change substantially:

  

  

  

- replace shortened-FEN-only node storage with canonical `FullFen` + `PositionKey`

  

  

- add canonical-position lookup by `repertoireId + PositionKey`

  

  

- enforce unique `repertoireId + PositionKey`

  

  

- remove trap/threat fields

  

  

- add `humanDataSnapshotId`

  

  

- change move identity from `fromNodeId + SAN` to `fromNodeId + UCI/LAN`

  

  

- keep SAN/PGN only as derived display metadata and use canonical UCI/LAN sequences for progression identity

  

  

- rename `trueProbability` to `routeProbability` and define it as probability mass carried from `fromNode.cumulativeProb`

  

  

- store `routeProbability` on move edges; keep full `routeHistory` on terminating transposition/repetition routes

  

  

- use `repertoireId + canonical node history` for exact canonical progression identity

  

  

- derive `playerTurn` and move `repertoireId` rather than trusting caller values

  

  

- replace source-specific repertoire evaluation fields with generic `cp`, `mate` and controlled `source`

  

  

- add RESPONSE provenance fields `selectionMethod` and `moveOrigin`

  

  

- use complete validated atomic move writes instead of loose optional-field upserts

  

  

- centralise route contribution updates and `cumulativeProb` recomputation in RM

  

  

- treat `RepertoireNode.id` as disposable structural identity and `repertoireId + PositionKey` as stable repertoire-position identity

  

  

- rebuild the entire generated tree when a fresh human-data snapshot begins

  

  

- never mix current tree rows from different human-data snapshots

  

  

- use the canonical route's exact `FullFen` for the shared continuation after a transposition

  

  

- delete a canonical node with its owning branch rather than promoting another route in place

  

  

- allow a surviving route to rebuild that PositionKey from its own exact `FullFen` and history

  

  

- preserve flashcards provisionally during a full rebuild and remove obsolete cards only after successful completion

  

  

- persist and enforce a generation lock until generation completes successfully; interruptions remain locked

  

- exclude `"Hardcoded Opening"` from evaluation sources and keep it only as RESPONSE `selectionMethod`

  

- keep `ECO` and `openingName` on the concrete canonical progression rather than global `Position`

  

- treat same-route repeated PositionKey as terminal `stopReason = "Repetition"` rather than a transposition

  

- allow repetition terminal moves to have no `toNodeId`, preventing graph cycles

  

- exclude repetition terminals from canonical-node `cumulativeProb`

  

- propagate the combined canonical `cumulativeProb` after transpositions rather than one original route probability

  

- propagate probability decreases as well as increases and prune depth that is no longer justified

  

  

  

- define stored move evaluation as the value of choosing that move from the exact source FullFen, normalised White-positive

- add `moveOrigin = "Hardcoded Move"` for hardcoded opening RESPONSES

- remove persistent `selectionReason`

- require matching `evaluationProfile` when reusing remote or Local Deep engine evidence

- invalidate `deepVerified` when its relevant Local Deep evidence is replaced

- keep `deepVerified` when only remote evidence changes and RESPONSE, canonical FullFen and Local Deep evidence remain unchanged

  

- rebuild the generated tree from the root for every generation/recalculation

- never resume a partial generated tree

- keep the repertoire locked after failure until a later full rebuild succeeds

- reuse compatible HumanDataSnapshot and engine caches across rebuild attempts

- make HumanDataSnapshot compatibility depend only on explorer-request settings

- do not maintain parallel old/new generated trees

- store completed configHash provenance without persisted full configSnapshot / GenerationRun resume state

  

The current implementation still creates nodes from `normalizeFen`, identifies move upserts by `fromNodeId + san`, and permits partial move data that leaves omitted old fields untouched, so the intended RM architecture is materially different from the present implementation.