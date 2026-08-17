```
# Intention notes

One note per box, in intentions/, named by its ID alone (R.02, A4.12).
Start from templates/intention-box.md. Never rename one — every
cross-reference points at the ID.

## Status

Frontmatter carries one status tag:

in-progress — written, not yet worked through
processed  — worked through, every footnote settled

Anything still in-progress is unfinished work, whatever it looks like.

## The sections

Heading — the ID and the box name exactly as it appears on the diagram.

What the code does — the behaviour, in plain language, with no judgement
in it. Someone should be able to read this alone and predict what the
program will do. No line numbers: point at code by what the line says,
since numbers move.

Why this matters — the consequences. What this behaviour causes further
on, what it prevents, what it makes impossible. This is where the
reasoning lives, so it is the part worth writing carefully.

Why it may have been designed this way — the intent behind it, where we
can tell. Mark each claim: Known where the code or a comment shows it,
Likely where we are reconstructing. Leave the section out rather than
invent a reason.

Also affects — other boxes whose behaviour depends on this one, as
wikilinks. This is the blast radius: before changing this box, read
these; after changing it, re-verify them.

Notes — footnotes, numbered, one tagged item each. Every open matter,
decision and fault ends up here. See conventions/tag-vocabulary.

## Writing a footnote

Say what is wrong or wanted, then what it should do instead. A bug
without an intended behaviour is only a complaint, and the intended
behaviour is what a change request is built from.

Describe each fault in full in one place. Other boxes link to that box
rather than repeat it, so there is one thing to correct when it is fixed.

## Finished

A note is processed when no footnote is a #question, every #bug says 
what the behaviour should be instead, and the status tag has been changed.
```