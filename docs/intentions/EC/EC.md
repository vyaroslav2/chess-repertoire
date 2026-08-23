---
tags:
  - processed
---
````markdown
# EC — Cache a complete remote engine snapshot

## What the code does

EC currently stores engine evaluations as individual cache rows.

A row is associated with a position, move and engine source, and stores information such as:

- evaluation;
- mate information;
- rank.

If the same row already exists, the current code updates it.

The current structure therefore treats cached engine moves largely as independent rows rather than as one complete response from one engine source.

That matters because [[PV]] does not reason from isolated moves. It reasons from a source's complete returned move list:

- which move is best;
- whether the HCM appears;
- what the worst returned move is;
- whether the source has returned enough moves to reject an absent HCM.

The cache therefore needs to preserve the fact that those moves belonged to one complete trusted snapshot.

## Why this matters

EC is the persistence layer underneath the engine-verification waterfall.

[[B4]] may reuse Lichess or ChessDB data many times while checking different HCMs for the same position.

If the cache contains a mixture of rows from different API responses, [[PV]] can make decisions from a move list that never actually existed.

For example:

```text
old response:
A
B
C
D

new response:
A
B
C
````

If EC merely upserts A, B and C, the cache may still contain D.

PV would then see:

```text
A
B
C
D
```

even though the latest successful source response contained only:

```text
A
B
C
```

The intended cache model therefore treats the entire remote response as one unit.

## Snapshot model

`Known:` Remote engine cache data belongs to one complete:

```text
position
+ source
```

snapshot.

Individual move evaluations are children of that snapshot.

Conceptually:

```text
EngineSnapshot
- positionKey
- source
- status
- fetchedAt
- requestContext
- invalidReason?

EngineSnapshotMove
- uciMove
- cp / mate
- customRank
```

The snapshot owns information that applies to the complete response.

The move rows contain only information belonging to individual evaluated moves.

## Position identity

`Known:` EC uses the normalised four-field FEN as its local position key.

That contains:

```text
piece layout
+ side to move
+ castling rights
+ en passant
```

It excludes:

```text
halfmove clock
fullmove number
```

So the local snapshot key is conceptually:

```text
normalised FEN
+ source
```

The full six-field FEN remains separate as source/history truth and may be used when making external requests where the external service should receive the full FEN.

This follows the shared position-identity model used elsewhere in the project.

## Remote sources only

`Known:` EC stores reusable remote engine snapshots.

For the current Black-move architecture those are:

```text
Lichess Cloud Evaluation
ChessDB
```

Local Stockfish does not use this snapshot cache.

Local deep results instead belong to:

- candidate-specific local verification;
    
- or the selected repertoire move when Stockfish supplies the final fallback.
    

So:

```text
EC
→ reusable Lichess snapshot
→ reusable ChessDB snapshot

[[LS]]
→ local candidate evaluation
→ local best-move evaluation
→ selected-move provenance
```

`"Local Deep Stockfish"` may be stored as the source of the selected Black response, but it is not an EC snapshot source.

## One trusted snapshot per position and source

`Known:` For one position and one remote source, EC keeps one current trusted snapshot.

Normal generation does not accumulate overlapping versions of the same source response.

For example, Lichess verification deliberately asks for:

```text
MultiPV = 5
```

So EC does not need separate Lichess snapshots for:

```text
MultiPV 1
MultiPV 3
MultiPV 5
```

The intended Lichess cache is simply the current trusted MultiPV-5 snapshot for that position.

ChessDB likewise has one current trusted snapshot for the position.

## Lichess coverage

`Known:` Lichess Cloud Evaluation deliberately requests:

```text
MultiPV 5
```

The snapshot therefore contains up to five returned PV/root moves.

This coverage matters to [[PV]], especially when the HCM is absent and PV uses the worst returned move as the boundary.

Because the returned list is small, losing or corrupting even one move can materially change the verification result.

## ChessDB coverage

`Known:` ChessDB uses its `queryall` response.

The project caches all returned ChessDB moves that have a valid parseable engine evaluation.

It does not deliberately truncate ChessDB to five moves or another arbitrary MultiPV-style count.

So the two source snapshots naturally have different coverage:

```text
Lichess
→ up to 5 returned PV moves

