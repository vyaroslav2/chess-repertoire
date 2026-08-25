---
tags:
  - processed
---
# TS — Deep Verification

  

## Purpose

  

Known: TS is the project's Deep Verification (DV) process.

  

It is not a separate tactical-blunder detector and does not have its own tactical scoring rules.

  

Its purpose is to take the RESPONSE moves already selected for one repertoire and verify them with Local Deep Stockfish using the same local-engine acceptance rules used elsewhere in the project.

  

Every RESPONSE must eventually pass DV, regardless of how that RESPONSE was originally selected.

  

A RESPONSE with `deepVerified = true` means one thing:

  

> This exact RESPONSE survived Deep Verification with Local Deep Stockfish.

  

## Repertoire scope

  

Known: one DV run belongs to one repertoire.

  

TS:

  

1. receives/selects one repertoire

2. considers only RESPONSE moves belonging to that repertoire

3. ignores all other repertoires

  

The old behaviour of sweeping every unverified RESPONSE in the whole database is not intended.

  

## Which RESPONSES are checked

  

TS checks RESPONSES where:

  

- `deepVerified = false`

  

RESPONSES where:

  

- `deepVerified = true`

  

are skipped.

  

If something later changes that invalidates the verification of a RESPONSE, the normal repertoire-management rules reset `deepVerified` to `false`, making that RESPONSE eligible for DV again.

  

Every RESPONSE is subject to this rule, including a RESPONSE originally selected by Local Deep Stockfish.

  

## Verification order

  

Known: DV works from the root outwards.

  

Earlier RESPONSES on the surviving repertoire structure must be deep-verified before deeper RESPONSES are checked.

  

The intention is to avoid spending expensive engine time verifying positions whose upstream branch may later be removed because an earlier RESPONSE fails DV.

  

Where transpositions share one canonical continuation, the canonical RESPONSE is verified once rather than once for every route that reaches it.

  

## Human-data snapshot

  

Known: TS uses the repertoire's current `HumanDataSnapshot`.

  

TS does not:

  

- start a new human-data snapshot

- refresh the snapshot

- silently replace the snapshot because DV needs human move data

  

If DV needs the human candidate list during re-selection, it rebuilds that list from the current snapshot's human cache.

  

Missing human data for the current snapshot is an incomplete-data problem, not permission for TS to start a different snapshot.

  

## Local Deep Stockfish analysis

  

DV uses Local Deep Stockfish.

  

For the RESPONSE being checked, DV needs the local deep-engine comparison between:

  

- the stored RESPONSE

- Local Deep Stockfish's best move from the same concrete position

  

A valid existing `LocalDeepEvalCache` result may be reused only when it belongs to the exact:

  

```text

FullFen

+ RESPONSE UCI/LAN move

```

  

being verified.

  

`PositionKey` alone is not sufficient cache identity.

  

Two repertoire nodes may share one `PositionKey` while having different concrete `FullFen` values. In particular, the half-move clock may differ, which can affect rule-sensitive engine evaluation.

  

Therefore:

  

```text

same PositionKey

different FullFen

→ do not automatically reuse the same Local Deep Stockfish result

```

  

DV does not need to run Stockfish again merely because TS itself did not originally produce the cached analysis.

  

The Stockfish version stored with the cached result is provenance only.

  

A valid cached deep-local result remains reusable even if it was produced by an older Stockfish version.

  

Changing Stockfish versions therefore does not by itself invalidate existing DV results or force the repertoire through DV again.

  

## Acceptance tolerance

  

Known: TS has no separate tactical threshold.

  

The old fixed `150 cp` rule is discarded.

  

DV uses the shared Local Deep Stockfish tolerance bands:

  

- moves 1–4: `95 cp`

- moves 5–8: `60 cp`

- moves 9+: `40 cp`

  

The stored RESPONSE passes DV when it satisfies the appropriate shared local-engine tolerance.

  

The same normal project evaluation rules apply to mate evaluations. TS does not introduce separate mate or tactical-blunder logic.

  

This means the old idea:

  

> deep engine → detect missed tactic/mate → apply a special 150 cp rule

  

is replaced by:

  

> deep engine → compare RESPONSE with the local best move → apply the normal Local Deep Stockfish tolerance

  

The standard evaluation system is responsible for rejecting sufficiently bad tactical or mating mistakes.

  

## RESPONSE passes DV

  

If the RESPONSE survives the applicable Local Deep Stockfish tolerance:

  

- set `deepVerified = true`

- leave the RESPONSE and its continuation intact

- continue to the next eligible RESPONSE in root-outwards order

  

Successful DV does not by itself change which RESPONSE was selected.

  

## RESPONSE fails DV

  

Known: TS stops immediately on the first RESPONSE that fails Deep Verification.

  

It does not continue checking the rest of the repertoire.

  

This is important because replacing that RESPONSE may delete its downstream branch, so verifying descendants first would waste engine time.

  

On failure:

  

1. leave the existing repertoire unchanged

2. show the discrepancy

3. build the proposed replacement using the DV re-selection rules

4. wait for the user's decision

  

The current RESPONSE remains `deepVerified = false` while the decision is pending.

  

## Re-selection after failure

  

A DV failure may trigger the response re-selection process already defined for the repertoire architecture.

  

Re-selection uses the repertoire's current `HumanDataSnapshot`.

  

It does not begin a new human-data refresh.

  

The proposed correction is determined before any repertoire structure is changed.

  

TS itself must not silently replace the RESPONSE merely because it failed verification.

  

Structural changes are performed through the normal [[RM]] rules only after user approval.

  

## User approves the correction

  

If the user approves the proposed replacement:

  

- apply the approved correction through [[RM]]

- replace the failed RESPONSE according to the established destructive replacement rules

- remove the obsolete downstream structure where required

- create the newly approved continuation

- treat the approved Local Deep Stockfish correction according to the established DV provenance rules

  

The new exact RESPONSE is the one whose verification state matters.

  

## User rejects the correction

  

Known: if the user rejects the proposed correction:

  

- make no repertoire change

- keep the existing RESPONSE

- keep `deepVerified = false`

  

There is no separate "user accepted" verification state.

  

Because the RESPONSE remains unverified, a later DV run will encounter it again.

  

This is deliberate.

  

## No persistent tactical report

  

The old `Tactical_Audit_Report.md` is not part of the intended design.

  

TS does not maintain an accumulating report of failures.

  

When DV fails, it shows/logs the current failure directly and stops for the user's decision.

  

Because a rejected RESPONSE remains unverified, it can naturally be presented again during a later DV run without maintaining a separate report file.

  

## Separation of responsibilities

  

TS/DV is responsible for:

  

- finding the next eligible unverified RESPONSE in one repertoire

- obtaining or reusing Local Deep Stockfish analysis for the exact `FullFen`

- applying the shared Local Deep Stockfish acceptance tolerance

- setting `deepVerified = true` when the RESPONSE passes

- stopping on the first failure

- producing the proposed correction

- waiting for the user's decision

  

[[RM]] is responsible for:

  

- changing RESPONSE structure after approval

- deleting obsolete downstream structure

- creating or updating the approved replacement

- maintaining the repertoire's structural invariants

  

The deep-engine cache is responsible for storing reusable Local Deep Stockfish analysis by exact `FullFen + checked move`.

  

TS consumes that analysis; it does not require ownership of the engine calculation that produced it.