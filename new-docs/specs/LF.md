---
tags:
  - in-progress
---
**LF — Lockfile Handling**

##### Purpose: 
Stop two generation runs from writing to the database at the same time.[^20] A script checks the lockfile before doing anything. If the lockfile is there it means another script is running and the DB is busy. 

##### What the code does conceptually:
We are checking whether the lockfile (see `lockfile-filename` at [[generation-config]]) exists --> if it does --> check the owner (script name), process ID --> if the process is dead --> remove the lockfile and create a new one --> otherwise throw a message: 'another script is running'. 

If the lockfile doesn't exist --> create the lockfile, write the owner, the PID and start time --> continue.

The owner name matters when releasing a lock at the end of the run: it stops this script from deleting a lock it doesn't actually own.   

When the run finishes (success or failure), release the lock. If ownership doesn't match, stop with an error instead of removing someone else's lock.

Most edge-case lockfile interactions (reading, creating, writing, path, permissions) are caught with their corresponding errors. Other leftover errors are caught by default native OS-level error handling.

The goal is robust lockfile handling — catching failures rather than crashing silently. LF.06, LF.07, and LF.09 are optional on top of that: they turn native errors into friendlier custom messages.

If a run gets refused because this lockfile failed, you won't find the error message in TreeGenLog.md later — you'd only have seen it live in the console at the time.

Apparently this case-handling logic is sufficient.

| Case                                                                                                                                                                  | What happens                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LF.01 lockfile doesn't exist.                                                                                                                                         | Continue — creates the lockfile and records `[script]`, `[pid]`, and `[time]`[^21] inside it. No message.                                                                                                                                    |
| LF.02 (optional) lockfile doesn't exist, but later code failed. <br>Creating the lockfile fails for a reason other than "it already exists" ([[eexist\|EEXIST]]).[^9] | Stop with a message: `"Unable to create lockfile: [reason][^14]."`                                                                                                                                                                           |
| LF.03 lockfile doesn't exist, but later code failed. <br>Writing the lockfile's contents fails right after creating it.[^11]                                          | Exit[^19] -- clean up (delete the empty file it just created). Then stop with a message: `"Failed to write to newly created lockfile: [reason][^14]. Attempting cleanup of the empty lockfile, then exiting."`                               |
| LF.04 lockfile exists.<br>Owning process still running (using [[esrch\|ESRCH]]).[^15]                                                                                 | Stop with a message: `"[script] (process [pid]) has been running since [time] UTC."`[^18]                                                                                                                                                    |
| LF.05 lockfile exists.<br>Owning process no longer running (using [[esrch\|ESRCH]]).[^15]                                                                             | Continue, with a message: `"Stale lockfile removed (owner process no longer running). Retrying."`                                                                                                                                            |
| LF.06 lockfile exists, but later code failed. <br>Lockfile briefly vanishes mid-check (another process just cleared it / race condition).[^5]                         | Retry from the top -- no message. <br>Limit reached: Stop with a message: `"Unable to acquire lockfile after [[lockfile-retry-limit]] attempts — file kept vanishing during the check. This is not expected. Manual intervention required."` |
| LF.07 lockfile exists, but later code failed. <br>Lockfile exists but its contents are invalid/unreadable.[^8]<br>                                                    | Stop with a message: `"Existing lockfile is malformed. Manual intervention required."`                                                                                                                                                       |
| LF.08 (optional) lockfile exists, but later code failed.  Removing a stale lock fails.[^10]                                                                           | Stop with a message: `"Unable to remove stranded lockfile: [reason]. Manual intervention required."`                                                                                                                                         |
| LF.09 (optional) lockfile exists, but later code failed. <br>Reading an existing lockfile fails for a reason other than "it's gone" ([[enoent\|ENOENT]]).             | Stop with a message: `"Unable to read existing lockfile: [reason]. Manual intervention required."`                                                                                                                                           |
| LF.10 lock release phase<br>Releasing the lock, but the recorded owner doesn't match this run.                                                                        | Stop with a message: `"[WARNING] Cannot release lock owned by [X]; expected [Y]. This may mean another script is running concurrently — check for overlapping runs before continuing."`                                                      |

[^5]: This edge case is this: try to create the lockfile → if that fails because it already exists → try to read it → if the read fails because the file's gone (someone else just deleted it) → loop back and try again from the top. 

[^8]: Here's a concrete way it happens: the lockfile's contents are written in one shot (open → write → close), but if the process gets killed _during_ that write — power loss, [[forced-termination|forced termination]], [[container-oom-kill|container OOM-kill]] — the file can be left with the lockfile _existing_ but only half-written: valid enough to fail the "no lockfile" check, but not valid, parseable JSON. This is the corrupted-file case handling, and it's not a hypothetical — partial writes on abrupt process death are a known, ordinary failure mode, not an edge case requiring bad luck or [[malicious-tampering|malicious tampering]]. A person manually creating/editing a file named `generator.lock` with garbage content would hit the same path.
	
[^9]: e.g. permission denied, disk full, directory missing. 

[^10]: If the code tries to delete a leftover lockfile and _that_ delete fails (e.g. permission issue).

[^11]: The file gets created, but if writing the owner data into it then fails.

[^14]: `Reason` here means the exact error / code OS throws. 

[^15]: Our code repurposes [[esrch|ESRCH]]: it sends a harmless "signal 0" to a process ID (which does nothing on its own) purely to see whether the OS reports `ESRCH` back — if it does, that process is dead; if not, it's still running. This is how our code checks whether a lockfile's recorded owner is still alive.

[^18]: It isn't "the time of the refusal," it's "the time the _other_ process originally started". 

[^19]: **Exit** = the code does something first (cleanup, in our case), _then_ halts. There's an action before the ending. Whereas **Stop** = hard stop, nothing else happens.

[^20]: The "two scripts can't run in parallel" protection only works _through the code path_. It can't defend against something bypassing that path entirely. A human (or another tool) manually deleting the lockfile file directly on disk, outside of the script's own logic -- it removes the protection. We use 'never-remove' naming to make it explicit for humans (see `lockfile-filename` at [[generation-config]]). 

[^21]: [time] -- always UTC (ISO 8601 format, e.g. `2026-09-03T08:15:23.000Z`), regardless of the machine's local timezone.


