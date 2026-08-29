---
tags:
  - processed
---
# F — Get human move data

  

## What the code does

  

F receives one chess position and currently returns three human-move datasets:

  

```text

Masters

Elite

Amateur

```

  

The current implementation normalises the FEN to four fields, reads/writes the existing human cache, and fetches missing data from Lichess Explorer.

  

The current cache uses SAN move rows and the special `_EMPTY_` placeholder.

  

The current implementation can also refetch all three groups when only one is missing, can leave stale SAN rows after a refresh, and can confuse failed requests with empty data.

  

Those are current-code behaviours, not the intended cache architecture.

  

## Intended responsibility

  

`Known:` F is the shared human-data source layer.

  

It should:

  

```text

receive the concrete repertoire position

→ identify the current HumanDataSnapshot

→ read compatible cached human source data

→ fetch only genuinely missing required source data

→ validate complete results

→ store them through the human-cache layer

→ return the required human datasets

```

  

F does not decide which White moves survive and does not rank Black RESPONSES.

  

Those decisions belong to A/B logic.

  

## Position identity

  

Human source data is reusable by chess position inside one compatible HumanDataSnapshot.

  

The stable shared chess-position identity is:

  

```text

PositionKey

```

  

The concrete node still retains its full six-field `FullFen`.

  

When calling an external API, use the exact request form expected by that API.

  

Do not shorten a full FEN merely because local cache identity uses PositionKey.

  

#bug Current F sends the four-field normalised FEN to Lichess Explorer. External requests should use the appropriate full source position while local shared-position identity remains separate.

  

## HumanDataSnapshot

  

`Known:` Human data belongs to one repertoire's `HumanDataSnapshot`.

  

The snapshot represents one coherent human-explorer request context.

  

Compatibility depends only on settings that affect what human data is fetched, for example:

  

```text

rating range

time controls

population/database filters

other explorer request filters

```

  

General generation-policy settings do not invalidate the raw snapshot.

  

For example:

  

```text

depth budget changes

mainline threshold changes

Masters weighting changes

engine tolerance changes

→ human source data may still be reusable

```

  

## Snapshot lifetime

  

A compatible human snapshot is reusable for one week or longer.

  

```text

age < 7 days

→ definitely reuse

  

age >= 7 days

→ eligible for deliberate replacement

→ do not expire automatically

```

  

A failed repertoire generation does not invalidate the snapshot.

  

The next from-root rebuild reuses it when still compatible.

  

## Required source groups today

  

The current repertoire uses:

  

```text

Masters

Elite

Amateur

```

  

for different purposes.

  

### White OPPONENT coverage

  

`Known:` White-move inclusion uses only Amateur statistics.

  

Masters and Elite must not affect which White opponent moves are included.

  

### RESPONSE candidate construction

  

`Known:` Masters and Elite are used to construct/rank Black human candidate moves according to the B logic.

  

Masters and Elite therefore remain useful even though Master Threat logic has been discarded.

  

## Trap/threat clean-up

  

`Known:` Master Threat and Amateur Trap behaviour has been discarded from the intended repertoire architecture.

  

F should not fetch or preserve Masters data because of "Master Threat detection".

  

Masters exists because it contributes to RESPONSE human-candidate construction.

  

## Successful fetch state

  

`Known:` A successful empty result must be distinct from a missing fetch.

  

Use explicit successful-fetch state rather than fake move rows.

  

Conceptually:

  

```text

HumanExplorerFetch

- Position / PositionKey

- HumanDataSnapshot

- database type

```

  

Then:

  

```text

no HumanExplorerFetch

→ not fetched successfully

```

  

```text

HumanExplorerFetch exists

+ zero move rows

→ fetched successfully

→ genuinely empty

```

  

```text

HumanExplorerFetch exists

+ move rows

→ fetched successfully

→ use returned moves

```

  

Do not use `_EMPTY_` as a fake SAN.

  

## Move identity

  

`Known:` Human-cache move identity is UCI/LAN, not SAN.

  

External APIs may return SAN.

  

On a successful response:

  

```text

API SAN

→ validate against exact source position

→ convert to UCI/LAN

→ store UCI/LAN as authoritative identity

→ retain SAN only as source/display metadata

```

  

If one returned SAN cannot be legally converted:

  

```text

→ reject the complete database fetch

→ store none of its moves

→ do not mark fetch successful

→ hard error / invalid source result

```

  

Do not silently preserve a partial statistical dataset.

  

## Complete bucket replacement

  

