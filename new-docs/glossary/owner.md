---
tags:
  - glossary
  - reviewed
aliases:
  - owners
  - owner node
---
**Owner** — the first [[node]] to reach a position. It holds that position's row in the Position table, and its `transposesTo` is null.

A position has one owner however many routes reach it. The later nodes that reach it are [[pointer|pointers]].

The owner's route carries on as usual: it gets a Black reply and children. What reaches its pointers is passed on to it, and from it down its subtree.

A position reached by one route only still has an owner. Nodes that stop before the transposition check (too rare, game over, repetition) are neither owners nor pointers

`transposesTo = null` alone does not mark an owner; the Position table does.