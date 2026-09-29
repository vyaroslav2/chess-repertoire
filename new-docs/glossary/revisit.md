---
tags:
  - glossary
  - reviewed
aliases:
  - revisits
---
**Revisit** — a [[cascade]] reaches a node it has already reached earlier in the same cascade. The node's touch count is above 0.

Not an error. 

Counted in `revisits` and logged when the cascade completes. A node revisited far too often means a loop: see [[node-touch-count-cap|nodeTouchCountCap]].

Not the same as a [[refire]] or a [[duplicate]].
