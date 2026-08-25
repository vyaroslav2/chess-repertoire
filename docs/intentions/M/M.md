---
tags:
  - processed
---
# M — Shared maths, policy values and configuration

## Intention

`Known:` M owns the shared maths that is still part of the intended design, the current policy values used across the generator, and the architecture for central configuration.

M should not become a catch-all for unrelated behaviour.

Conceptually:

```text
M
→ shared maths
→ shared move bands
→ weights and evidence thresholds
→ engine tolerances
→ mainline popularity thresholds
→ central config architecture
```

Run/resume behaviour is owned elsewhere.

Source-cache validity, refresh, repair and rebuild behaviour is owned by EC and the relevant source-cache logic.

## Central configuration

`Known:` All tunable project policy and operational settings should live in one central human-editable configuration file rather than being scattered through implementation code.

This includes values such as:

```text
move-number bands
mainline popularity thresholds
Masters weighting
minimum weighted games
engine tolerances
engine depths
engine move counts / MultiPV
API retry counts
API retry delays and backoff
API timeouts
rate-limit settings
generation limits
smoothing parameters where still used
```

Implementation code should read named config values instead of embedding policy literals.

## Config format

`Known:` The central config should be a TypeScript data object.

It should:

- use clear sections
    
- contain comments explaining settings
    
- contain data only
    
- contain no hidden decision logic or calculations
    

Conceptually:

```text
config

→ moveBands
→ humanMoves
→ whiteMoveFiltering
→ engineVerification
→ engine
→ api
→ generation
→ smoothing
```

The exact organisation can stay simple. Do not split identical concepts merely for theoretical flexibility.

## One source of truth

`Known:` A tunable value should have one source of truth.

Implementation code must not duplicate config defaults as fallback literals.

For example, do not have:

```text
config value = 80 cp
```

and separately:

```text
implementation fallback = 80 cp
```

The complete effective default belongs in config.

## Config names

`Known:` Config names should describe what the value means.

Prefer names such as:

```text
mastersWeight
minimumWeightedGames
apiToleranceCp
retryDelayMs
requestTimeoutMs
```

rather than vague names such as:

```text
threshold
value
limit
```

Include units in names where ambiguity is possible.

For example:

```text
Cp
Ms
Seconds
```

## Percentages and probabilities

`Known:` Percentage/probability values should be stored as decimals.

For example:

```text
52% → 0.52
48% → 0.48
15% → 0.15
5%  → 0.05
1%  → 0.01
```

The setting name should make its meaning clear, but there is no need to mechanically add "percentage" or "probability" to every name.

## Time values

`Known:` Time durations in config should use milliseconds by default unless an external API contract specifically requires another unit.

For example:

```text
retryDelayMs
requestTimeoutMs
```

## Shared move bands

`Known:` The current move-number bands are shared automatically wherever the project uses the same 1–4 / 5–8 / 9+ structure.

Do not create separate copies without a real need.

Current configuration:

```text
early
→ moves 1–4

middle
→ moves 5–8

late
→ move 9+
```

Conceptually:

```text
moveBands.earlyThrough = 4
moveBands.middleThrough = 8
```

These bands are reused by:

```text
mainline popularity thresholds
engine API tolerances
local-engine tolerances
```

## Mainline popularity thresholds

`Known:` Mainline popularity thresholds remain part of the intended White-move policy.

Current configured values:

```text
early
→ 0.05

middle
→ 0.10

late
→ 0.15
```

They use the shared move bands.

## Discarded White trap/threat policy

`Known:` Master Threat and Amateur Trap logic has been discarded.

Therefore the intended config should not carry forward policy settings for:

```text
Master Threat minimum games
Master Threat smoothed score
Amateur Trap minimum games
Amateur Trap smoothed score
raw amateur White win threshold
trap popularity floor
```

Those belong to obsolete behaviour, not the intended future config.

## White smoothing

`Current code:` White smoothing currently exists in `math.ts`.

Its current formula is based on:

```text
real score
= White wins + half the draws

current prior
= 50 imaginary games at 52% White score
```

The current helper calculates:

```text
(real score + 50 × 0.52)
÷
(total games + 50)
```

#question White smoothing is not currently confirmed as intended policy. Its formula and numbers need revisiting if White filtering needs smoothing again.

Do not refactor White and Black smoothing into one shared formula merely because their current maths looks similar.

For now:

```text
White smoothing
→ legacy/current-code behaviour
→ kept isolated in math.ts
→ parameters may remain in shared config
→ final design unresolved
```

