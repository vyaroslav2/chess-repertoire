---
tags:
  - processed
---

# R — Generator start and lockfile

**Purpose**
Everything that happens before the tree is built: taking the lock so only one
script runs at a time, opening the log, making sure the user, repertoire,
starting position and root node exist, seeding the queue, and cleaning up
afterwards. Arrangement, not work.

**Decided across this diagram**

Per-run log files. One file per run, named with the script and the start time,
three kept, in docs/logs. Nothing touches the log until the lock is held.
See [[R.02]].

The lockfile is kept, not abandoned. It is the only thing preventing two
scripts writing to the same database at once. Fixed location, created in one
step, carrying the script name, process id and start time; removal checks the
name is its own. See [[R.03]].

The lock is taken first and released last. See [[R.14]].

A failed run must look failed in the log. See [[R.14]] and [[R.06]].

If the log cannot be written, the run stops. Decided: correct.

**Open across this diagram**

Whether a second run extends the tree or rebuilds it, once the re-run crash is
fixed. Two modes chosen at start rather than fixed in the code. See [[R.01]].

Whether the depth cap of 3 is right. See [[R.13]].