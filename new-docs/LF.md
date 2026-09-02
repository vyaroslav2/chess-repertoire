---
tags:
  - in-progress
---
**LF — Lockfile Handling**

Purpose: stop two generation runs from writing to the database at the same time.

| Situation                                                                 | What happens                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| No lockfile                                                               | Create one (recording which process owns it) and proceed.           |
| Lockfile exists, owning process still running                             | Stop with an error — refuse to proceed.                             |
| Lockfile exists, owning process no longer running                         | Treat as leftover from a crash. Remove it, then retry from the top. |
| Lockfile briefly vanishes mid-check (another process just cleared it)[^5] | Retry from the top.                                                 |
| Lockfile exists but its contents are invalid/unreadable[^8]<br>           | Stop with an error — needs manual fixing, can't safely guess.       |

When the run finishes (success or failure), release the lock — but only after confirming this run is still the one that owns it. If ownership doesn't match, stop with an error instead of removing someone else's lock.



[^5]: This edge case is this: try to create the lockfile → if that fails because it already exists → try to read it → if the read fails because the file's gone (someone else just deleted it) → loop back and try again from the top. No retry counter, no [[backoff-delay]], no special-casing beyond that one check. It's robust in the sense that it doesn't crash or hang on that race — but "robust" here means "simple enough not to break," not "sophisticated."


[^8]: Here's a concrete way it happens: the lockfile's contents are written in one shot (open → write → close), but if the process gets killed _during_ that write — power loss, [[forced-termination|forced termination]], [[container-oom-kill|container OOM-kill]] — the file can be left with the lockfile _existing_ but only half-written: valid enough to fail the "no lockfile" check, but not valid, parseable JSON. That's precisely the corrupted-file case your table handles, and it's not a hypothetical — partial writes on abrupt process death are a known, ordinary failure mode, not an edge case requiring bad luck or [[malicious-tampering|malicious tampering]]. A person manually creating/editing a file named `generator.lock` with garbage content would hit the same path.
	