ChessDB
→ all usable evaluated moves returned by queryall
```

This broader ChessDB result can settle an HCM that Lichess could not conclusively verify.

## Snapshot status

`Known:` EC must explicitly represent snapshot state rather than inferring it only from whether move rows happen to exist.

The persistent states are:

```text
MISSING
VALID
EMPTY
INVALID
```

### MISSING

```text
MISSING
→ no trusted snapshot currently exists
```

This may mean the source has never been fetched for this position or that its snapshot was explicitly deleted.

### VALID

```text
VALID
→ successful complete trusted snapshot
→ contains one or more usable moves
```

### EMPTY

```text
EMPTY
→ source was fetched successfully
→ source returned no usable moves
```

An empty snapshot is valid data.

It is not the same as a failed request.

When [[PV]] receives an explicitly empty trusted snapshot:

```text
→ INCONCLUSIVE
```

and [[B4]] may continue to the next verification layer.

### INVALID

```text
INVALID
→ stored snapshot is known to be corrupt or unusable
→ must not be trusted
```

An `INVALID` snapshot is a deterministic blocking condition until it is explicitly repaired, rebuilt or cleared.

## FAILED is not a cache status

`Known:` A failed API request is not a persistent snapshot status.

For example:

```text
Lichess request fails
→ current-run source failure
```

This must not automatically transform:

```text
VALID
```

into:

```text
INVALID
```

or:

```text
MISSING
```

A request failure describes what happened during an operation.

Snapshot status describes the data currently stored in the cache.

Those are separate concepts.

## Reuse trusted cache

`Known:` A `VALID` or `EMPTY` snapshot is trusted indefinitely during normal generation.

There is no automatic TTL or age-based expiry.

So:

```text
trusted snapshot exists
→ reuse it
→ no new API request
→ no overwrite
```

The fetch timestamp is informational.

It does not make the snapshot expire.

## Fetch timestamp

`Known:` Store:

```text
fetchedAt
```

with every successful remote snapshot.

This is useful for:

- debugging;
    
- provenance;
    
- maintenance;
    
- understanding when the stored engine data was obtained.
    

It is not currently used to trigger automatic refreshing.

## Request context

`Known:` Store request context only when it materially describes what the snapshot means or how much source coverage it contains.

For the current architecture this can remain simple.

For Lichess:

```text
source = Lichess
MultiPV = 5
```

For ChessDB:

```text
source = ChessDB
query = queryall
```

Do not make transient operational details part of snapshot identity.

For example, do not store as snapshot identity:

- retry attempt;
    
- VPN state;
    
- temporary error;
    
- cooldown timer.
    

Those belong in logs or current-run state.

## Move identity

`Known:` Cached engine moves use engine-stable notation as their identity.

Use UCI/LAN-style move identity rather than SAN.

Conceptually:

```text
uciMove = e7e5
```

SAN is not stored in EC.

If SAN is needed for:

- logs;
    
- UI;
    
- explanations;
    
- human-readable output,
    

derive it later from the position.

This keeps the engine cache independent of human-facing notation conversion.

## Evaluation convention

`Known:` Cached evaluations use the project's common White-point-of-view convention.

So:

```text
positive = better for White
negative = better for Black
```

Mate information remains explicit.

Do not convert mate scores to artificial centipawn values.

Each move therefore has either the appropriate valid cp information or explicit mate information.

## Valid ChessDB evaluations

`Known:` ChessDB is tolerant at the raw-response filtering stage.

If an individual ChessDB move has an evaluation that cannot be interpreted as a legitimate engine score, discard that move before the validated snapshot is created.

Examples include:

- missing evaluation;
    
- non-numeric value where cp is expected;
    
- malformed value;
    
- `NaN`;
    
- unexpected formatting that cannot be parsed safely.
    

"Invalid" does not mean:

- surprisingly high cp;
    
- surprisingly low cp;
    
- unusual chess move;
    
- evaluation we disagree with.
    

A well-formed engine evaluation remains valid regardless of how surprising its chess value is.

So:

```text
raw ChessDB queryall response
→ parse each move
→ malformed/unparseable eval?
   ├─ yes → discard that move
   └─ no  → keep it
