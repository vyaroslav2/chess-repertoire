---
tags:
  - reviewed
---
1. Filenames stay plain: ASCII only, hyphens instead of spaces, and none of the typographic characters — no en or em dashes (`– —`), no accents. They are awkward to type in a terminal and have to be quoted in commands. Lower case for filenames, everywhere except files for specs and diagrams, which are in capitals: LF, S1. At least one letter (A-Z), max 3 letters. Digits are optional, up to 2. Never start with a digit: LF1, LF, L, L01.   
2. Every note is a Markdown file (.md). Obsidian adds the extension itself; it is never typed in an Obsidian link. Every note has its frontmatter with a compulsory tag: either `#in-progress` or `#processed`. Tags compose — a glossary note may carry both its status tag and `#glossary`.
3. Folders carry the category. 
4. conventions/    how we work — this file, tag-vocabulary.
5. diagrams/    diagrams are named the same way — one, two or three capital letters and, where applicable, one or two digits (LF, S1…). Diagram files are `.excalidraw`; they could occasionally be `.md` instead — that's not a bug.
6. glossary/    one note per term; terms are named in the singular: node. Add aliases in the note's frontmatter so plurals and variants resolve to it. For terms related to the project use `#glossary` tag in the frontmatter of a file; don't use `#glossary` tag for general terms that are not specific to the project.  
7. specs/    notes for narrative specs.
8. research/    analysis and reasoning behind a spec: options weighed, problems found. No block IDs. Lower-case filenames.
9. templates/    reusable request formats.
10. logs/    run logs, not committed.
11. Note blocks within spec notes are named by their ID and counter: S1.01, S1.02... Because the ID is what every cross-reference points at, never rename one. If a new note block is added, give it a new number. Numbers are not required to follow sequential order: S1.01 --> S1.20 is not a bug. An ID is unique across the whole vault, not just within one file. A diagram that carries blocks belonging to another note's prefix gives them their own band, well clear of the numbers that note already uses: HM.01--HM.06 in [[HM]], HM.20--HM.39 in [[HM.excalidraw|HM diagram]].   Moving linked files between folders is safe — Obsidian links by name, not by path. Renaming files within Obsidian is safe because Obsidian automatically updates linked file names, but only when the rename happens _through Obsidian itself_. Notes in a diagram (the green boxes) are named with N after the prefix and their own counter: TR.N.01, TR.N.02… Optional: list the boxes a note serves in brackets after its ID, e.g. TR.N.02 (TR.08, TR.10). Like block IDs, note IDs are never renamed or reused.
12. Probabilities are written as percentages in the notes; the code stores them as fractions of one. They are never rounded when stored, passed on or added up. Round only when printing. Comparisons use the 0.0001% tolerance (`probabilityTolerance`). 
13. Console log messages are written in backticks and double quotes, e.g. `"Stale lockfile removed (owner process no longer running). Retrying."` Tags used for code's end-of-run logging, with no colon, are: `[WARNING], [STOPPED], [FAILED], [FINISHED]` e.g. `"[WARNING] Cannot release lock owned by [X]; expected [Y]."` In diagrams, backticks are not used, because Excalidraw does not render them. Log messages go in double quotes only, e.g. "[WARNING] …". Code names (cumProb, stopReason) are written plain. 
14. For log filenames: colons and milliseconds are stripped e.g. `treegen-2026-08-30T111523Z.md`
15. Config properties use `camelCase` (e.g. `tinyThreshold`, `lockfileRetryLimit`, `nodeTouchCountCap`).
16. Types are PascalCase (e.g. `UserRequestedStopError`)
17. `-->`​ is chosen for arrows in text.
18. In diagram boxes, `*` is used only when a box has two or more separate steps; a box with one step has no bullet. Lines under a lead-in ending in `:` are never bulleted. A sentence that explains rather than acts is not a step.
19. Glossary notes link to other glossary notes and to config, never to block IDs (S3.11, TR.41). Where a term is used is shown by Obsidian's backlinks.
20. sessions/    one note per coding session: what was done, what is in progress, the decisions made and why, what is next, and the commits. Named by the date the session started, even if it runs past midnight: `session-2026-10-09.md`; a second session that day is `session-2026-10-09-2.md`. Start times and end times go in the frontmatter. Made from [[templates/session|the session template]]. Committed, unlike logs/.
21. `changelog.md` sits at the top of the vault, outside the folders. Short, plain list of what changed, newest date first: one `## YYYY-MM-DD` heading per day, no categories.