`Known:` One successful human source fetch is a coherent result.

  

If a source bucket is deliberately refreshed:

  

```text

old complete result

→ fresh complete result

→ atomically replace old result

```

  

Do not upsert only returned moves and leave stale moves that disappeared from the source response.

  

#bug Current row-by-row upserts can leave stale move rows after refresh.

  

## Missing data

  

Ordinary generation fills only missing required source data in the current compatible snapshot.

  

If two source groups are already complete and one is missing:

  

```text

→ reuse the two complete groups

→ fetch the missing group

```

  

Do not refetch all three merely because one is missing.

  

#bug Current all-or-nothing cache reuse can unnecessarily refetch already complete source groups.

  

## Fetch failure

  

`Known:` If required human data still cannot be fetched after the source's retry policy is exhausted:

  

```text

→ hard generation error

```

  

Do not turn failure into an empty dataset.

  

A genuine successful empty response and a failed request are different states.

  

#bug Current code can let failure look like empty data.

  

## Rate limiting

  

Lichess Explorer request spacing and retry behaviour belong at the actual request layer.

  

F should not depend on ad-hoc sleeps between high-level source groups.

  

The central API configuration owns the intended rate-limit/retry values.

  

## Opening classification

  

`Known:` ECO and `openingName` do **not** belong to global Position or human-cache data.

  

Opening classification is progression/history-specific.

  

It belongs to the canonical repertoire node whose canonical UCI/LAN history produced that progression.

  

A fresh Masters response may supply useful opening information, but storing it globally by PositionKey would be incorrect.

Opening metadata is cached and restored by exact canonical UCI/LAN history, not by `PositionKey`. Before a from-root rebuild replaces nodes, preserve the opening metadata state of each exact history; restore it only when that same history survives. A transposing history must not inherit or overwrite classification merely because it reaches the same board position.

Every generated ply must have a completed opening-metadata state, including the position after Black's response and every leaf at the generation depth boundary. Node creation alone must not leave `openingMetadataStatus` unchecked. Before generation completes, each surviving exact-history node must contain either `PRESENT` metadata or source-attributed `VALID_ABSENCE`.

The authoritative opening-metadata cache is durable and independent of disposable repertoire nodes. It is keyed by repertoire plus exact canonical history; node fields are the materialised UI projection. Interrupted rebuilds must not erase metadata for histories that have not yet been recreated.

The stored state is one of:

```text
PRESENT
→ both ECO and openingName are present
→ source = LICHESS_MASTERS

VALID_ABSENCE
→ the Masters request succeeded, supplied no opening classification, and no earlier named history prefix exists
→ source = LICHESS_MASTERS
```

The Masters response's optional `opening` field may be absent on a following move even though the latest named opening still applies. When it is absent, inherit the nearest earlier `PRESENT` classification on the same exact route. This follows Lichess's opening-data convention of walking backward to the latest named position. Do not convert that case into `VALID_ABSENCE`.

Technical Masters failure is neither state. Masters is required human data, so failure after its retry policy is a hard generation error.

Opening metadata source is mandatory whenever an opening metadata state is stored. ECO/opening values without a source, or a source without a valid checked state, are invalid. The diagnostic must print both how the value was obtained in this run (`fresh Masters response` or `restored exact-history cache`) and its source label (`Lichess Opening Explorer — Masters metadata`).

The UI reads ECO/opening metadata from the node for the exact history currently displayed, so the classification changes live as the user moves through the repertoire.

  

## Wikibooks

  

`Known:` Wikibooks text does **not** belong to F or the human cache.

  

Wikibooks information is history-specific and follows [[W]].

  

It must not be treated as global Position metadata.

  

## Granular human-data roadmap

  

#roadmap A future granular cache may store independent rating/time-control buckets rather than only today's coarse Amateur/Elite groups.

  

That future design should preserve the same principles:

  

```text

one coherent source bucket

explicit successful-empty state

independent missing/complete state

UCI move identity

atomic refresh replacement

compatibility based on explorer request settings

```

  

Today's repertoire can still assemble its intended Amateur/Elite views from those buckets.

  

## Result

  

F should provide:

  

```text

coherent human source data

per HumanDataSnapshot

reuse of compatible completed data

fetch only missing required source groups

hard error on required source failure

explicit successful-empty state

UCI/LAN authoritative move identity

atomic complete-result replacement

Amateur-only White coverage input

Masters + Elite RESPONSE candidate input

no trap/threat purpose

no global ECO/opening ownership

no Wikibooks ownership

```
