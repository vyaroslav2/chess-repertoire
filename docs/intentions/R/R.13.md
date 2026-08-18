---
tags:
  - processed
---
### R.13 — Hand over to the main loop

**What the code does**
Everything is now in place: the lock is held, the log is open, the user, the repertoire, the position row and the root node all exist, the queue holds one item and the visited list is empty. The launcher calls the generator, handing it the starting position and a depth cap of 3.

Control passes to [[A1]] and does not return until the whole run has finished or failed.

The cap of 3 is written into this line as a bare digit.

**Why this matters**
This is the boundary between setting up and doing. Everything above is arrangement; everything below is the tree being built. It is also the only place the two halves meet, which is why the cap is the one setting handed across — everything else the generator needs, it finds in the database.

The cap of 3 counts full moves, so a run covers White's first three moves and Black's three replies. That is the single number deciding how large your repertoire is: raise it and the tree grows very quickly, because every extra level multiplies rather than adds.[^1]

The cap is also compared against a second, softer limit worked out per position from how likely you are to reach it — the budget in [[A2]]. The smaller of the two applies. Since that budget is never below 5 and the cap is 3, the cap always wins today, and the budget has no effect at all.[^2]

Because control does not come back until the end, there is no way to pause, inspect or intervene mid-run. What you get is the running commentary in the log.

**Why it may have been designed this way**
Known: the cap is passed as an argument rather than read from the database, so the generator does not depend on any stored setting. That keeps the generator usable from a test script with a different cap, which is what the test scripts do.

Known: 3 was chosen as a starting depth to get a usable book quickly, not as a considered final answer.

**Also affects:** [[A1.01]] (where the generator receives this), [[A2.08]] (where the cap meets the per-position budget), [[R.01]] (where the cap is edited), [[R.14]] (which runs when this returns)

Notes:

[^2]: #note The per-position budget in [[A2]] never applies while the cap is 3, because the budget's smallest value is 5 and the smaller of the two wins. The budget only starts to matter if the cap is raised above 5.




