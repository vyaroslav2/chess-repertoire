---
tags:
  - in-progress
---
1. [ ] Filenames stay plain: ASCII only, hyphens instead of spaces, and none of the typographic characters — no en or em dashes (– —), no accents. They are awkward to type in a terminal and have to be quoted in commands. Lower case for filenames, everywhere except files for intentions and diagrams, which are in capitals: LF, S1.   
2. [ ] Every note is a Markdown file (.md). Obsidian adds the extension itself; it is never typed in a Obsidian link. Every note has its frontmatter with a compulsory tag: either `in-progress` or `processed`.
3. [ ] Folders carry the category. 
4. [ ] conventions/  how we work — this file, tag-vocabulary.
5. [ ] diagrams/     the intention diagrams, one or two capital letters and one or more digits  (LF, S1…) Diagram files are .excalidraw format; occasionally could be in .md format, that is not a bug.  
6. [ ] glossary/     one note per term,  `#glossary` tag in the meta data of a file. Terms are named as they are spoken, singular: node. Add aliases in the note's frontmatter so plurals and variants resolve to it.
7. [ ] intentions/   notes for narrative specs.
8. [ ] templates/    reusable request formats.
9. [ ] logs/         run logs, not committed.
10. [ ] Note blocks within intention notes are named by their ID and counter: S1.01, S1.02... Because the ID is what every cross-reference points at, never rename one. If a new note block added, add new number. Numbers allowed not to follow the sequential order: S.01 --> S.20, this is not a bug. Moving linked files between folders is safe — Obsidian links by name, not by path. Renaming files within Obsidian is safe because Obsidian auto update link file names. 
11. [ ] Probabilities are written as percentages in the notes; the code stores them as fractions of one.
12. [ ] Console log messages are written in backticks and double quotes, e.g. `"Stale lockfile removed (owner process no longer running). Retrying."` Tags used for code's end-of-run logging, no colon are: `[WARNING], [STOPPED], [FAILED], [FINISHED]` e.g. `"[WARNING] Cannot release lock owned by [X]; expected [Y]."`  

