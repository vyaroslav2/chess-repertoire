# Traps and threats — the idea (shelved)

This feature was removed from the project. It is written down here so the idea
isn't lost, in case it's worth revisiting once the core repertoire logic is done.
Nothing here is currently built or intended.

## What it was for

Normally the generator only covers White moves that are *popular* — moves enough
humans actually play. That is the right rule most of the time, but it misses two
kinds of move worth preparing for anyway:

- **Amateur traps** — a tempting move that weaker players play a lot even though
  it isn't objectively best. You want a prepared answer, because you'll meet it
  often at club level.

- **Master threats** — a strong, testing move that scores well for White in
  master games. Rarer, but dangerous, so worth knowing even if it isn't the most
  common move you'll face.

The point of both: cover some moves that the ordinary popularity filter would
throw away, because in practice they matter.

## How a move earned a flag

A White move was marked as one of these when it cleared a set bar:

- **Amateur trap** — played in enough amateur games, scoring well enough for
  White among amateurs, and not already flagged as a master threat.
- **Master threat** — played in enough master games, scoring well enough for
  White among masters.

("Enough" and "well enough" were specific numbers — a minimum game count and a
minimum White score. Those were tuning values, not the heart of the idea.)

A flagged move was then included in the repertoire even if it fell below the
normal popularity bar. Traps were also given a small popularity floor so they
weren't dismissed as too rare.

## The continuation idea

Once a line turned into a trap or threat, the generator kept following it a bit
further than usual — even into moves that wouldn't normally qualify — so the
refutation could be played out to a natural stopping point rather than cut off
halfway. A counter tracked how far past the start of the trap the line had run,
and the line was allowed to continue up to a set limit before stopping.

That counter is the "trap depth" mentioned throughout the old notes.

## Why it was shelved

It added a whole parallel set of rules — extra flags on every move, extra
thresholds to tune, an extra counter riding along with every position, and
special cases scattered across the generator. The decision was to get the
ordinary repertoire (sound, popular, engine-checked moves) working cleanly
first, and treat traps and threats as a possible later addition rather than
core machinery.

## If revisited

The clean version would keep the *idea* — cover a few important-but-unpopular
moves — without the sprawl:

- one simple rule for "include this move even though it's rare, because it's
  a common amateur try or a dangerous master try",
- and, if wanted, a small allowance to follow such a line a little deeper.

Everything else (the separate counter, the scattered special cases) was
complexity that could be left out.
