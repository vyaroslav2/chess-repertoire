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

  

Generation/rebuild lifecycle is owned by DB/RM and the generator rather than by M.

  

Source-cache validity, refresh and compatibility are owned by EC and the relevant source-cache logic.

  

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

5%  → 0.05

1%  → 0.01

```

  

## Time values

  

`Known:` Time durations in config should use milliseconds by default unless an external API contract specifically requires another unit.

  

For example:

  

```text

retryDelayMs

requestTimeoutMs

```

  

## Shared move bands

  

`Known:` The current move-number bands are shared automatically wherever the project uses the same 1–4 / 5–8 / 9+ structure.

  

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

early  → 0.05

middle → 0.10

late   → 0.15

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

  

Those belong to obsolete behaviour.

  

#roadmap This decision is the single source of truth for trap/threat removal, and it overrides every box that still describes trap or threat behaviour as if it were live — across A1, A2, A3 and A4. Those boxes are left unedited on purpose, to avoid touching around thirty dense notes; wherever one describes amateur traps, master threats, their flags, their scoring thresholds, the shared trap-depth counter carried on the queue, or the continuation limit, that description is superseded here and must not be built. When the code is built, strip trap/threat entirely rather than implementing any box that still describes it. The queue item loses its trap-depth field with this removal. The idea is preserved separately for possible future revisiting.

  

## White smoothing

  

`Current code:` White smoothing currently exists in `math.ts`.

  

Its current formula is based on:

  

```text

real score

= White wins + half the draws

  

current prior

= 50 imaginary games at 52% White score

```

  

The helper calculates:

  

```text

(real score + 50 × 0.52)

÷

(total games + 50)

```

  

#deferred White smoothing is not currently confirmed as intended policy. Its formula and numbers need revisiting if White filtering needs smoothing again.

  

Do not refactor White and Black smoothing into one shared formula merely because their current maths looks similar.

  

For now:

  

```text

White smoothing

→ legacy/current-code behaviour

→ kept isolated in math.ts

→ final design unresolved

```

  

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

  

## Shared smoothing anchor

  

`Known:` The current smoothing anchor is:

  

```text

smoothing.anchorGames = 50

```

  

Black uses the confirmed 48% prior.

  

White currently uses 52% in existing code, but White smoothing remains deferred.

  

## Masters weighting

  

`Known:` Masters data counts five times as heavily as Elite data when constructing Black human candidates.

  

```text

humanMoves.mastersWeight = 5

```

  

## Minimum weighted evidence

  

`Known:` A Black human candidate needs at least 15 weighted games before it survives into engine verification.

  

```text

humanMoves.minimumWeightedGames = 15

```

  

## Engine tolerances

  

`Known:` Current API verification tolerances:

  

```text

early  → 80 cp

middle → 50 cp

late   → 35 cp

```

  

`Known:` Current Local Deep / local verification tolerances:

  

```text

early  → 95 cp

middle → 60 cp

late   → 40 cp

```

  

These are config values, not implementation literals.

  

## One tolerance implementation

  

`Known:` There should be one source of truth for tolerance logic.

  

#bug `math.ts` currently contains a second 80 / 50 / 35 tolerance helper even though the live verifier has its own tolerance logic.

  

Remove the unused duplicate rather than maintaining two copies of the same policy.

  

## Mate evaluations

  

`Known:` Mate evaluations must stay as mate evaluations.

  

Do not convert mate into an artificial centipawn value.

  

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

  

```text

ordinary evaluation expected

cp missing

→ invalid evaluation

→ hard error

```

  

Likewise malformed mate/evaluation state is a hard error.

  

No silent zero substitution and no `NaN` comparisons.

  

## Obsolete getCp behaviour

  

#bug Current evaluation maths can convert mate into artificial centipawn values and can produce `NaN` when the expected `mate` field is missing.

  

That model is obsolete.

  

## Obsolete tactical sweeper

  

`Known:` Remove the old 150 cp "tactical sweeper" threshold.

  

There is no intended general tactical takeover based on a large centipawn difference.

  

Ordinary differences use the normal verification tolerances. Forced-mate handling remains separate.

  

## Engine settings

  

`Known:` Old literals such as:

  

```text

15 moves / depth 18

1 move / depth 24

```

  

must not be treated as permanent architecture.

  

Instead:

  

```text

M

→ engine settings are configurable

  

central config

→ stores current values

  

engine-specific intentions

→ define what each use case needs

```

  

## Engine config by use case

  

`Known:` Local Stockfish settings should be organised by role:

  

```text

engine.localVerification

engine.localFallback

engine.deepVerification

```

  

Each use case can own settings such as:

  

```text

depth

nodes

MultiPV

timeout

```

  

These settings also feed the relevant engine `evaluationProfile` used for cache compatibility.

  

## API config

  

`Known:` Each external source should have its own config subsection.

  

Conceptually:

  

```text

api.wikibooks

api.lichessExplorer

api.lichessCloudEval

api.chessDb

```

  

Each subsection contains only settings relevant to that source.

  

## Retry and backoff config

  

`Known:` Retry behaviour should be configurable.

  

Where relevant:

  

```text

retryAttempts

initialRetryDelayMs

retryBackoffMultiplier

maximumRetryDelayMs

requestTimeoutMs

```

  

If an external service supplies an authoritative `Retry-After` value, source-specific request logic should respect it.

  

## Official API guidance

  

`Known:` Keep short guidance from the relevant official API documentation beside API-specific settings.

  

Comments may record:

  

```text

official source name or URL

last checked date

important API guidance

