---
tags:
  - processed
---
# LS — Run deep local Stockfish and return trusted evaluations

## What the code does

LS runs the local Stockfish engine for a position and returns engine evaluations.

The current helper can search:

- the position without restricting Stockfish to one move;
    
- or a supplied move by restricting the root search to that move.
    

While Stockfish searches, it may report the same root move several times as the search gets deeper.

LS groups those successive updates by their first/root move and keeps the final usable result for each move.

Before returning evaluations, LS normalises them to White's point of view.

So downstream code can consistently read:

```text
positive = better for White
negative = better for Black
```

LS is used by the Black-move verification process when external engine sources cannot settle whether an HCM is acceptable.

## Why this matters

Local Stockfish is the final trusted verification layer.

When [[B4]] reaches local verification, the programme must answer:

> How much worse is this particular HCM than Stockfish's own best move?

That requires two evaluations produced under directly comparable conditions:

1. Stockfish's unrestricted best move;
    
2. the target HCM.
    

LS is responsible for producing those trusted engine results.

[[PV]] is responsible for comparing them against the allowed local threshold.

## Deep local search configuration

`Known:` LS uses one shared configurable `"deep local"` search setting.

The architecture must not permanently define "deep" as one specific Stockfish depth.

The current implementation value may be:

```text
deepLocalDepth = 24
```

but that is an implementation setting and may change later.

`Known:` `"deep local"` uses a fixed search depth rather than a time or node budget.

So conceptually:

```text
deepLocalDepth = configurable

unrestricted search
→ fixed depth X

target-HCM search
→ fixed depth X
```

Both searches must use exactly the same configured depth.

## Comparable searches

`Known:` Local verification of an HCM must obtain both:

- Stockfish's unrestricted best move and evaluation;
    
- the evaluation of the current target HCM.
    

Searching only the HCM is not sufficient because it provides no baseline against which to measure the move.

Conceptually:

```text
deep local verification
→ unrestricted deep search
   → best move + best eval

→ deep search constrained to target HCM
   → HCM eval

→ pass both results to [[PV]]
```

`Known:` The unrestricted search and the HCM-only search must use the same search conditions so their evaluations are directly comparable.

That includes the same:

- position;
    
- Stockfish version and configuration;
    
- fixed search depth;
    
- relevant engine options.
    

For example:

```text
best move at depth 24
vs
HCM at depth 24
→ comparable
```

Not:

```text
best move at depth 24
vs
HCM at depth 18
→ not acceptable
```

Different search depths could make search instability look like genuine HCM loss.

## Unrestricted best-move search

`Known:` For deep local HCM verification, the unrestricted search only needs Stockfish's best move.

A broad MultiPV list is not required.

Conceptually:

```text
unrestricted deep search
MultiPV = 1
→ best move
→ best evaluation
```

The target HCM is evaluated separately if necessary.

This avoids paying for a large MultiPV search when the verification logic only needs one baseline and one candidate.

## Do not trust returned move order

`Known:` LS must not rely on returned move order to decide which move is best.

After evaluations are normalised to White's point of view, LS must determine the best move from the evaluations themselves.

For Black:

```text
lower cp = better
```

For example:

```text
move A = -42
move B = -18
move C = +12

best Black move = move A
```

For White:

```text
higher cp = better
```

This gives LS an explicit evaluation rule independent of how Stockfish reports or streams its results.

## Evaluation convention

`Known:` LS normalises every Stockfish evaluation to White's point of view before returning or storing it.

Therefore:

```text
positive cp
→ better for White

negative cp
→ better for Black
```

This is the common evaluation convention used by:

- [[LS]];
    
- [[PV]];
    
- [[B2]];
    
- [[B3]];
    
- [[B4]].
    

Downstream code should not have to remember whether a particular Stockfish result was originally expressed relative to the side to move.

## Target HCM equals Stockfish's best move

`Known:` If the unrestricted deep search returns the target HCM itself as Stockfish's best move, the second constrained search is unnecessary.

The target has already been evaluated at the required deep setting.

So:

```text
unrestricted deep search
→ best move = target HCM
→ HCM loss = 0
→ no constrained search needed
```

The selected move has already passed deep local verification and may be marked:

```text
deepVerified = true
```

as defined in [[B4]].

## Target HCM differs from Stockfish's best move

If Stockfish's unrestricted best move is different from the target HCM:

```text
unrestricted deep search
→ best move + best eval

target HCM differs
→ run constrained deep search on target HCM
→ HCM eval
```

The two trusted results are then passed to [[PV]].

LS itself does not decide whether the HCM is acceptable.

## LS does not own the threshold decision

`Known:` LS only produces trusted local-engine results.

It does not implement the HCM ACCEPT/REJECT tolerance rule.

The responsibility is divided as follows:

```text
LS
→ best move + best eval
→ target HCM + HCM eval

PV
→ calculate candidate loss
→ apply local threshold
→ ACCEPT / REJECT
```

This keeps the cp-loss calculation and threshold rules in one verifier rather than duplicating them inside the engine helper.

## Repeated Stockfish updates

`Known:` Repeated Stockfish output for the same root move is normal.

During one search Stockfish may report:

```text
depth 10 → ...Nf6
depth 14 → ...Nf6
depth 18 → ...Nf6
depth 24 → ...Nf6
```

These are successive updates to one root move.

They are not malformed duplicate snapshot rows.

