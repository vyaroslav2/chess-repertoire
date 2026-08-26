---
tags:
  - processed
---

### R.01 — Start the tree generator 

**What the code does**
The generator is a separate script, not part of the web app. Nothing in the app can start it, and there is no shortcut for it in the project's list of commands, so you run the file directly from a terminal yourself.

It takes nothing from you when you run it. Both things it needs are written inside the file: the starting position, near the top, and the depth cap, further down where the generator is called. The starting position is the standard opening position, so every run begins from move one.

**Why this matters**
The tree only grows when you remember to run it. Nothing schedules it, and nothing triggers it after a study session — if you study a line that runs out of book, the app cannot ask for more.

Because nothing is passed in, changing where a run starts or how deep it goes means editing the file in two different places, neither of them obvious: a long position code near the top, and a bare number further down.[^1]

Always starting from the opening position means every run walks the tree from the root. Together with the [[re-run-crash]][^2], there is currently no way to extend part of a tree or regenerate one branch — the only working run is a first run against an empty tree.

It also fixes you to one repertoire. The script always starts from the same position and always builds Black's replies, so a second repertoire, or a White one, would mean a second copy of this script.[^3]

**Why it may have been designed this way**
Likely: a personal tool for one person on one machine. A command-line script avoids building any interface for something you run occasionally, and a fixed starting position is reasonable while there is exactly one repertoire.

**Also affects:** [[A1.01]] (the same step drawn in A1), [[R.13]] (the value of the depth cap itself)

Notes:

[^1]: #note The cap lives in `scripts/start_tree_generator.ts`, inside the block that begins `async function main()`. Find the line reading `await generateRepertoire(START_FEN, 3);` — the bare `3` is the cap. Change that digit and nothing else. It isn't a setting: nothing reads it from a configuration file, and there is no way to pass it in when you run the script. To run the script you type its path at the terminal, because there is no shortcut for it in `package.json`.[^4] Adding one there, alongside `dev`, `build`, `start` and `lint`, would let you type a short command instead of remembering the path.


[^2]: #bug The re-run crash is what happens if you run the generator a second time against a tree that already has content. When the generator covers a White move, it first looks for a [[node]] in your tree that already holds the position it has just reached. That search compares the _full_ position code against the _shortened_ codes actually stored, so it never matches — the generator always concludes the position is new. It then tries to create a node for it, and the database refuses, because a node with that exact move history already exists from the earlier run. The error stops the whole run. In practice, a second run dies on the very first White move it covers. So the only path that works today is deleting the tree and building it again from nothing, which is what `reset_tree` does. That removes your study cards along with the tree, but the cached human and engine data survives, so a rebuild is fast and makes few network requests. Fixing the crash means making a clean wipe-and-rebuild reliable — that is all it needs to do. The generation model is rebuild-from-root only (see [[M]]): every run starts clean from the root, and there is no extend-an-existing-tree mode. The caches survive the wipe, so a rebuild is fast and makes few network requests.



[^3]: #roadmap Support a White repertoire — needs the start position, the colour, and Black's replies to stop being fixed in the script.

[^4]: #roadmap Add a `generate` entry to the `scripts` section of `package.json`, so the generator can be started with a short command instead of typing the file path.
