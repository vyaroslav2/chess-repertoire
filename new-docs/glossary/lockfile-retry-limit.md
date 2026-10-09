---
tags:
  - glossary
  - reviewed
---
### What it controls

`lockfileRetryLimit` ([[generation-config]]) caps two separate retry loops when taking the lockfile. Each loop keeps its own count, so each can use the full limit.

**The lockfile vanishes during the check**

1. Try to create the lockfile.
2. Creation fails because the lockfile already exists ([[eexist|EEXIST]]). Read it.
3. The read fails because the lockfile is gone ([[enoent|ENOENT]]). Another process deleted it between the two steps.
4. Start again from the top.
5. After `lockfileRetryLimit` attempts that all end this way, fail.

**The lockfile is stale**

1. Try to create the lockfile.
2. Creation fails because the lockfile already exists ([[eexist|EEXIST]]). Read it.
3. The owner process is no longer running ([[esrch|ESRCH]]). Delete the lockfile.
4. Start again from the top.
5. After `lockfileRetryLimit` removals, if the lockfile is still stale, fail.

No other failure is retried. Any other read or delete failure stops the run at once.

There is no backoff delay between these retries.

### Why 5

One retry covers the normal case where the race resolves immediately. A few additional retries cover unusually unlucky timing. Five gives a comfortable margin while still failing immediately from the user's point of view if something is genuinely wrong.
