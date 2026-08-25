---
tags:
  - processed
---
# FN — Create the position key from a full FEN

## Intention

`Known:` FN exists to create the canonical position identity used by the database, caches, and transposition logic.

It is not the project's general FEN representation.

The project keeps two separate concepts:

```text
FullFen
→ complete six-field chess state

PositionKey
→ canonical four-field position identity
```

## Raw FEN input

`Known:` New system input must be a full valid six-field FEN.

A four-field position key is internal identity data only. It must not be accepted as though it were a full FEN.

The raw-input boundary is:

```text
raw FEN string
→ validate
→ canonicalise
→ FullFen
```

Invalid or incomplete FEN is a hard error.

Do not:

- normalise it anyway
    
- create a database/cache key from it
    
- store anything under it
    

## Parsing and canonicalisation

`Known:` Raw FEN parsing, validation, and canonicalisation are separate from position-key generation.

Provide a boundary helper such as:

```ts
parseFullFen(raw: string): FullFen
```

Its result must be a valid canonical six-field FEN.

Canonicalisation may change textual representation, but it must not change the chess state represented by the input.

If canonicalisation changes the meaning of the position, treat the input as invalid.

## FullFen

`Known:` `FullFen` is the authoritative chess-state representation.

Use it for:

- engines
    
- external APIs
    
- chess-rule calculations
    
- move generation
    
- anything that depends on the half-move clock
    
- anything that depends on the full-move number
    

Stored `FullFen` values must be canonical six-field FENs rather than arbitrary input text.

`FullFen` is immutable. A move produces a new canonical `FullFen`; an existing value is not edited in place.

## PositionKey

`Known:` Rename the current `normalizeFen()` concept to:

```ts
positionKeyFromFen()
```

The contract is:

```text
canonical FullFen
→ positionKeyFromFen()
→ PositionKey
```

`positionKeyFromFen()` should accept only an already validated canonical `FullFen`.

Passing an existing four-field `PositionKey` into it is misuse and should fail rather than silently succeed.

`Known:` `positionKeyFromFen()` is the only place allowed to create a `PositionKey` from a full FEN.

No other part of the program should manually reproduce the operation with string splitting.

## PositionKey fields

`Known:` `PositionKey` contains these four pieces of position identity:

```text
piece placement
side to move
castling rights
effective en passant square
```

It excludes:

```text
half-move clock
full-move number
repetition history
```

## Piece placement

`Known:` Piece placement uses the exact canonical FEN board layout.

Any difference in the board layout means a different `PositionKey`.

Do not reduce position identity to material, occupied squares, or any other abstraction.

## Side to move

`Known:` Side to move is part of position identity.

Therefore:

```text
same board
same castling rights
same en passant state
different side to move
→ different PositionKey
```

The legal move set and interpretation of the position are different.

## Castling rights

`Known:` Castling rights remain part of position identity because they can change the set of legal moves.

Therefore:

```text
same pieces
same side to move
different castling rights
→ different PositionKey
```

Impossible castling rights must not be silently repaired.

For example, if the FEN claims castling rights that are inconsistent with the required king or rook placement:

```text
→ invalid FullFen
→ hard error
```

## En passant

`Known:` En passant remains part of position identity when it can genuinely affect legal play.

However, `PositionKey` should represent the effective legal position rather than blindly copying a nominal en passant target from the source FEN.

Therefore:

```text
en passant target exists in FullFen
but no legal en passant capture is possible
→ normalise en passant to "-"
for PositionKey
```

This means:

```text
same board
same side to move
same castling rights
nominal but unusable en passant square differs
→ same PositionKey
```

But:

```text
legal en passant capture exists
→ preserve the en passant square
→ different PositionKey
```

This is deliberate because it gives the transposition-merging system a more useful definition of legally equivalent positions.

## Half-move clock and full-move number

`Known:` Both fields must still be valid in every `FullFen`.

The fact that `PositionKey` discards them does not make malformed values acceptable.

The half-move clock must be a valid non-negative value.

The full-move number must be a valid positive move number.

Malformed values cause the whole FEN to fail validation.

## Fifty-move rule

`Known:` The half-move clock is deliberately ignored for repertoire position identity and transposition merging.

Therefore two concrete histories can share one `PositionKey` even if their half-move clocks differ.

Each progression still retains its own `FullFen`, including the real half-move clock.

For example:

```text
same effective position
half-move clock 0
→ same PositionKey

same effective position
half-move clock 99
→ same PositionKey
```

Engines and rule-sensitive logic must use the corresponding `FullFen`, not the `PositionKey`.

#deferred If the project later needs rule-perfect late-game merging, reconsider the fifty-move-rule treatment.

## Threefold repetition

`Known:` Repetition history is not part of `PositionKey`.

Two progressions that reach the same effective four-field position can therefore merge even if their repetition histories differ.

#deferred Threefold-repetition-aware identity is deliberately postponed for simplicity. Revisit it if the repertoire later needs rule-perfect repetition handling.

## One-way conversion

`Known:` `PositionKey` is one-way identity data.

Do not reconstruct a full six-field FEN from it by inventing values such as:

```text
0 1
```

Once the half-move clock and full-move number have been discarded, the original `FullFen` cannot be recovered from the key.

If later logic needs a full FEN, it must retain or retrieve the actual `FullFen`.

## Stored position data

`Known:` Stored repertoire positions/nodes should retain both:

```text
fullFen
→ exact canonical six-field FEN for the concrete progression

positionKey
→ canonical identity used for lookup and merging
```

This allows the project to share chess-position identity without losing the exact state of the concrete progression.

## FullFen and PositionKey invariant

`Known:` Every stored record carrying both values must satisfy:

```text
positionKeyFromFen(fullFen) === positionKey
```

Check this invariant both:

- when writing the record
    
- when reading the record back
    

If the values disagree:

```text
→ hard error
→ treat the record as inconsistent/corrupt
→ do not continue generation from it
```

Do not silently choose one value as authoritative and continue.

## Type safety

`Known:` `FullFen` and `PositionKey` should be distinct TypeScript concepts, preferably branded string types.

Conceptually:

```ts
FullFen
PositionKey
```

Even if both contain strings at runtime, TypeScript should help prevent accidental mixing.

For example, this should not be accepted as normal usage:

```ts
positionKeyFromFen(positionKey)
```

## Immutability

`Known:` Both values are immutable.

After a move:

```text
old FullFen
→ play move
→ new canonical FullFen
→ derive new PositionKey
```

Do not modify an already validated FEN/key string in place and continue treating it as the same validated value.

## Intended FN flow

The complete intended flow is:

```text
raw FEN string
→ parseFullFen()
→ validate all six fields
→ canonicalise without changing chess meaning
→ canonical FullFen
→ positionKeyFromFen()
→ exact canonical board layout
→ side to move
→ castling rights
→ effective legal en passant square
→ discard half-move clock
→ discard full-move number
→ PositionKey
```

## Current-code mismatch

#bug Current `normalizeFen()` simply splits the supplied string, keeps the first four fields, and rejoins them. It performs no validation or canonicalisation.

That means malformed or incomplete input can currently produce a shortened key instead of failing.

#bug The current helper name `normalizeFen()` obscures the distinction between a complete FEN and a database position key. Rename the concept to `positionKeyFromFen()`.

#bug Current code can use shortened four-field values as though they were general FENs. The intended architecture requires `PositionKey` to remain identity-only data while engines, APIs, and rule-sensitive logic receive the corresponding `FullFen`.