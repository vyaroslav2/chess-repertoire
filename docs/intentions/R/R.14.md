---
tags:
  - processed
---
### R.14 — Finish and clean up

**What the code does**
When the generator returns, or fails, three things happen in order: the lockfile is removed[^2], a closing marker is added to the log, and the connection to the database is closed.

These three run whichever way the run ended. If the generator finished normally they run straight away; if it failed, the failure is caught and printed first, then the same three happen.

The failure message is printed through the error channel, so it appears on screen but not in the log — see [[R.06]].

**Why this matters**
This is what releases the lock. Without it, every later run and every sweep would refuse to start. That is why it runs on both paths: a run that fails still has to let go of the lock it took.

It only runs if the program reaches this point. A process that is killed — the window closed, the machine restarted, or the stop option chosen at a rate-limit prompt in [[FR.15]] — never gets here, and the lock survives it. That is the stranded lock described in [[R.03]].

The closing marker is added regardless of how the run ended. Combined with the failure message not reaching the log, this is what makes a crashed run look finished: the log stops mid-position, then gets its marker, and reads as though everything went to plan.[^1]

Removing the lock does not check whose it is. That is safe here only because this step runs at the end of a run that took the lock at the start — see the ownership note in [[R.03]].

**Why it may have been designed this way**
Known: putting these three in a block that runs on both paths is deliberate and correct. It is the standard way of making sure something is released whatever happens.

Known: putting these three in a block that runs on both paths is deliberate and correct. It is the standard way of making sure something is released whatever happens.

Likely: the order within the block was not considered. Nothing suggests a reason to release the lock before the work it protects has finished.

**Also affects:** [[A1.22]] (the same step drawn in A1), [[R.03]] (the lock this releases), [[R.06]] (why the failure message is not logged), [[R.02]] (the log this closes), [[LK.09]] (the shared removal step)

Notes:

[^1]: #bug The closing marker is added even when the run failed, so a crashed run looks like a finished one in the log. Together with the failure message never reaching the log ([[R.06]]), there is nothing in the file to say the run did not complete. Fix: write the failure into the log before closing, and mark the ending differently — a finished run gets its finish time and duration, a failed one says so and gives the reason. Then the log tells you what happened without needing the terminal window that is long since closed.

[^2]: #bug The lock is released before the log is closed and before the database connection is shut. For that moment the run still holds both, so another run could start while this one is still writing. Fix: reverse the order — write the closing lines to the log, close the database connection, then release the lock last. The lock is taken first and should be released last.
