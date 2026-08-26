---
tags:
  - processed
---
# FC — Save human Explorer data

  

## What the code does

  

FC is currently a low-level writer for one human-move cache row.

  

The current caller supplies:

  

```text

position

database/source type

SAN move

games

White wins

draws

Black wins

```

  

The current implementation identifies a row by:

  

```text

normalised position

+ database type

+ SAN

```

  

and upserts that individual row.

  

It also uses the special SAN:

  

```text

_EMPTY_

```

  

to remember that a source was fetched successfully but returned no moves.

  

That accurately describes the current code, but it is not the intended future cache model.

  

## Intended responsibility

  

`Known:` FC/the human-cache writer should persist one **complete validated human source result**, not independently accumulate SAN rows forever.

  

Conceptually:

  

```text

validated source result

→ HumanExplorerFetch

→ zero or more ExplorerMoveCache rows

```

  

The successful-fetch record and its child move rows belong together.

  

## HumanExplorerFetch

  

One successful fetch record identifies:

  

```text

Position / PositionKey

+ HumanDataSnapshot

+ database type

```

  

It means:

  

> this source was queried successfully for this position under this snapshot

  

It does not require any fake move row.

  

## Successful empty result

  

A successful result with zero moves is stored as:

  

```text

HumanExplorerFetch exists

+ zero ExplorerMoveCache rows

```

  

Do not store:

  

```text

SAN = "_EMPTY_"

```

  

`_EMPTY_` is obsolete in the intended design.

  

## Move identity

  

`Known:` Authoritative move identity is UCI/LAN.

  

External SAN is converted before persistence.

  

One move row is identified by:

  

```text

Position

+ HumanDataSnapshot

+ database type

+ UCI/LAN move

```

  

Stores conceptually:

  

```text

UCI/LAN move

SAN, as source/display metadata

games

White wins

draws

Black wins

```

  

SAN must not be the unique chess-move identity.

  

## Validation before write

  

Before FC commits anything, the complete source result must already be validated.

  

For every returned move:

  

```text

SAN

→ validate against exact source position

→ convert to UCI/LAN

```

  

If one move cannot be legally converted:

  

```text

→ reject complete result

→ write no move rows

→ do not create successful fetch marker

```

  

Do not silently drop the broken move.

  

## Complete replacement

  

A successful fresh fetch replaces the complete old result for the exact source bucket.

  

Conceptually:

  

```text

old:

A

B

C

D

  

fresh:

A

B

C

  

commit:

A

B

C

```

  

D must disappear.

  

Do not implement refresh as independent move upserts that leave stale rows behind.

  

#bug The current row-by-row upsert model can retain moves absent from a later complete source response.

  

## Atomic write

  

The intended write is atomic:

  

```text

validate complete result

→ begin transaction

→ replace old move rows for exact bucket

→ write complete new move set

→ write/confirm HumanExplorerFetch

→ commit

```

  

For a successful empty result:

  

```text

validate empty response

→ begin transaction

→ remove old move rows for exact bucket

→ write/confirm HumanExplorerFetch

→ commit

```

  

Readers must not observe a half-replaced human dataset.

  

## Failed request

  

A failed request is not written as successful-empty state.

  

```text

request failed

→ no new HumanExplorerFetch

→ no partial move rows

```

  

If an older trusted result exists during an explicit refresh and the refresh fails, keep the older trusted result unchanged.

  

## Statistics

  

FC stores raw counts.

  

It does not calculate repertoire inclusion probability or RESPONSE ranking.

  

Those calculations belong to higher-level logic.

  

For a move:

  

```text

moveGames

= White wins + draws + Black wins

```

  

A source's `totalGames` can be reconstructed from the complete returned move set where appropriate.

  

## Snapshot ownership

  

Human move rows belong to one `HumanDataSnapshot`.

  

They are not reusable across incompatible explorer-request settings.

  

A repertoire-tree rebuild does not itself invalidate a compatible HumanDataSnapshot.

  

## Result

  

The intended FC design is:

  

```text

complete source-result writer

explicit HumanExplorerFetch state

zero-move success without _EMPTY_

UCI/LAN authoritative move identity

SAN display/source metadata only

complete validation before write

atomic replacement

no stale rows after refresh

raw counts only

```