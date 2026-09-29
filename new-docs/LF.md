---
tags:
  - reviewed
---
# LF — Lockfile Handling

## Purpose

Two runs must never write to the database at once.[^1] So every run checks the lockfile first. If the file is there, another run already owns the database.

## How it works

Try to create the lockfile. Did it work?
Yes `-->` nothing was there. Write the owner, the PID and the start time, carry on.
No, it already exists ([[eexist|EEXIST]]) `-->` now read it for the owner and the PID. Is that process still alive?
* Yes `-->` stop. Another run is going.
* No `-->` the lock is stale. Delete it and start again from the top.

The owner name matters at the end of the run. It stops this run deleting a lock it does not own (LF.10).

When the run ends — finished, stopped or failed — release the lock ([[S0|S0.06]]). On success, carry on to [[S2]] ([[S1|S1.02]]).

## When it goes wrong

The table below covers the ways each step can fail. Anything not listed is left to the OS's own error handling.

LF.02, LF.08 and LF.09 are marked optional. They do not change what happens — they only turn a native error into a friendlier message.


| Case                                                                                                                                                                     | What happens                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LF.01 `[lockfile doesn't exist]`                                                                                                                                         | Continue — creates the lockfile and records `[script]`, `[pid]`, and `[time]`[^2] inside it. No message.                                                                                                                                     |
| LF.02 (optional) `[lockfile doesn't exist, but later code failed]` <br>Creating the lockfile fails for a reason other than "it already exists" ([[eexist\|EEXIST]]).[^3] | Stop with a message: `"Unable to create lockfile: [reason]."`[^4]                                                                                                                                                                            |
| LF.03 `[lockfile doesn't exist, but later code failed]` <br>Writing the lockfile's contents fails right after creating it.[^5]                                           | Exit[^6] -- clean up (delete the empty file it just created). Then stop with a message: `"Failed to write to newly created lockfile: [reason]. Attempting cleanup of the empty lockfile, then exiting."`[^4]                                 |
| LF.04 `[lockfile exists]`<br>Owning process still running (using [[esrch\|ESRCH]]).[^7]                                                                                  | Stop with a message: `"[script] (process [pid]) has been running since [time] UTC."`[^8]                                                                                                                                                     |
| LF.05 `[lockfile exists]`<br>Owning process no longer running (using [[esrch\|ESRCH]]).[^7]                                                                              | Continue, with a message: `"Stale lockfile -- owner process no longer running. Removing."`<br>Limit reached: Stop with a message: `"Unable to remove lockfile after [lockfileRetryLimit] attempts."`[^9]                                     |
| LF.06 `[lockfile exists, but later code failed]` <br>Lockfile briefly vanishes mid-check (another process just cleared it / race condition).[^10]                        | Retry from the top -- no message. <br>Limit reached: Stop with a message: `"Unable to acquire lockfile after [lockfileRetryLimit] attempts — file kept vanishing during the check. This is not expected. Manual intervention required."`[^9] |
| LF.07 `[lockfile exists, but later code failed]` <br>Lockfile exists but its contents are invalid/unreadable.[^11]<br>                                                   | Stop with a message: `"Existing lockfile is malformed. Manual intervention required."`                                                                                                                                                       |
| LF.08 (optional) `[lockfile exists, but later code failed]`  Removing a stale lock fails.[^12]                                                                           | Stop with a message: `"Unable to remove stranded lockfile: [reason]. Manual intervention required."`                                                                                                                                         |
| LF.09 (optional) `[lockfile exists, but later code failed]` <br>Reading an existing lockfile fails for a reason other than "it's gone" ([[enoent\|ENOENT]]).[^13]             | Stop with a message: `"Unable to read existing lockfile: [reason]. Manual intervention required."`                                                                                                                                           |
| LF.10 `[lock release phase]`<br>Releasing the lock, but the recorded owner doesn't match this run.                                                                       | Stop with a message: `"[WARNING] Cannot release lock owned by [X]; expected [Y]. This may mean another script is running concurrently — check for overlapping runs before continuing."`                                                      |

LF.11 The lockfile is created exclusively: the create either makes a brand-new file or fails with [[eexist|EEXIST]]. It never opens a file that is already there.[^14] This is what makes the whole scheme sound — without it, two runs could both read "no lockfile", both create one, and both carry on. 

[^1]: The protection only works through the code path. Delete the lockfile by hand, on disk, and the protection is gone. The name says so out loud — see `lockfileName` at [[generation-config]].


[^2]: `[time]` -- always UTC (ISO 8601 format, e.g. `2026-09-03T08:15:23.000Z`), regardless of the machine's local timezone.


[^3]: e.g. permission denied, disk full, directory missing. 

[^4]: `Reason` here means the exact error / code OS throws. 

[^5]: The file gets created, but if writing the owner data into it then fails.

[^6]: **Exit** = the code does something first (cleanup, in our case), _then_ halts. There's an action before the ending. Whereas **Stop** = hard stop, nothing else happens.

[^7]: Our code repurposes [[esrch|ESRCH]]: it sends a harmless "signal 0" to a process ID (which does nothing on its own) purely to see whether the OS reports `ESRCH` back — if it does, that process is dead; if not, it's still running. This is how our code checks whether a lockfile's recorded owner is still alive.

[^8]: It isn't "the time of the refusal," it's "the time the _other_ process originally started". 

[^9]: see [[generation-config]]

[^10]: This edge case is this: try to create the lockfile → if that fails because it already exists → try to read it → if the read fails because the file's gone (someone else just deleted it) → loop back and try again from the top. 

[^11]: Here's a concrete way it happens: the lockfile's contents are written in one shot (open → write → close), but if the process gets killed _during_ that write — power loss, [[forced-termination|forced termination]], [[container-oom-kill|container OOM-kill]] — the file can be left with the lockfile _existing_ but only half-written: valid enough to fail the "no lockfile" check, but not valid, parseable JSON. This is the corrupted-file case handling, and it's not a hypothetical — partial writes on abrupt process death are a known, ordinary failure mode, not an edge case requiring bad luck or [[malicious-tampering|malicious tampering]]. A person manually creating or editing the lockfile with garbage content would hit the same path.
	
[^12]: If the code tries to delete a leftover lockfile and _that_ delete fails (e.g. permission issue).

[^13]: How does our code distinguish between LF.09 and LF.07?
[^14]: The create is the claim and it is atomic: it either wins or comes back [[eexist|EEXIST]]. Only once it has lost do we read the file for the PID. The danger is the other order — read first to see whether a lockfile is there, then create. Two runs can both read "nothing there" before either creates, and both carry on. 


