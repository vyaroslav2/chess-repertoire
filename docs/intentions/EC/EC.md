---
tags:
  - processed
---
# EC — Remote engine cache

  

## Intention

  

EC owns reusable remote engine analysis from:

  

```text

Lichess Cloud Evaluation

ChessDB

```

  

Its job is to preserve each successful remote response as one coherent result, make that result safely reusable across repertoire rebuilds, and prevent stale or mixed engine data from affecting move verification.

  

Local Deep Stockfish does not use EC. Its cache is separate.

  

## Current code

  

The current implementation stores engine evaluations largely as individual rows.

  

That creates a stale-row risk when a later complete source response contains fewer moves than an older response.

  

For example:

  

```text

old response

A

B

C

D

  

new response

A

B

C

```

  

If the implementation only upserts A, B and C, D may survive even though no current source response contained:

  

```text

A

B

C

D

```

  

#bug Remote engine data must be stored/replaced as one coherent source result rather than as an indefinitely accumulating set of independent move rows.

  

## Exact source identity

  

`Known:` Remote engine analysis is tied to the exact concrete position sent to the provider.

  

Use:

  

```text

FullFen

```

  

not only `PositionKey`.

  

`PositionKey` is useful for shared repertoire-position identity, but it is not sufficient engine-cache identity because two concrete progressions may share one PositionKey while differing in rule-sensitive FEN state.

  

## Evaluation profile

  

`Known:` Cache compatibility also depends on the request/analysis policy.

  

Conceptually:

  

```text

FullFen

+ source

+ evaluationProfile

```

  

identifies one remote fetch context.

  

`evaluationProfile` is a stable identifier derived from settings that materially change what the source is asked to return.

  

Examples include:

  

```text

MultiPV / requested move count

provider query mode

depth/nodes if the provider exposes such settings

other request options that materially alter analysis coverage

```

  

Examples conceptually:

  

```text

"Lichess-default-v1"

"ChessDB-queryall-v1"

```

  

A different profile is different cache evidence.

  

So:

  

```text

same FullFen

same source

different evaluationProfile

→ do not treat as the same fetch

```

  

## RemoteEngineFetch

  

`Known:` Fetch status is separate from individual move evaluations.

  

One successful fetch record means:

  

> this exact FullFen + source + evaluationProfile was queried successfully, and the complete result returned by that query was processed

  

Conceptually:

  

```text

RemoteEngineFetch

- FullFen

- source

- evaluationProfile

- fetchedAt

```

  

A fetch marker does **not** mean every legal move was evaluated.

  

It means only that the complete response supplied by that provider/profile was processed successfully.

  

## RemoteEngineEvalCache

  

Each usable evaluated move returned by that successful fetch is stored as a child evaluation.

  

Identity:

  

```text

FullFen

+ UCI/LAN move

+ source

+ evaluationProfile

```

  

Stores conceptually:

  

```text

FullFen

UCI/LAN move

cp or mate

source

evaluationProfile

rank, if useful

sourceVersion, if exposed

fetchedAt / fetch reference

```

  

SAN may be retained as display metadata if useful, but UCI/LAN is authoritative move identity.

  

`sourceVersion` is provenance metadata, not cache identity unless a future evaluation profile deliberately includes it.

  

## Evaluation meaning

  

`Known:` Every stored move evaluation has one project-wide meaning:

  

> the value of choosing this specific move from this exact source FullFen

  

All providers are normalised to the project's White-positive convention:

  

```text

positive cp

→ better for White

  

negative cp

→ better for Black

```

  

Mate remains explicit.

  

Do not convert mate into an artificial centipawn number.

  

## Complete-source result

  

A remote fetch is processed as one complete source result.

  

For Lichess this may be a small MultiPV/root-move result.

  

For ChessDB it may be the usable evaluated moves returned by `queryall`.

  

The exact coverage is defined by `evaluationProfile`, not by an architectural assumption that one fixed profile will exist forever.

  

## Successful empty result

  

`Known:` A source may be queried successfully and return no usable evaluated moves.

  

That is valid source state.

  

Represent it as:

  

```text

RemoteEngineFetch exists

+ zero matching RemoteEngineEvalCache rows

```

  

Do not create a fake move such as `_EMPTY_`.

  

This is distinct from:

  

```text

no RemoteEngineFetch

→ source/profile has not been fetched successfully

```

  

## Candidate present

  

When checking one candidate:

  

```text

matching FullFen

+ candidate UCI/LAN

+ source

+ evaluationProfile

```

  

and a cached evaluation exists:

  