→ rank remaining usable moves
→ build validated snapshot
```

A ChessDB snapshot is not malformed merely because raw ChessDB supplied some rows that were filtered out before snapshot creation.

The snapshot itself must contain only usable evaluations.

## Strict Lichess validation

`Known:` Lichess validation is stricter.

If any move in the successfully returned Lichess snapshot is malformed or unusable:

```text
→ reject the complete incoming snapshot
→ HARD ERROR
```

Do not silently drop the bad Lichess move and keep the rest.

Because Lichess returns only up to five PVs, deleting one row could materially alter [[PV]]'s absent-candidate boundary logic.

So:

```text
Lichess
one malformed returned move
→ complete incoming snapshot invalid
→ HARD ERROR
```

while:

```text
ChessDB
one malformed raw move
→ filter that move out
→ validate remaining usable response
```

## Custom ranking

`Known:` EC computes the project's own `customRank`.

Do not use or persist ChessDB's or another source's own rank/quality label as the project's ranking.

The source of truth is the validated evaluation.

`customRank` is stored because it is useful for:

- inspection;
    
- debugging;
    
- displaying the engine ordering.
    

But [[PV]] must still verify/sort from the actual evaluations rather than blindly trusting the stored rank.

If `customRank` disagrees with the evaluations:

```text
evaluations win
→ snapshot is inconsistent
```

## Dense ranking

`Known:` `customRank` starts at 1 and uses dense ranking.

Equal evaluations share the same rank.

The next distinct evaluation receives the next integer.

For example:

```text
-35 → rank 1
-35 → rank 1
-20 → rank 2
+10 → rank 3
```

Not:

```text
-35 → rank 1
-35 → rank 1
-20 → rank 3
```

## Ranking ordinary Black cp evaluations

For Black, evaluations are stored from White's point of view.

Therefore:

```text
lower cp = better for Black
```

For example:

```text
-50 → better
-20
+10
+80 → worse
```

Those values form the Black ranking in ascending cp order.

## Ranking mates and cp together

`Known:` EC's custom ranking must handle mate and cp evaluations together without converting mate scores into artificial cp numbers.

For Black, the conceptual order is:

```text
best
↓
fastest forced mate for Black
slower forced mate for Black
ordinary cp evaluations, lowest cp first
forced mate against Black, latest mate first
faster mate against Black
↓
worst
```

For example:

```text
Black mates in 3  → rank 1
Black mates in 5  → rank 2
-400 cp           → rank 3
+50 cp            → rank 4
White mates in 8  → rank 5
White mates in 3  → rank 6
```

Moves with the same complete evaluation result share the same custom rank.

## Successful empty response

`Known:` A successful response containing no usable moves must be represented explicitly as:

```text
EMPTY
```

If an older trusted snapshot exists and a deliberate successful refresh returns genuinely zero usable moves:

```text
old snapshot
→ complete successful empty response
→ atomically replace old snapshot
→ new status = EMPTY
```

This prevents old move rows from surviving after the source has successfully returned no moves.

## Missing snapshot

When a required snapshot is genuinely missing:

```text
MISSING
→ fetch source
→ obtain complete response
→ validate
→ save atomically as VALID or EMPTY
```

No partial snapshot is visible while this happens.

## Atomic creation and replacement

`Known:` Whenever EC creates or replaces a snapshot, the complete incoming snapshot must be validated first.

Only after validation succeeds may EC commit the new snapshot.

Conceptually:

```text
fetch complete response
→ parse
→ validate
→ compute custom ranks
→ begin atomic replacement
→ save snapshot
→ save complete move set
→ commit
```

Readers must never observe:

- half the old rows deleted;
    
- only some new rows inserted;
    
- a temporarily empty snapshot;
    
- a mixture of old and new rows.
    

## Successful fresh snapshot replaces the whole old snapshot

`Known:` When replacement is actually required, a successful new source response replaces the entire previous snapshot for that position + source.

Do not independently upsert each move forever.

So:

```text
old snapshot:
A
B
C
D