LS should group them by root move and keep the final/deepest usable result.

This differs from [[PV]] API snapshot validation:

```text
API snapshot
same move appears twice
→ HARD ERROR

live Stockfish search stream
same root move updated repeatedly
→ keep final/deepest usable update
```

## Expected root-move results

`Known:` If LS starts a search for a defined set of root moves, every expected root move must have a final usable result when that search completes.

For example:

```text
expected:
move A
move B

search completes

move A → valid final result
move B → missing
→ HARD ERROR
```

LS must not silently return a shorter list.

An incomplete result set could make downstream verification incorrectly believe that Stockfish rejected or never considered a move.

## Mate evaluations

`Known:` Explicit Stockfish mate results must remain explicit mate information.

Do not convert:

```text
#3
#5
```

into invented centipawn values.

So:

```text
ordinary Stockfish score
→ cp result

forced mate
→ mate result
```

Mate handling remains separate from ordinary cp-threshold comparison, consistent with [[PV]] and [[B3]].

## Constrained HCM search failure

`Known:` If the unrestricted best-move search succeeds but the constrained target-HCM search does not produce a complete usable evaluation, LS must stop with a hard error.

For example:

```text
best search
→ succeeds

target-HCM search
→ fails

→ HARD ERROR
```

Do not interpret that as:

```text
REJECT HCM
→ try next human candidate
```

Failure to evaluate a move is not evidence that the move is bad.

## Illegal or unsearchable target HCM

`Known:` If Stockfish refuses the target HCM because that move is illegal or cannot be searched from the supplied position, generation must stop with a hard error.

The HCM comes from the project's own legal human-move data.

Therefore this situation indicates an internal mismatch involving something such as:

- position;
    
- notation;
    
- move conversion;
    
- stored data.
    

It is not an ordinary chess rejection.

So:

```text
target HCM cannot be searched
→ HARD ERROR
```

## Stockfish process failure

`Known:` If Stockfish:

- crashes;
    
- exits unexpectedly;
    
- times out;
    
- fails to start;
    
- or otherwise fails to complete the requested search,
    

LS may perform its own controlled restart/retry handling.

If that process is exhausted without producing a complete usable result:

```text
→ HARD ERROR
→ stop generation
```

Local-engine failure must not:

- become an HCM rejection;
    
- produce an incomplete result;
    
- cause the programme to use an unverified HCM;
    
- silently continue to another candidate.
    

Local Stockfish is the final trusted engine layer.

## Intended local HCM-verification flow

The complete deep-local path is:

```text
target HCM
↓
run unrestricted deep search
with configured fixed depth
↓
obtain best move + best eval
↓
normalise eval to White POV
↓
best move = target HCM?
├─ yes
│   → loss = 0
│   → return trusted results
│   → deepVerified = true if selected
│
└─ no
    ↓
  run constrained deep search
  on target HCM
  using exactly the same settings
    ↓
  obtain target-HCM eval
    ↓
  normalise to White POV
    ↓
  return:
  - best move + eval
  - target HCM + eval
    ↓
  [[PV]]
  → apply local threshold
```

## Hard-error conditions

`Known:` LS must hard-stop generation when trusted local results cannot be produced.

This includes at least:

- Stockfish process failure after controlled retry/restart handling;
    
- missing final result for an expected root move;
    
- malformed or unusable final evaluation;
    
- failure of the constrained HCM search;
    
- target HCM illegal or unsearchable in the supplied position;
    
- any other incomplete result that prevents a trustworthy comparison.
    

These are technical/data failures, not chess rejections.

## Bugs

#bug The current local verification architecture can search only the supplied HCM without first obtaining a directly comparable unrestricted best-move evaluation. HCM verification requires both results at the same deep-local settings.

#bug Current B4 can use one depth-18 MultiPV-15 local search and reuse that result across multiple HCMs. The intended local HCM path instead uses an unrestricted best-move search plus a candidate-specific constrained search, both using the shared configurable deep-local depth.

#bug Any local-engine path that silently returns fewer root-move evaluations than were expected must be changed to a hard error. An incomplete Stockfish result must never be treated as a valid shorter snapshot.

#bug Any local-engine/process error that is swallowed and converted into an ordinary HCM rejection must be surfaced. Failure to obtain a trusted local evaluation is a hard generation error.

## Roadmap

#roadmap Centralise the configurable deep-local settings so the unrestricted search, constrained HCM search and final `"Local Deep Stockfish"` fallback all use the intended shared configuration where appropriate.

The current default can remain:

```text
depth = 24
```

without making depth 24 part of the permanent architecture.

#roadmap Preserve explicit metadata showing that a selected Black response has already passed deep-local verification:

```text
deepVerified = true
```

as defined in [[B4]].

## Notes

`Known:` Deep local verification requires one baseline and one target: Stockfish's unrestricted best move and the current HCM.

`Known:` A broad MultiPV list is not needed for this verification path.

`Known:` If the target HCM is already Stockfish's unrestricted best move, no second search is necessary.

`Known:` Both searches use the same configurable fixed depth.

`Known:` All returned evaluations use White's point of view.

`Known:` LS produces trusted engine data; [[PV]] owns the threshold decision.

`Known:` Repeated live Stockfish updates for one root move are normal and should be collapsed to the final/deepest usable result.

`Known:` Missing or failed local evaluation is a hard error, never an HCM rejection.