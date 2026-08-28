# Tree Generator Decisions Formerly Deferred

The former investigation points are resolved. Their authoritative requirements now live in the intentions documents.

## Explorer failure versus valid empty

Resolved in [F](intentions/F/F.md): a successful response with `moves: []` creates a successful empty fetch marker. A failed required request is a hard generation error and must not create that marker. `Missing White Moves` therefore reflects genuinely successful empty Explorer buckets, not an API failure disguised as empty data.

## Repetitions versus transpositions

Resolved in [DB](intentions/DB/DB.md), [RM](intentions/RM/RM.md), and [LOG](intentions/LOG/LOG.md):

- a same-route return to an ancestor PositionKey is a terminal repetition;
- its terminal move and actual route probability are retained, but `toNodeId` is null and no probability is added to the ancestor;
- a different route reaching an existing canonical position is a transposition;
- diagnostics report and explain transpositions and repetition stops separately.

## ECO codes and opening names

Resolved in [F](intentions/F/F.md): opening metadata belongs to exact canonical history, is preserved across rebuilds by that history, and always stores the `LICHESS_MASTERS` source with either `PRESENT` or `VALID_ABSENCE`. Technical Masters failure is a hard error. Diagnostics identify both retrieval method and source, and the UI displays metadata for the history currently being viewed.