fresh validated snapshot:
A
B
C

commit:
A
B
C
```

Not:

```text
A
B
C
D
```

Old D must disappear because it did not occur in the replacement snapshot.

#bug EC currently upserts engine-evaluation rows independently and does not necessarily remove stale rows absent from a later complete response. This can create a mixed snapshot that no engine source ever returned.

## Do not overwrite trusted cache during normal generation

`Known:` Normal generation reuses `VALID` and `EMPTY` snapshots.

It does not refetch them merely because they are old.

Therefore:

```text
VALID / EMPTY
→ reuse
→ no overwrite
```

Replacement is needed only when there is an explicit reason, such as:

- first creation because cache is missing;
    
- explicit refresh;
    
- explicit rebuild/repair;
    
- replacement of cache known to be invalid.
    

## Failed source request

`Known:` A failed fetch must never overwrite a trusted snapshot.

So:

```text
old VALID snapshot
→ new fetch attempt fails
→ keep old VALID snapshot unchanged
```

Similarly:

```text
old EMPTY snapshot
→ refresh attempt fails
→ keep old EMPTY snapshot unchanged
```

A failed or partial response is never committed as a replacement.

#bug Any current path capable of writing partial or failed API data into the cache must be changed. Snapshot replacement happens only after the complete incoming result has passed validation.

## Refreshing a trusted snapshot

`Known:` During an explicit refresh, the existing trusted snapshot remains active.

For example:

```text
old VALID snapshot
→ refresh begins
→ readers continue using old VALID snapshot
→ fresh response validates
→ atomic replacement
→ readers now see new snapshot
```

If the new response fails validation:

```text
→ old snapshot stays active
→ refresh operation fails
→ old snapshot status remains unchanged
```

A malformed replacement attempt must not make trusted existing data `INVALID`.

## Refresh failure

`Known:` A failed refresh has its own operation-level failure record or log.

For example:

```text
snapshot status = VALID
refresh attempt = FAILED_MALFORMED_RESPONSE
```

These facts can coexist:

- the existing cache is trustworthy;
    
- the attempted refresh failed.
    

Do not confuse operation status with snapshot status.

## INVALID snapshots

`Known:` `INVALID` means the stored snapshot itself is known to be unusable.

An invalid snapshot must not be used by [[PV]] or [[B4]].

It remains blocking until explicitly repaired, rebuilt, cleared or deleted.

So:

```text
INVALID
→ do not use
→ stop normal generation at this dependency
```

A normal programme restart must not silently turn:

```text
INVALID
```

into:

```text
MISSING
```

and blindly repeat the same deterministic failure forever.

## Invalid reason

`Known:` An `INVALID` snapshot stores a short machine-readable reason.

For example:

```text
MALFORMED_LICHESS_EVAL
DUPLICATE_MOVE
MISSING_EVAL
MALFORMED_EVAL
INCONSISTENT_SNAPSHOT
```

Human-readable detail belongs in logs.

The reason code exists so that resume and repair logic does not need to parse prose logs to understand why the cache is blocked.

## EC owns validation state

`Known:` EC owns the integrity state of the engine snapshot cache.

When EC discovers that stored cache data is invalid, EC marks it:

```text
status = INVALID
reason = ...
```

The caller should not independently invent a conflicting cache state.

This gives the cache one authoritative owner for:

- VALID;
    
- EMPTY;
    
- INVALID;
    
- invalid reason.
    

## Repairing INVALID cache

`Known:` Repair/rebuild replaces the complete remote snapshot from scratch.

Do not patch individual bad rows.

Conceptually:

```text
INVALID snapshot
→ explicit repair/rebuild
→ refetch complete source response
→ validate from scratch
→ compute ranks
→ atomically replace old snapshot
→ status = VALID or EMPTY
→ clear invalid reason
```

The old malformed snapshot does not remain in the active cache after successful repair.

## Avoiding hard-error loops

`Known:` Deterministic cache failures must not be blindly retried every time generation restarts.

If generation previously stopped because a snapshot is persistently `INVALID`:

```text
restart
→ snapshot still INVALID
→ surface blocking error immediately
→ do not make another automatic identical attempt
```

An explicit repair, rebuild, clear or delete action is required before normal generation treats that cache dependency as usable again.

Transient external failures are different.

A later generation run may retry those because the network/API condition may genuinely have changed.

## Resume after hard error

#roadmap Generation must be resumable from the last safely completed position after a hard error.

The intended behaviour is:

```text
position A
→ fully committed

