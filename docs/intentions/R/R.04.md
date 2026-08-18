---
tags:
  - processed
---
// The conversation has reached the depth out of my understanding. And it so frustrating. You could have used simple language. Similar to this: "I see, it's an additional layer of safety. Currently, the clean up function removes lockfile no matter what, when it succeeds. To make the function future proof and robust: we make it checks the owner, so another script couldn't accidentally remove the lockfile. It's just a principle of defensive programming." 
Let's finish with the footnotes. The script name verification is enough, no need for tokens. The lockfile itself ensures a script couldn't start twice. And name verification ensures that other scripts cannot remove it.
// 
### R.04 — Refuse to start

**What the code does**
When the lockfile could not be created, the launcher prints one line — "Tree Generator is already running (lockfile exists)." — and stops the process immediately with an error code. 

Two details follow from how the printing is done. The message goes out through the error channel, not the ordinary one, which matters because [[intentions/R/R.06]] only ever copies ordinary messages into the log file. And it is printed before [[intentions/R/R.06]] has run at all, so nothing at this point is being logged anyway. Either way, the message exists only on screen, in the terminal window you started the run from.

The message is printed whenever the creation fails, whatever the reason. Being already there is one reason; a folder that cannot be written to, or a permissions problem, are others. All of them produce this same sentence.[^1]

**Why this matters**
Because the message is not written anywhere, a refused start leaves no trace at all. If you start the generator, look away, and come back to a closed window, there is nothing to tell you the run never began — the log file still holds whatever the last successful run wrote, complete with its closing marker, which reads exactly like a run that finished normally.

The message is also a diagnosis rather than an observation. It says a run is already going, when what the code actually knows is that creating the file failed. If a lock was stranded days ago, or the folder is read-only, you will be told a run is in progress, go looking for it, and find nothing.[^1]

Stopping immediately means the cleanup step in [[R.14]] never runs — which is correct here, since the lock belongs to whatever holds it and must not be removed. Worth noting because the same abruptness in other places is what strands locks in the first place.

**Why it may have been designed this way**
Likely: a one-line guard written for the ordinary case, where the only realistic reason for failure really is a run already going. The other reasons — an unwritable folder, a stranded lock — were probably not considered rather than deliberately lumped in.

Known: stopping with an error code rather than a success code is deliberate. It means anything that ever runs the generator automatically can tell a refused start from a completed one.

**Also affects:** [[A1.04]] (the same step drawn in A1), [[R.03]] (the attempt that failed), [[TS.03]] (the sweeper's equivalent message), [[intentions/R/R.06]] (why this message is not logged)

Notes:

[^1]: #bug One message is printed whatever the reason. Fix: if the file already exists, say another script is running and name the lockfile path. For anything else — an unwritable folder, a permissions problem — print a general failure message with the underlying reason, and do not claim a run is in progress. Once the lockfile carries a process id and a start time (see [[R.03]]), this message can also say what is running and since when, instead of a bare sentence.