The uploaded notes also capture that White smoothing was later deliberately downgraded from confirmed policy to an open question.

## Black smoothing

`Known:` Black candidate smoothing is accepted as intended.

Masters and Elite evidence is combined first.

For a Black candidate:

```text
weighted Black score
= weighted Black wins
+ half weighted draws
```

Then apply a 50-game prior at 48% Black score:

```text
result
=
(weighted Black wins
 + half weighted draws
 + 50 × 0.48)

÷

(weighted games + 50)
```

This deliberately pulls thin evidence towards a cautious near-even baseline.

## Shared smoothing anchor

`Known:` The current smoothing anchor is:

```text
smoothing.anchorGames = 50
```

Black uses the confirmed 48% prior.

White currently uses 52% in existing code, but White smoothing remains a `#question`.

## Masters weighting

`Known:` Masters data counts five times as heavily as Elite data when constructing Black human candidates.

Current configured value:

```text
humanMoves.mastersWeight = 5
```

Therefore:

```text
1 Masters game
→ 5 weighted games

1 Elite game
→ 1 weighted game
```

## Minimum weighted evidence

`Known:` A Black human candidate needs at least 15 weighted games before it survives into engine verification.

Current configured value:

```text
humanMoves.minimumWeightedGames = 15
```

For example:

```text
3 Masters games
→ 15 weighted games
→ enough to survive the evidence floor
```

## Engine tolerances

`Known:` The current API verification tolerances are:

```text
early
→ 80 cp

middle
→ 50 cp

late
→ 35 cp
```

`Known:` The current local verification tolerances are:

```text
early
→ 95 cp

middle
→ 60 cp

late
→ 40 cp
```

These are current configured policy values, not literals that should be permanently baked into implementation code.

The shared move bands determine which value applies.

## One tolerance implementation

`Known:` There should be one source of truth for tolerance logic.

#bug `math.ts` currently contains a second 80 / 50 / 35 tolerance helper even though the live verifier has its own tolerance logic.

Remove the unused duplicate rather than maintaining two copies of the same policy.

## Mate evaluations

`Known:` Mate evaluations must stay as mate evaluations.

Do not convert mate into an artificial centipawn value such as ±30000.

Keep the domains separate:

```text
ordinary evaluation
→ cp

forced mate
→ mate distance
```

Mate-aware comparison logic should explicitly understand mates.

## Missing evaluation data

`Known:` Missing evaluation data must never silently become `0`.

Zero centipawns means an equal evaluation. It does not mean "missing".

Therefore:

```text
ordinary evaluation expected
cp missing
→ invalid evaluation
→ hard error
```

Likewise:

```text
mate/evaluation shape malformed
→ invalid evaluation
→ hard error
```

No silent zero substitution.

No `NaN` comparisons.

## Obsolete getCp behaviour

#bug Current evaluation maths can convert mate into artificial centipawn values and can produce `NaN` when the expected `mate` field is missing.

That model is obsolete.

The intended design keeps `cp` and `mate` separate and validates the evaluation shape before comparison.

## Obsolete tactical sweeper

`Known:` Remove the old 150 cp "tactical sweeper" threshold.

There is no intended general tactical takeover based on a large centipawn difference.

Ordinary centipawn differences are handled through the normal verification tolerances.

Explicit forced-mate handling remains separate.

## Engine settings

`Known:` Old literals such as:

```text
15 moves / depth 18
1 move / depth 24
```

must not be treated by M as permanent architectural truths.

Instead:

```text
M
→ says engine settings are configurable

central config
→ stores current values

engine-specific intentions
→ define what each engine use case needs
```

## Engine config by use case

`Known:` Local Stockfish settings should be organised by their role rather than having one generic global depth.

Conceptually:

```text
engine.localVerification
engine.localFallback
engine.deepVerification
```

Each use case can own whatever settings it actually needs, such as:

```text
depth
MultiPV
timeout
```

## API config

`Known:` Each external source should have its own config subsection.

Conceptually:

```text
api.wikibooks
api.lichessExplorer
api.lichessCloudEval
api.chessDb
```

Each subsection contains only settings relevant to that source, such as:

```text
retry attempts
initial retry delay
backoff multiplier
maximum retry delay
request timeout
rate-limit settings
MultiPV where applicable
```

## Retry and backoff config

`Known:` Retry behaviour should be configurable.

Where relevant, config should expose values such as:

```text
retryAttempts
initialRetryDelayMs
retryBackoffMultiplier
maximumRetryDelayMs
requestTimeoutMs
```

