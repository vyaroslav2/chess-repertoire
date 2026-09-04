---
tags:
  - glossary
  - processed
---
### What it controls

This retry limit applies only to this race condition:

1. Try to create the lockfile.
2. If creation fails because the lockfile already exists, try to read it.
3. If the read fails because the lockfile has disappeared, another process may have deleted it between those two operations.
4. Restart the lockfile check from the top.
5. Repeat this at most `lockfile-retry-limit` times. If the same race still occurs after the limit is reached, fail.

There is no backoff delay between these retries.

### Why 5

One retry covers the normal case where the race resolves immediately. A few additional retries cover unusually unlucky timing. Five gives a comfortable margin while still failing immediately from the user's point of view if something is genuinely wrong.