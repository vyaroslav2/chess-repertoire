---
tags:
  - processed
---

### R.03 — Take the lockfile

**What the code does**
The launcher tries to create a file called `generator.lock` in the project folder. The file holds a single word, `locked`; nothing else is written into it.

The attempt is made in one step: the code looks to see whether the file is already there and, if it is not, writes it. If it is already there, the attempt fails and the launcher moves on to [[R.04]].

Where the file lands depends on the folder you are standing in when you start the script, not on where the script itself lives.

The same file is what the tactical sweeper checks before it starts, so the generator and the sweeper cannot run at the same time.[^1]

**Why this matters**
This one file is the only thing preventing two runs at once, and preventing a run and a sweep at once. That matters because both drive the same chess engine and write to the same database — two at once would fight over the engine and interleave their writes.

The file carries no information: no start time, nothing saying which of the two programs made it, no way to tell a live lock from a leftover. So when something refuses to start, you cannot tell whether a run really is going on or whether a lock was stranded days ago.[^2]

A stranded lock is not rare. It happens whenever the process ends without running its cleanup — the window closed, the machine restarted, or the "stop" option chosen at a rate-limit prompt, which ends the process on the spot. After any of those, every later run and every sweep refuses to start until you delete the file by hand.

Because the location depends on where you start the script from, starting it from a different folder creates a second lock file somewhere else. Both programs would then be checking different files, and the protection would silently stop working.

**Why it may have been designed this way**
Likely: the simplest thing that works. A file either exists or it does not, it survives the program ending, and no extra machinery is needed to read it.

Known: the sweeper checks the same file deliberately — its message says so in as many words, telling you to wait for the generator to finish.

**Also affects:** [[A1.03]] (the same step drawn in A1), [[R.04]] (what happens when it fails), [[R.14]] (where it is removed), [[TS.02]] (the sweeper's own check), [[FR.15]] (the stop option, which leaves the lock behind)

Notes:
[^1]: #note The sweeper takes the lock in two separate steps — it checks, then creates — where the generator does it in one. Between those two steps a run could start and both would proceed. Tagged as a bug in [[TS.02]], where the two-step version lives.

[^2]: #bug The lockfile carries no information and lives wherever the script was started from, so a run can be refused with no way to tell whether a run is genuinely going on or a lock was stranded days ago, and two scripts started from different folders would check two different files. Four parts to the fix, in this order.

    First, put the file in a fixed place, worked out from where the code sits rather than from the folder you were standing in. Same approach as the log folder in [[R.02]].

    Second, create it atomically — ask the file system to create the file only if it does not already exist, in one step, instead of looking and then writing. Two scripts racing can then never both succeed. This is the real protection and it is the smallest part of the change.

    Third, write into it: which script made it, its process id, and the date and time it started.

    Fourth, on refusal, read the file back and ask the operating system whether that process is still alive. Dead means the lock is stranded — clear it and carry on. Alive means refuse, and print what the file says, with the date included and the full path of the file: `treegen (process 8412) has been running since 2026-08-15 09:42. Lock file: <path>`.
    
    Fifth, make removal check the name: read which script created the lockfile and delete it only if it is this script's own. Today removal deletes the file no matter what, and is safe only because of where it happens to be called from. The check makes it safe by design, so a script added later cannot remove a lockfile belonging to a run in progress.
		
    Known limitation, accepted rather than overlooked: process ids get reused, so a stranded lock naming an id that some unrelated program now holds will look live for ever. Checking the recorded start time against the process's real start time would catch that, but it means running a Windows command and reading its output, which is more machinery than it is worth here. So the check can be wrong in two ways, and neither leaves things worse than they are today: wrongly saying dead lets two scripts run together, which is exactly what happens now if you start two by hand; wrongly saying alive means deleting the file by hand, which is what every stranded lock needs today.

    Which is why the last call stays with you, by design. A lockfile must never be cleared on a guess — deleting one while a run really is going means two programs writing to the same database. The code clears it only on evidence that the owner is gone; where there is no evidence it refuses and prints enough for you to judge. If the message says something is running and you know nothing is, check for open terminal windows, and delete the file at the path printed. After a reboot, any lockfile still present is certainly stranded. Printing the path is what makes that a five-second job rather than a hunt.

    All four parts live in `src/lib/core/lockfile.ts`, which both scripts already use, so [[TS.02]], [[TS.03]] and [[R.04]] inherit the change without being touched — though R.04's and TS.03's messages are worth improving in the same pass, since they can finally say something useful.

