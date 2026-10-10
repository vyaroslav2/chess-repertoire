---
tags:
  - glossary
  - reviewed
aliases:
  - profile
  - cache profiles
---
**Cache profile** — a fingerprint of the settings that shaped a cached Explorer answer or Stockfish evaluation (how we asked: Explorer ratings and speeds; Stockfish version, depth and MultiPV). Cache lookup is position + cache profile, not position alone. If those ask-settings change, the old cache no longer matches: the position must be fetched or evaluated again. 