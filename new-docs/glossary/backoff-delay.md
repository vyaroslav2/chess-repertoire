---
tags:
  - in-progress
aliases:
  - backoff delay, backoff delays, backoff-delays
---

**Backoff delay** — a short pause between retries, usually one that grows a bit longer each time (retry after 100ms, then 200ms, then 400ms...). It's called "backoff" because you're backing off from hammering the same thing over and over immediately. This is common when retrying API that might be temporarily busy or overloaded.
