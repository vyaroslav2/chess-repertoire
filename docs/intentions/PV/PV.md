---
tags:
  - processed
---
# PV — Verify one human candidate against one engine snapshot

## What the code does

PV receives:

- one human candidate move;
    
- one engine move list for the current position;
    
- the allowed centipawn-loss threshold.
    

Its job is not to choose between all human candidates.

It answers one narrower question:

> **Is this HCM close enough to the engine's best move to be accepted from this source?**

The current verifier can return three outcomes:

```text
VALID
REJECTED
NEED_DEEPER_SEARCH
```

Conceptually, these mean:

```text
VALID
→ ACCEPT

REJECTED
→ REJECT

NEED_DEEPER_SEARCH
→ INCONCLUSIVE
```

An inconclusive result does not mean the HCM is bad. It means this particular engine snapshot does not contain enough information to decide.

The caller in [[B4]] then continues to the next verification layer.

## Why this matters

PV is the decision sieve inside the Black-move waterfall.

[[B1]] decides the human priority order.

[[B4]] walks through that order.

PV decides whether one particular engine source can:

- accept the current HCM;
    
- reject it;
    
- or say that it cannot decide.
    

This distinction is important because an inconclusive Lichess result must not accidentally reject a good human move. It should allow ChessDB, and eventually local Stockfish, to inspect the same HCM.

## Evaluation direction

`Known:` Engine centipawn evaluations are stored from White's point of view.

Therefore, for Black:

```text
lower cp = better for Black
higher cp = worse for Black
```

For example:

```text
-80 cp = better for Black
-20 cp = worse for Black
+30 cp = still worse for Black
```

The source's best Black move must therefore have the **lowest** ordinary cp evaluation in that snapshot.

An HCM may:

- have exactly the same evaluation as the best move;
    
- have a higher cp value and therefore be worse for Black.
    

It must not have a lower cp value than the move labelled as best.

For example:

```text
bestCp      = -35
candidateCp = -20
```

The HCM is 15 cp worse for Black.

Its loss is:

```text
candidateLoss = candidateCp - bestCp

candidateLoss = -20 - (-35)
              = 15 cp
```

So ordinary Black move loss is:

```text
candidateLoss = candidateCp - bestCp
```

If this calculation produces a negative number:

```text
candidateLoss < 0
```

then the candidate evaluates better for Black than the supposed best move.

That is not a normal verification result.

It means something about the snapshot, ordering, cached data, or evaluation convention is inconsistent.

Generation must stop with a hard error.

#bug PV currently uses an absolute cp difference. That can silently turn an impossible negative candidate loss into an ordinary positive difference and allow the HCM to pass. PV must not use `abs()` to hide this invariant violation.

## Validate the snapshot before using it

`Known:` PV must validate a successful engine snapshot before making any chess decision from it.

The order is:

```text
receive snapshot
→ validate evaluations
→ check for duplicate moves
→ separate mate information from ordinary cp information
→ sort ordinary moves explicitly
→ verify invariants
→ apply the HCM verification rule
```

A malformed successful snapshot is not treated as an ordinary API failure.

It is a hard generation error.

## Valid evaluations

`Known:` Every move used in an ordinary cp verification snapshot must have a valid, usable centipawn evaluation.

PV must stop with a hard error if an evaluation is:

- missing;
    
- malformed;
    
- `NaN`;
    
- non-numeric where a cp value is required;
    
- otherwise unusable for the comparison.
    

PV must not:

- silently discard the bad move;
    
- substitute zero;
    
- continue sorting;
    
- allow `NaN` to propagate through the calculation.
    

#bug PV currently allows invalid score data to reach its comparison logic. This can produce `NaN` differences or meaningless verification results. Snapshot integrity must be checked first.

## Duplicate moves

`Known:` One source snapshot may contain each move at most once.

For example, this is invalid:

```text
...Nf6   -35
...e6    -20
...Nf6   -18
```

PV must not choose one of the duplicate evaluations or silently deduplicate them.

Stop generation with a hard error.

A duplicate means the supposedly coherent snapshot is internally inconsistent, so its ranking and threshold boundary cannot safely be trusted.

#bug PV currently has no explicit duplicate-move integrity check before verification.

