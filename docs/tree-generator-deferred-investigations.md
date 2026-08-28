# Tree Generator Deferred Investigations

These items were deliberately deferred while the agreed diagnostic-output changes were implemented.

## Explorer empty responses versus failures

Investigate and correct the human Explorer cache semantics so that a genuinely successful response with no moves cannot be confused with an API failure.

The current path can save an empty bucket when `fetchWithRetry()` returns `null`. A later run then reads the fetch marker with zero move rows as a successful empty bucket. The persisted state needs to retain enough provenance to distinguish at least:

- a successful API response containing `moves: []`;
- an exhausted, denied, malformed, or otherwise failed request;
- a request that has never been attempted.

Review the behavior when Masters and Elite succeed but Amateur fails, including the effect on `Missing White Moves` and pruning.

## Repetitions and transpositions

Investigate the desired policy and counters for repetitions separately from transpositions.

The current `Total Skipped (In DB)` counter combines legal repetition stops with canonical transposition reuse. Decide whether a generated repetition should remain a normal stopped route or become a hard error. If repetition remains a supported stop condition, report it separately from transpositions. A `Transpositions` counter must count only canonical positions whose Black response is reused rather than reevaluated.

Also review how `visitedPgns`, route-position detection, `stopReason`, and canonical response reconciliation divide responsibility so that duplicate histories, repetitions, and transpositions cannot be mislabeled.

## ECO codes and opening names

Investigate the complete provenance and lifecycle of ECO codes and opening names before changing their diagnostic presentation.

Document and verify:

- which metadata comes directly from the Lichess Masters Opening Explorer response;
- which metadata is restored from an existing canonical repertoire node;
- whether Wikibooks supplies, modifies, or only accompanies opening metadata;
- how cached and rebuilt nodes retain metadata provenance;
- how the diagnostic should identify the actual source when displaying an ECO code or opening name.

The eventual log must not present stored metadata without making its source clear.
