---
tags:
  - glossary
  - in-progress
aliases:
  - profile
  - cache profiles
---
**Cache profile** — a fingerprint of the settings that shaped a cached Explorer or engine answer (how we asked: ratings, speeds, MultiPV, depth, and so on). Cache lookup is position + cache profile, not position alone. If those ask-settings change, the old cache no longer matches and must be refetched. Other config (popularity thresholds, CP tolerances, retries, timestamps) does not belong in the cache profile.