## Sort the snapshot explicitly

`Known:` PV must not rely on the order supplied by:

- Lichess;
    
- ChessDB;
    
- the database cache;
    
- any earlier helper.
    

For ordinary cp evaluations, PV sorts the snapshot itself from best to worst for Black:

```text
lowest cp
→ ...
→ highest cp
```

For example:

```text
-70   best
-45
-10
+25
+80   worst returned
```

PV then uses:

- the first move as the best returned move;
    
- the last move as the worst returned boundary move.
    

This makes the candidate-absent rule independent of whatever order happened to arrive from the external source or cache.

#bug PV currently depends on returned/list order when identifying the best and boundary moves. The verifier must explicitly establish its own ordering before comparison.

## Candidate is present in the snapshot

If the HCM appears in the validated snapshot, calculate:

```text
candidateLoss = candidateCp - bestCp
```

First verify:

```text
candidateLoss >= 0
```

If it is negative:

```text
candidateLoss < 0
→ HARD ERROR
```

because the move labelled as best is not actually best for Black.

Otherwise compare the loss with the threshold.

`Known:` The threshold is inclusive.

```text
candidateLoss <= limit
→ ACCEPT

candidateLoss > limit
→ REJECT
```

For example:

```text
bestCp      = -40
candidateCp = +10
limit       = 50

candidateLoss = 50
→ ACCEPT
```

A move exactly on the threshold survives.

Only a move strictly beyond it is rejected.

The threshold supplied by the caller may differ by verification layer. [[B2]] defines the normal API thresholds and the looser local Stockfish thresholds.

PV itself applies whichever valid threshold it is given.

## Candidate is absent from the snapshot

An absent candidate is not automatically rejected.

The source may simply have returned too few moves.

PV therefore uses the **worst move actually returned** as a boundary.

After explicitly sorting the snapshot:

```text
best returned
↓
...
↓
worst returned
```

calculate how far the worst returned move is from the best move.

Conceptually:

```text
boundaryLoss = worstReturnedCp - bestCp
```

Then:

```text
candidate absent

boundaryLoss > limit
→ REJECT

boundaryLoss <= limit
→ INCONCLUSIVE
```

### Why an outside-threshold boundary allows rejection

Suppose the source returned:

```text
best     -50
...
worst    +20
```

and the threshold is:

```text
50 cp
```

The worst returned move is already:

```text
+20 - (-50) = 70 cp
```

behind the best.

If the HCM does not even appear in that returned list, it lies below the returned boundary.

The source has therefore already gone far enough down its ranking to establish that the missing HCM cannot be within the permitted range.

So:

```text
REJECT
```

### Why an inside-threshold boundary is inconclusive

Suppose instead:

```text
best     -50
...
worst    -10
```

The returned list only reaches:

```text
40 cp
```

behind the best.

With a 50 cp threshold, a missing HCM might still be:

```text
45 cp behind
```

and therefore valid.

The source has not shown enough moves to know.

So:

```text
INCONCLUSIVE
```

and [[B4]] continues to the next verification layer for the **same HCM**.

## Empty snapshot

`Known:` A successfully returned snapshot containing zero moves is valid.

It means:

> this source supplied no move information with which PV can verify the candidate.

Therefore:

```text
successful empty snapshot
→ INCONCLUSIVE
```

For example:

```text
Lichess empty
→ INCONCLUSIVE
→ ChessDB

ChessDB empty
→ INCONCLUSIVE
→ Local Stockfish
```

This must remain distinct from an unsuccessful fetch.

```text
successful empty response
→ valid empty snapshot

request fails after retry handling
→ source unavailable
```

The caller handles source availability. PV handles the contents of a successfully obtained snapshot.

## Mate evaluations

`Known:` Explicit mate information must remain separate from ordinary centipawn tolerance logic.

PV must never convert:

```text
#3
#5
```

into invented centipawn values such as:

```text
+10000
+9997
```

just to reuse the cp formula.

Instead:

```text
explicit mate information
→ mate-specific rules from [[B3]]

ordinary cp information
→ PV centipawn verification
```

For the explicit Lichess mate case already defined in [[B3]]:

- an HCM with the same shortest mate distance as the best mate is accepted;
    
