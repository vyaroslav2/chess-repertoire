---
tags:
  - processed
---

### R.02 — Wipe the log

**What the code does**
Before anything else happens, the launcher overwrites the log file with a heading and an opening marker. Whatever was in that file from the previous run is gone.

The location is written into the script: a folder inside your OneDrive desktop, ending in a file called `TreeGenLog.md`. The path includes a folder name in Russian.

Two things follow from where this sits in the order. It happens *before* the lockfile is taken, so it runs even when the run is about to refuse to start. And it happens before anything is checked, so if the folder is missing the script stops here having done nothing at all.

**Why this matters**
Starting a second run while one is already going destroys the first run's log. The second run wipes the file, then fails to take the lockfile and quits. The first run carries on quite happily and keeps appending — but everything it wrote before that moment is gone, and the file now looks like a run that started in the middle of a line.[^1]

Because the path is written into the script rather than worked out, the generator only runs on your machine, in that account, with that folder present. Moving the folder, renaming it, or running on another computer stops the generator before it reaches the lockfile — with an error about a missing file rather than anything explaining what went wrong.

Only one log exists, so you keep the most recent run and nothing else. There is no way to compare a run against the one before it, which is what you'd want when checking whether a change to the code improved anything.[^2]

**Why it may have been designed this way**
Known: the file is written as Markdown with an opening code marker, and the closing marker is added at the end of the run — so it's built to be read in Obsidian alongside your notes, not as a plain text log.

Likely: wiping at the start keeps one clean log per run and stops the file growing without limit. The ordering — wiping before the lock is taken — looks like the order things were added rather than a decision.

**Also affects:** [[A1.02]] (the same step drawn in A1), [[R.03]] (the lockfile step it happens before), [[R.06]] (which sends later messages to this same file)

Notes:

[^1]: #note The log must not be touched until the lockfile is taken. Today the wipe happens first, so a second run destroys the first run's log on its way to refusing to start. Per-run files (see [^2]) do not remove this on their own: a refused run would still create its own file and prune an old one to make room, damaging a log and leaving a stray file for a run that never began. A refused start should touch nothing — print to the terminal, as [[R.04]] already does, and stop.

[^2]: #roadmap Replace the single shared log with one file per run. Each script writes its own, named with the script and the time the run started — `treegen-2026-08-17_0942.md` and `sweeper-2026-08-17_1130.md`. The start time is used, not the finish time, so the name is fixed from the first line and the file can be watched in Obsidian while the run goes; it also means a run that dies leaves its file in place, without the closing marker, which is how an incomplete run is told from a finished one. Order: take the lockfile first, then create the file, then delete the script's own oldest files until three remain — counting only files whose name begins with that script's prefix, so a generator run never removes a sweeper log. Pruning at the start rather than the end means a crash cannot skip it. The folder is `docs/logs`, worked out from the project folder rather than written into the script — same approach as the lockfile in [[R.03]] — so the script stops being tied to one machine. Add `docs/logs/` to `.gitignore` first, or every run's log will be committed. Also changes [[R.06]], which sends messages to this file, and [[R.14]], which writes the closing marker. The file opens with a heading carrying the start time in full and the depth cap the run was given; the closing step in [[R.14]] appends the finish time and how long the run took. A file with no finish line is an incomplete run.


