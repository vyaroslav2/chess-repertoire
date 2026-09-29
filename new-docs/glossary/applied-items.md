---
tags:
  - in-progress
  - glossary
aliases:
  - appliedItems
---
**`appliedItems`** — the list of items applied so far in the current cascade. Each entry holds fromNode, toNode and gainOnThisItem ([[TR.excalidraw|TR.31]]).

It is cleared at the start of every cascade ([[TR.excalidraw|TR.23]]), so it covers one cascade only. It lives in memory and is not stored in the database.

It is used for two checks when a node is reached again:
* same fromNode and toNode, different gain → a refire ([[TR.excalidraw|TR.39]]). Not an error.
* same fromNode, toNode and gain → a duplicate ([[TR.excalidraw|TR.26]]). 