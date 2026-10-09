---
tags:
  - glossary
  - reviewed
aliases:
  - work list
---
**Worklist** — the list of items waiting to be applied in one cascade. First in, first out. It lives in memory.

Each item holds fromNode, toNode, gainOnThisItem and cascadeId.

Not the same as the S3 queue, which holds positions waiting to be expanded and is last in, first out.