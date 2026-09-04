---
tags:
  - in-progress
---
1. Filenames stay plain: ASCII only, hyphens instead of spaces, and none of the typographic characters — no en or em dashes (`– —`), no accents. They are awkward to type in a terminal and have to be quoted in commands. Lower case for filenames, everywhere except files for specs and diagrams, which are in capitals: LF, S1. At least one letter (A-Z), max 2 letters. Digits are optional, up to 2. Never start with a digit: LF1, LF, L, L01.   
2. Every note is a Markdown file (.md). Obsidian adds the extension itself; it is never typed in an Obsidian link. Every note has its frontmatter with a compulsory tag: either `#in-progress` or `#processed`. Tags compose — a glossary note may carry both its status tag and `#glossary`.
3. Folders carry the category. 
4. conventions/    how we work — this file, tag-vocabulary.
5. diagrams/    diagrams are named the same way — one or two capital letters and, where applicable, one or more digits (LF, S1…). Diagram files are `.excalidraw`; they could occasionally be `.md` instead — that's not a bug.
6. glossary/    one note per term; terms are named in the singular: node. Add aliases in the note's frontmatter so plurals and variants resolve to it. For terms related to the project use `#glossary` tag in the frontmatter of a file; don't use `#glossary` tag for general terms that are not specific to the project.  
7. specs/    notes for narrative specs.
8. templates/    reusable request formats.
9. logs/    run logs, not committed.
10. Note blocks within spec notes are named by their ID and counter: S1.01, S1.02... Because the ID is what every cross-reference points at, never rename one. If a new note block is added, give it a new number. Numbers are not required to follow sequential order: S1.01 --> S1.20 is not a bug. Moving linked files between folders is safe — Obsidian links by name, not by path. Renaming files within Obsidian is safe because Obsidian automatically updates linked file names, but only when the rename happens _through Obsidian itself_.
11. Probabilities are written as percentages in the notes; the code stores them as fractions of one.
12. Console log messages are written in backticks and double quotes, e.g. `"Stale lockfile removed (owner process no longer running). Retrying."` Tags used for code's end-of-run logging, with no colon, are: `[WARNING], [STOPPED], [FAILED], [FINISHED]` e.g. `"[WARNING] Cannot release lock owned by [X]; expected [Y]."`  
13. For log filenames: colons and milliseconds are stripped e.g. `treegen-2026-08-30T111523Z.md `
14. `-->`​ is chosen for arrows in text.




