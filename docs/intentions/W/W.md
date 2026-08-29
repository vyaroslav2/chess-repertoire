---
tags:
  - processed
---
# W — Get Wikibooks opening description

## Intention

`Known:` Wikibooks text is optional enrichment. It provides an opening description for the exact move history currently being followed.

Failure to obtain Wikibooks text must never stop repertoire generation.

The generator should mirror Wikibooks coverage:

- if Wikibooks has a usable description for the exact history, keep it
    
- if Wikibooks validly reports that there is no description, keep no description
    
- if the request fails technically, warn and continue without treating that failure as genuine absence
    

## History and position

`Known:` Positions in the repertoire are not detached chess snapshots. They belong to a progression from an opening starting position through a concrete move history.

Wikibooks lookup is therefore based on the exact history:

```text
starting position
→ move
→ resulting history
→ Wikibooks lookup
→ optional description
```

The description itself describes the resulting opening position, but the lookup identity is the move history.

Canonical chess-position identity remains separate:

```text
normalised FEN
→ shared chess-position identity

exact move history
→ Wikibooks lookup
```

## Starting history

`Known:` Opening generation starts from a proper opening starting position, not from an arbitrary puzzle-like position.

W may therefore number the history from its beginning:

```text
first history move  → White move 1
second history move → Black move 1
third history move  → White move 2
...
```

#note Resumable generation is not wanted — the model is rebuild-from-root only, with no resume (see [[M]]). This box's history handling therefore only needs to serve a clean from-root run.
## Transpositions

`Known:` Chess positions may be shared across transpositions, but repertoire histories/progressions are unique.

When a later history transposes into a position that has already been expanded:

```text
existing history already owns the surviving progression
later history reaches the same position
→ merge into the existing position
→ truncate the later progression there
```

The existing Wikibooks description survives.

Do not replace it with the later transposing history's description and do not try to merge two descriptions.

## Cache identity

`Known:` Wikibooks results must be cached by the exact surviving history/progression, not globally by normalised FEN.

For each history there are three meaningful states:

```text
not checked yet
description cached
checked successfully, no description
```

A successfully verified "no description" result is a real cached result.

A technical failure is not.

#resolved Wikibooks cache identity is no longer stored on normalised-FEN `PositionCache`; it is keyed by repertoire and exact history.

Wikibooks text should instead belong to the surviving repertoire progression/node, or another history-specific record if the data model later separates shared positions from progression records.

#resolved Rebuild-from-root must not erase successful history-specific Wikibooks cache state merely because it replaces the repertoire nodes. Checked descriptions and checked valid absences are preserved by exact history and restored only when the same exact canonical history survives in the rebuilt tree. An unchecked technical failure is not preserved as a successful result.

`Known:` The authoritative checked-result cache must be a durable record keyed by repertoire and exact canonical history, independent of disposable `RepertoireNode` rows. The node's `wikibooksChecked` and `wikiText` fields are a materialised projection used by that rebuilt tree, not the only copy of the cache.

An interrupted or failed rebuild must not reduce durable Wikibooks coverage. In particular, the partially rebuilt node set must never become the next run's sole preservation source. Successful descriptions and valid absences remain in the durable history cache until the repertoire itself is deleted; a later rebuild materialises them again for every exact history that survives.

## Fetch behaviour

`Known:` For each new surviving move history:

```text
check history-specific Wikibooks cache

already checked
→ reuse cached result

not checked
→ ask Wikibooks
```

A valid response containing text:

```text
→ trim leading and trailing whitespace
→ keep the complete remaining extract
→ cache it
```

A valid response showing that no page or usable description exists:

```text
→ cache explicit "no description"
→ show nothing
```

A technical/API/parsing failure:

```text
→ retry according to the retry policy
→ if all attempts fail, log a warning
→ continue repertoire generation
→ do not cache "no description"
```

## Coverage gaps

`Known:` A valid absence applies only to that exact history.

Therefore:

```text
history A
→ valid "no description"
→ cache absence for history A

next move
→ history B
→ perform a new Wikibooks lookup
```

Do not assume that because Wikibooks has no description after one move, all subsequent histories will also have no description.

Do not inherit an earlier description when the current history has none.

Do not generate or synthesise replacement text.

## Retry policy

`Known:` Technical Wikibooks failures should receive up to three attempts.

Requests must respect Wikimedia's API:

```text
technical failure
→ retry, up to 3 attempts total
→ requests remain serial
→ respect Retry-After when supplied
→ otherwise use progressively longer waits
```

For non-interactive generation, use Wikimedia's `maxlag` mechanism where appropriate and identify the application with a descriptive User-Agent.

`Known:` All Wikibooks attempts share one serial request scheduler. Use a contact-bearing User-Agent, leave at least one second between requests, and do not create parallel requests. For HTTP 429 or 503, honour `Retry-After`; when it is absent, wait at least five seconds or longer when the progressive backoff requires it.

After the final failed attempt:

```text
→ warn
→ continue generation
→ leave this history eligible for a later attempt
```

Wikibooks is optional enrichment, so it does not need the manual VPN/retry interaction used for required Lichess data.

## Missing or malformed responses

`Known:` Genuine absence and technical failure must remain separate.

```text
Wikibooks validly says page does not exist
→ genuine "no description"

page exists but expected response data is malformed or unusable
→ technical failure
→ retry
```

A malformed response must never be permanently cached as genuine absence.

## Description text

`Known:` Preserve the Wikibooks plain-text extract as returned.

Only trim leading and trailing whitespace.

Keep:

- headings
    
- Wikibooks wording
    
- short descriptions
    
- all other returned description content
    

Do not:

- strip headings
    
- shorten the text
    
- rewrite it
    
- normalise its wording
    
- impose a minimum description length
    

`#resolved` Preserve a leading Wikibooks heading.

#resolved Accept any non-empty trimmed extract, including descriptions of 50 characters or fewer.

## Result

W returns one of three conceptual outcomes:

```text
description found
→ usable Wikibooks text

valid absence
→ no description

technical failure after retries
→ warning + no text for this run
```

Only the first two are cacheable results.