```

  

These comments are documentation, not runtime policy.

  

## Generation limits

  

`Known:` Tunable generation limits belong in central config rather than being buried as numeric literals in generator code.

  

Obsolete trap/threat continuation settings should not survive merely because they exist in current code.

  

## Semantic labels are not config

  

`Known:` Stable semantic identifiers are part of the data contract, not user-tunable configuration.

  

Do not make values such as `selectionMethod`, `moveOrigin` or evaluation-source labels freely editable through config.

  

## Config validation

  

`Known:` Configuration must be validated before generation starts.

  

Check things such as:

  

```text

required values exist

types are correct

numbers are technically usable

percentages are in valid numeric ranges

counts are valid counts

```

  

Invalid config is a hard error before generation starts.

  

Do not add unnecessary policy policing such as requiring one tolerance to be numerically larger than another.

  

## Config use during one build

  

`Known:` At the start of every generation/recalculation:

  

```text

read current central config

→ validate

→ compute configHash

→ freeze the effective values in memory

→ build from the root

```

  

Those effective values stay fixed for that active build.

  

Editing the central config while generation is already running does not alter that build halfway through.

  

If generation fails or is interrupted, the partial generated tree is disposable.

  

The next attempt:

  

```text

→ reads the current config again

→ validates it again

→ computes the current configHash

→ starts a new from-root build

```

  

There is no requirement to persist the failed build's full config merely so it can be resumed, because partial-tree resumability is not part of the intended architecture.

  

## Config identity

  

`Known:` The effective runtime configuration has a stable automatic fingerprint/hash.

  

Conceptually:

  

```text

effective config values

→ canonical serialisation

→ configHash

```

  

The hash depends only on effective runtime values that can affect behaviour or source requests.

  

It must not change because of:

  

```text

comments

whitespace

formatting

property order

documentation URLs

"last checked" dates

```

  

## Persisted config provenance

  

`Known:` The successfully completed repertoire stores the `configHash` that produced its current generated tree.

  

```text

successful rebuild

→ store configHash on repertoire / completed-generation metadata

```

  

The central config file remains the source of truth for the actual settings.

  

Do **not** persist a full `configSnapshot` or GenerationRun config state merely to support interrupted-generation resume.

  

There is no interrupted-generation resume.

  

If exact historical config reconstruction becomes useful later, that can be designed separately; it is not required for the current rebuild architecture.

  

## Cache compatibility with config

  

`Known:` Changing decision-policy values does not automatically mean raw source data must be refetched.

  

For example:

  

```text

tolerance changed

Masters weight changed

mainline popularity threshold changed

depth budget changed

→ derived repertoire tree must be rebuilt

→ compatible raw source data may still be reused

```

  

HumanDataSnapshot compatibility depends only on settings that affect the human-explorer request itself.

  

For example:

  

```text

rating range changes

time controls change

population/database filter changes

→ existing HumanDataSnapshot may be incompatible

→ create/fetch a new snapshot

```

  

Engine-cache compatibility is handled by its exact identity, including the relevant `evaluationProfile`.

  

For example:

  

```text

Lichess MultiPV changes

→ different remote evaluationProfile

→ old fetch/evaluation marker does not represent the new request profile

```

  

and:

  

```text

Local Deep analysis policy changes

→ different Local Deep evaluationProfile

→ old deep result is not the same evidence

```

  

## Rebuild principle

  

`Known:` The robust generation model is rebuild-from-root, not update-in-place and not partial-tree resume.

  

```text

generated repertoire tree

→ derived state

→ disposable

  

human source data

→ reusable when compatible

  

engine evaluations

→ reusable when exact cache identity/profile matches

  

flashcards/SRS

→ retained provisionally and reconciled after successful completion

```

  

Every generation/recalculation therefore:

  

```text

locks repertoire

→ deletes current/partial generated tree

→ rebuilds from root

→ reuses compatible caches

→ reconciles flashcards after success

→ stores completed configHash

→ unlocks

```

  

A failed build leaves the repertoire locked. The next attempt starts again from the root.

  

## Secrets

  

`Known:` Secrets and credentials do not belong in the central policy config or `configHash`.

  

Keep outside it:

  

```text

API tokens

passwords

credentials

other secrets

```

  

Use environment/secret storage.

  

## Machine-specific environment

  

`Known:` Machine-specific locations stay outside generation-policy config unless they genuinely alter algorithmic behaviour.

  

Examples:

  

```text

Stockfish executable path

database path

temporary-directory path

```

  

These are environment details rather than repertoire policy.

  

## Reproducibility metadata

  

`Known:` Useful provenance may include:

  

```text

completed configHash

Stockfish version

application Git commit SHA

engine/source evaluationProfile where applicable

```

  

Do not invent remote API version information that a service does not expose.

  

A persisted full config snapshot is not required by the current architecture.

  

## Current M clean-up

  

The intended M design removes or changes:

  

```text

remove dead duplicate tolerance helper from math.ts

remove mate → artificial cp conversion

remove missing-cp → 0 fallback

remove NaN-prone evaluation maths

remove obsolete 150 cp tactical sweeper

do not preserve old Stockfish depth/MultiPV literals as fixed architecture

do not carry discarded Master Threat / Amateur Trap settings into config

do not treat current White smoothing as confirmed intended policy

  

remove persisted configSnapshot / GenerationRun resume requirements

remove partial-generation config resumability

use configHash only as completed-build provenance

separate general configHash from source-cache compatibility

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

  

config frozen in memory for one active build

stable configHash

completed-build configHash provenance

no persisted full configSnapshot for resume

rebuild-from-root generation model

compatible source/cache reuse

```