position B
→ fully committed

position C
→ hard error
→ no unsafe partial C state committed

restart later
→ A and B remain completed
→ continue from C when the blocking condition has been repaired
```

The system should persist:

- failed position;
    
- failure class;
    
- enough information to distinguish deterministic from transient failure.
    

Deterministic failures remain blocking until repaired.

Transient failures may be tried again on a later run.

The exact generation checkpoint mechanism belongs above EC in the generation/queue architecture, not inside the engine cache itself.

## Concurrent writes

`Known:` Only one EC create/replace operation may write the same:

```text
position + source
```

snapshot at a time.

If another caller asks for the same snapshot while a write is already in progress:

```text
writer A
→ owns current write

writer B
→ wait for A
or
→ reuse A's completed result
```

Do not run two competing writes for the same snapshot.

## Concurrent reads

`Known:` Readers must always see a complete trusted snapshot.

During replacement:

```text
old trusted snapshot
→ remains visible

new snapshot
→ built and validated separately

atomic commit
→ readers switch to new snapshot
```

There must never be a visible intermediate state.

If the replacement fails:

```text
→ readers continue seeing old trusted snapshot
```

## Explicit deletion

`Known:` Explicit deletion removes the snapshot from the active cache completely.

So:

```text
VALID
EMPTY
INVALID
→ explicit delete
→ MISSING
```

No tombstone is required in the active cache.

Historical information may remain in logs if useful.

## Lichess retry/rate-limit state is not EC state

Lichess request timing and retry behaviour belongs to [[FR]] and the central request layer, not EC.

EC should only receive the successful result that is ready to become a snapshot.

The agreed request behaviour is:

`Known:` Lichess Opening Explorer keeps its separate approximately 25-requests-per-minute request interval.

`Known:` Lichess Cloud Evaluation uses separate handling. After HTTP `429`:

```text
→ wait 65 seconds
→ allow another controlled retry
```

If the automatic Lichess Cloud Evaluation retry cycle is exhausted, ask the user what to do.

Conceptually:

```text
Enter
→ retry another full cycle
→ useful after changing VPN

n
→ skip Lichess for the rest of this generation run

s
→ stop generation
```

Lichess is not automatically disabled for the whole run merely because one retry cycle failed.

If the user explicitly chooses to skip it:

```text
lichessAvailableThisRun = false
```

Later positions skip Lichess and continue to ChessDB/local Stockfish.

That flag is temporary run state and is not persisted as an EC snapshot status.

#bug Repeated failed Lichess attempts can currently cause useless API calls throughout one generation run. The central retry layer should support an explicit user-selected "skip Lichess for this run" state.

#bug Lichess Cloud Evaluation `429` handling must use the agreed 65-second cooldown before another Cloud Evaluation request. Opening Explorer retains its separate request interval.

## Intended EC flow

For normal lookup:

```text
need remote engine snapshot
↓
look up normalised position + source
↓
status?
├─ VALID
│  → return trusted snapshot
│
├─ EMPTY
│  → return trusted empty snapshot
│
├─ MISSING
│  → fetch source
│  → validate complete response
│  → compute custom ranks
│  → atomically save VALID or EMPTY
│  → return snapshot
│
└─ INVALID
   → do not use
   → surface blocking failure
   → require explicit repair/rebuild/clear/delete
