---
tags:
  - glossary
  - reviewed
aliases:
  - pointers
  - pointer node
---
**Pointer** — a [[node]] that reaches a position an earlier node already owns. Its `transposesTo` names that [[owner]].

A pointer's route stops here: stopReason = Transposition. It gets no Black reply and no card, so it has no children and is an [[ending]].

Its [[cumulative-probability|cumProb]] is held at 0. Whatever reaches it, when it is created or later from a cascade, is passed on to the owner.