If an external service supplies an authoritative `Retry-After` value, source-specific request logic should respect it as appropriate.

## Official API guidance

`Known:` Keep short guidance from the relevant official API documentation beside API-specific settings.

Comments should record enough context to understand why a rate-limit or retry value exists.

Where useful, include:

```text
official source name or URL
last checked date
important API guidance
```

These comments are documentation, not runtime policy.

## Generation limits

`Known:` Tunable generation limits belong in central config rather than being buried as numeric literals in generator code.

This includes whichever generation limits remain part of the intended algorithm.

Obsolete trap/threat continuation settings should not survive merely because they exist in current code.

## Semantic labels are not config

`Known:` Stable semantic identifiers are part of the data contract, not user-tunable configuration.

Do not make labels such as selection reasons freely editable through config.

For example, stable semantic values belong in code/types rather than policy config.

## Config validation

`Known:` Configuration must be validated before generation starts.

Validation is deliberately simple.

Check things such as:

```text
required values exist
types are correct
numbers are technically usable
percentages are in valid numeric ranges
counts are valid counts
```

Invalid config is a hard error before generation starts.

Do not add unnecessary policy policing such as:

```text
local tolerance must be larger than API tolerance
early threshold must be larger than late threshold
```

The exact policy numbers remain under manual control.

## Config snapshot

`Known:` At the start of a generation run, load one effective config snapshot.

That snapshot is immutable for the lifetime of the run.

```text
generation starts
→ load effective config
→ validate
→ freeze snapshot
```

Editing the central config later affects future runs, not an already-running or paused run.

Detailed run/resume ownership belongs outside M.

## Config identity

`Known:` The effective runtime configuration should have a stable automatic fingerprint/hash.

Conceptually:

```text
effective config values
→ canonical serialisation
→ configHash
```

The hash should depend only on effective runtime values that can affect behaviour or source requests.

It must not change because of:

```text
comments
whitespace
formatting
property order
documentation URLs
"last checked" dates
```

## Config snapshot persistence

`Known:` A generation run should retain both:

```text
configSnapshot
→ exact effective values

configHash
→ stable identity of those values
```

Detailed persistence and resume mechanics belong to the run/resume owner rather than M itself.

## Derived results and config

`Known:` Derived persisted results should be traceable to the generation run/config that produced them.

They do not need to duplicate the whole config snapshot on every row.

A run/config reference is sufficient.

## Cache compatibility with config

`Known:` Changing decision-policy values does not automatically mean raw source data must be refetched.

For example:

```text
tolerance changed
Masters weight changed
mainline popularity threshold changed
→ raw source result may remain usable
→ derived decisions may need recomputation
```

But if a setting materially changes the source request itself:

```text
Lichess MultiPV changes
→ affected source snapshot is not the same request context
→ refetch when required
```

The detailed source-cache rules remain owned by EC and the relevant source-fetching logic.

## Secrets

`Known:` Secrets and credentials do not belong in the central policy config.

Keep outside the persisted config snapshot:

```text
API tokens
passwords
credentials
other secrets
```

Use environment/secret storage for those values.

## Machine-specific environment

`Known:` Machine-specific locations also stay outside the generation-policy config unless they genuinely alter algorithmic behaviour.

Examples:

```text
Stockfish executable path
database path
temporary-directory path
```

These are environment details rather than repertoire policy.

## Reproducibility metadata

`Known:` A generation run should record reproducibility information such as:

```text
configSnapshot
configHash
Stockfish version
application Git commit SHA
```

Where useful and actually available, also record external-source identity/request context.

Do not invent remote API version information that the service does not expose.

The detailed `GenerationRun` lifecycle belongs to its dedicated owner rather than M.

## Current M clean-up

The intended M design therefore removes or changes several pieces of current behaviour:

```text
remove dead duplicate tolerance helper from math.ts

remove mate → artificial cp conversion

remove missing-cp → 0 fallback

remove NaN-prone evaluation maths

remove obsolete 150 cp tactical sweeper

do not preserve old Stockfish depth/MultiPV literals as fixed architecture

do not carry discarded Master Threat / Amateur Trap settings into config

do not treat current White smoothing as confirmed intended policy
```

## M result

M should leave the project with:

```text
one central human-editable config
one source of truth for tunable values
shared move bands
confirmed Black smoothing
confirmed Masters weighting
confirmed weighted-game floor
confirmed engine tolerances
confirmed mainline popularity thresholds
explicit cp/mate separation
White smoothing marked for later review
obsolete maths and thresholds removed
```