```

For explicit refresh of trusted cache:

```text
existing VALID / EMPTY
↓
keep old snapshot active
↓
fetch fresh source response
↓
validate complete response
├─ success
│  → compute ranks
│  → atomically replace
│  → update fetchedAt
│
└─ failure
   → keep old trusted snapshot
   → log refresh failure
   → fail refresh operation
```

For explicit INVALID repair:

```text
INVALID
↓
explicit repair/rebuild
↓
fetch source from scratch
↓
validate complete response
├─ success
│  → replace whole snapshot atomically
│  → VALID or EMPTY
│  → clear invalid reason
│
└─ failure
   → remain blocked
   → do not create partial trusted cache
```

## Bugs

#bug EC currently models engine cache data primarily as individually upserted move rows rather than as one complete trusted position/source snapshot. This allows stale rows from older responses to survive and can make [[PV]] reason from a list that no engine source actually returned.

#bug Snapshot replacement must never expose partially written data. Any current row-by-row replacement path without transactional snapshot semantics risks mixing old and new data.

#bug A successful empty response must be represented explicitly. An empty snapshot must not be confused with missing cache or source failure.

#bug Lichess snapshot validation must be strict. A malformed move inside the returned Lichess list must prevent the complete incoming snapshot from becoming trusted cache.

#bug Any persisted rank derived from external row order or source-provided ranking must be replaced by the project's own `customRank` derived from validated evaluations.

#bug SAN should not be the primary engine-cache move identity. EC should use UCI/LAN-style engine move identity and derive SAN only when needed elsewhere.

#bug Any code that automatically retries persistent deterministic `INVALID` cache state on every generation restart risks creating a hard-error loop. An invalid stored snapshot remains blocking until explicitly repaired, rebuilt, cleared or deleted.

## Roadmap

#roadmap Replace the existing individual engine-evaluation cache-row model with complete `EngineSnapshot` + `EngineSnapshotMove` persistence.

#roadmap Add explicit snapshot states:

```text
MISSING
VALID
EMPTY
INVALID
```

with a machine-readable invalid reason where applicable.

#roadmap Add atomic create, replacement, refresh and repair transactions so readers never observe partial snapshots.

#roadmap Store:

```text
positionKey
source
status
fetchedAt
material request context
invalidReason when INVALID
```

on the snapshot.

#roadmap Store:

```text
uciMove
cp / mate
customRank
```

on each move row.

#roadmap Add custom dense ranking derived from validated evaluations, including explicit mate-aware ordering.

#roadmap Add explicit snapshot repair/rebuild tooling that replaces an `INVALID` snapshot from scratch rather than patching rows.

#roadmap Make generation resumable after hard errors while preventing deterministic failures from being blindly retried in a loop.

## Notes

`Known:` A remote engine snapshot is a complete response unit, not merely a collection of unrelated move rows.

`Known:` A trusted snapshot is reused indefinitely during normal generation unless explicitly refreshed, rebuilt, invalidated or deleted.

`Known:` Lichess uses one MultiPV-5 snapshot per position.

`Known:` ChessDB uses the complete usable `queryall` result.

`Known:` ChessDB may discard malformed raw move evaluations before constructing the trusted snapshot.

`Known:` Lichess validation is strict: any malformed returned move invalidates the complete incoming snapshot.

`Known:` EC stores only the project's own dense `customRank`.

`Known:` Equal evaluations receive the same custom rank.

`Known:` Evaluation data remains the source of truth even though `customRank` is stored.

`Known:` UCI/LAN is the engine-cache move identity. SAN is derived elsewhere.

`Known:` Local Stockfish results do not belong in EC's reusable remote-snapshot cache.

`Known:` A failed fetch is operation/run state, not persistent snapshot state.

`Known:` A failed refresh cannot destroy an existing trusted snapshot.

`Known:` An `INVALID` stored snapshot is blocking until explicitly repaired or cleared.

`Known:` Snapshot replacement is atomic for both writers and readers.

#roadmap Build explicit engine-cache maintenance tools for refresh, rebuild, invalid-snapshot repair and deletion. These operations must use the same validation and atomic replacement rules as EC and must never silently refresh trusted cache during normal generation.