- an HCM with a longer mate is rejected;
    
- an ordinary cp HCM when the best move is a forced mate is rejected;
    
- an HCM absent from the Lichess list when Lichess explicitly shows a forced mate is rejected;
    
- if all HCMs fail, use the first Lichess move among the shortest mates.
    

Mate distance is therefore not part of the ordinary PV cp-loss calculation.

## Malformed snapshot versus unavailable source

`Known:` These are different failure classes.

### Source unavailable

Examples:

```text
network failure
HTTP/API failure handled by retry logic
retry cycle exhausted
```

That source is unavailable.

The [[B4]] waterfall may continue to another source.

For example:

```text
Lichess unavailable
→ ChessDB
```

### Successful but malformed snapshot

Examples:

- duplicate moves;
    
- missing cp values where cp is required;
    
- `NaN`;
    
- malformed evaluations;
    
- internally impossible evaluation relationships;
    
- other data that makes the snapshot unsafe to verify.
    

That is not a normal fallback condition.

```text
successful response
but malformed snapshot
→ HARD ERROR
→ stop generation
```

Continuing to another engine source could hide a parser, cache, data-model, or evaluation-convention bug.

## Intended PV decision

For an ordinary centipawn snapshot, the complete logic is:

```text
snapshot received
↓
empty?
├─ yes → INCONCLUSIVE
└─ no
    ↓
validate every evaluation
check duplicate moves
sort explicitly best → worst for Black
verify snapshot invariants
    ↓
candidate present?
├─ yes
│   ↓
│ candidateLoss = candidateCp - bestCp
│   ↓
│ candidateLoss < 0?
│   ├─ yes → HARD ERROR
│   └─ no
│       ↓
│     candidateLoss <= limit?
│       ├─ yes → ACCEPT
│       └─ no  → REJECT
│
└─ no
    ↓
  boundaryLoss = worstReturnedCp - bestCp
    ↓
  boundaryLoss > limit?
    ├─ yes → REJECT
    └─ no  → INCONCLUSIVE
```

## Relationship to B4

PV verifies only **one HCM against one source snapshot**.

It does not decide which engine source should run next.

[[B4]] owns that waterfall.

Conceptually:

```text
HCM
↓
PV on Lichess snapshot
├─ ACCEPT → choose HCM
├─ REJECT → next HCM
└─ INCONCLUSIVE
      ↓
   PV on ChessDB snapshot
   ├─ ACCEPT → choose HCM
   ├─ REJECT → next HCM
   └─ INCONCLUSIVE
         ↓
      Local Stockfish
```

So:

> **PV decides what one snapshot proves. B4 decides what to do with that answer.**

## Bugs

#bug PV uses an absolute cp difference. For Black, ordinary loss must be calculated as `candidateCp - bestCp`. A negative result means the supposed best move is not actually best and must cause a hard error rather than being converted to a positive loss.

#bug PV relies on the supplied move ordering when identifying the best and boundary moves. Explicitly sort ordinary cp snapshots from lowest to highest cp before verification.

#bug PV has no explicit duplicate-move integrity check. A duplicate move within one source snapshot must cause a hard error.

#bug PV allows missing, malformed or `NaN` evaluation data to enter comparison logic. Validate the complete snapshot before sorting or deciding.

#bug Fresh ChessDB data can reach PV with unusable score values and produce `NaN` comparison results. This must not be interpreted as an ordinary ACCEPT, REJECT or INCONCLUSIVE result. Invalid evaluation data is a hard error.

## Notes

`Known:` PV does not re-rank human candidates. [[B1]] owns human ranking and [[B4]] owns candidate order.

`Known:` PV does not ask a second source to confirm an ACCEPT.

`Known:` PV does not let a second source overrule a clear REJECT.

`Known:` INCONCLUSIVE means only that this snapshot cannot prove whether the HCM lies inside or outside the permitted range.

`Known:` The returned-list boundary is valid only after PV has established its own best-to-worst ordering.

`Known:` The exact threshold is supplied by the surrounding verification layer. PV's comparison rule is always inclusive: `loss <= limit`.

`Known:` Successful empty data is valid and inconclusive. Malformed data is a hard error. Source unavailability is handled separately by the waterfall.