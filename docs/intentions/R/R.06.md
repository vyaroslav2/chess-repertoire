---
tags:
  - processed
---
### R.06 — Send messages to the log

**What the code does**
Once the lock is held, the launcher replaces the ordinary printing function for the rest of the run. From this point, anything that prints goes to the screen as before and is also added to the end of the log file.

The replacement is global. The generator, the position fetchers, the engine steps — none of them know anything about a log file, yet every message they print lands in it, because they all print through the function that has just been replaced.

Only the ordinary channel is replaced. The error channel is left exactly as it was.

Each line is written to disk as it is printed, and the program waits for that write to finish before carrying on.

**Why this matters**
This one step is what makes the log complete. Nothing else in the project writes to it, and no other part of the code was changed to make this happen — which is why messages from every corner of the program appear there without any of them being aware of it.

The error channel being left alone means errors never reach the log. When a run crashes, the failure is printed through that channel: it appears on screen, and the log simply stops mid-sentence. Then the cleanup step adds the closing marker anyway, so the file reads like a run that finished normally.[^1]

Because each line is written and waited for, the log is always complete up to the moment of a crash — nothing is lost in a buffer. The cost is thousands of small writes.[^2]

If the log file ever becomes unwritable while a run is going — the folder deleted, moved, or locked by the syncing — then the next message printed fails, and that failure travels back to whatever was printing. The run stops. So a problem with the log can end a run that was otherwise going perfectly well.[^3]

**Why it may have been designed this way**
Known: replacing the printing function rather than changing every message is deliberate and sensible. It means one small change captures everything, including messages in code written later.

Likely: the error channel was left alone by oversight rather than choice — there is no sign of a reason to exclude it.

**Also affects:** [[A1.23]] (the same step drawn in A1), [[R.02]] (which creates the file this writes to), [[R.14]] (which adds the closing marker), [[R.04]] (whose message is printed before this step and so never logged)

Notes:

[^1]: #bug Errors never reach the log. Only the ordinary channel is captured, so the failure message printed when a run crashes exists on screen alone — and the closing marker is added regardless, making a crashed run look finished. Fix: send both channels to the log once it is open, marking error lines so they stand out when reading.

[^2]: #note Each message is written to the file and waited for before the program carries on, rather than being buffered. That is why the log is intact right up to the moment of a crash. It also means thousands of separate small writes over a run — slower than it looks, though unnoticeable against the time spent waiting for the internet and the engine.

[^3]: #note If the log becomes unwritable while a run is going, the run stops. Decided: this is correct. A run whose record is being lost should not carry on quietly — better to stop and find out why.