```text

→ reuse it

```

  

No new API call is required.

  

## Candidate absent after successful fetch

  

`Known:` If the source/profile was successfully fetched but the candidate move was absent from the returned analysis:

  

```text

RemoteEngineFetch exists

+ no matching candidate evaluation

→ candidate unavailable from this source

```

  

Do not automatically keep re-querying the same source/profile in the hope that the missing candidate appears.

  

Continue the normal verification waterfall.

  

The fetch marker means:

  

```text

we asked this source/profile successfully

```

  

not:

  

```text

we evaluated every legal move

```

  

## Normal cache lifetime

  

`Known:` Remote engine cache data has no routine expiry.

  

During ordinary generation:

  

```text

successful matching fetch exists

→ reuse

→ do not refetch automatically

```

  

Human-data snapshot refreshes do not delete remote engine cache data.

  

Repertoire-tree rebuilds do not delete remote engine cache data.

  

Remote results are effectively frozen until an explicit refresh is requested.

  

## Explicit refresh

  

`Known:` Refresh is deliberate.

  

Conceptually:

  

```text

explicit refresh

→ query selected FullFen + source + evaluationProfile again

→ validate complete returned result

→ atomically replace that exact source/profile result

```

  

If the fresh request fails:

  

```text

→ keep old trusted data unchanged

→ report refresh failure

```

  

A failed refresh must not destroy a previously valid cache result.

  

If a successful refresh returns fewer moves, stale moves absent from the fresh complete result must disappear.

  

If it returns no usable moves:

  

```text

→ keep successful fetch marker

→ remove old move rows for that identity

```

  

## Atomic replacement

  

Create or replace a remote source result atomically.

  

Conceptually:

  

```text

fetch complete response

→ parse

→ validate

→ normalise evaluations

→ determine move set

→ replace old matching source/profile result atomically

```

  

Readers must never observe a mixture of old and new moves for the same:

  

```text

FullFen + source + evaluationProfile

```

  

## Validation

  

Malformed source data must not silently become chess evidence.

  

Examples of invalid data:

  

```text

duplicate UCI moves in one coherent result

missing required evaluation

malformed cp

NaN

invalid mate representation

illegal/unparseable move

```

  

Source-specific parsing may decide whether one malformed raw row can be discarded before a trusted result is formed.

  

After EC has created a trusted result, the persisted result itself must be internally coherent.

  

## Ranking

  

If a stored custom rank is useful for inspection/UI, derive it from the normalised evaluation.

  

Do not treat provider rank labels as the project's source of truth.

  

For Black, ordinary cp ordering is:

  

```text

lower cp

→ better for Black

```

  

Mate-aware ordering remains explicit rather than being simulated with huge cp values.

  

Verification code should still be able to establish ordering from the actual evaluations rather than blindly trusting cached rank metadata.

  

## Relationship to PV and B4

  

EC owns remote evidence.

  

[[PV]] decides what one coherent remote result proves about one candidate.

  

[[B4]] decides which source to try next.

  

Conceptually:

  

```text

EC

→ give trusted Lichess evidence if available

→ give trusted ChessDB evidence if available

  

PV

→ ACCEPT / REJECT / INCONCLUSIVE for one candidate

  

B4

→ continue waterfall where required

```

  

## Separation from Local Deep Stockfish

  

Local Deep Stockfish cache identity is separate:

  

```text

FullFen

+ checked UCI/LAN move

+ evaluationProfile

```

  

EC must not merge Local Deep results into remote fetch state.

  

`"Local Deep Stockfish"` may still be the evaluation source stored on a selected repertoire RESPONSE, but it is not a remote EC source.

  

## Bugs / clean-up

  

#bug Current row-by-row remote cache writes can leave stale moves from earlier source responses. Replace the complete matching source/profile result atomically.

  

#bug Do not key remote engine cache only by normalised four-field position identity. Use exact FullFen.

  

#bug Do not assume one permanent request profile such as fixed MultiPV 5 is sufficient cache identity. Include `evaluationProfile`.

  

#bug Do not infer "source already fetched" merely because some unrelated engine row exists. Use explicit `RemoteEngineFetch`.

  

## Result

  

EC should leave the project with:

  

```text

exact FullFen remote identity

source-specific evaluationProfile

explicit successful fetch state

UCI/LAN move identity

one coherent returned result per fetch identity

candidate-absent semantics without repeated refetching

White-positive evaluation normalisation

mate kept separate

atomic replacement

indefinite reuse during normal generation

explicit refresh only

no coupling to repertoire-tree lifetime

```