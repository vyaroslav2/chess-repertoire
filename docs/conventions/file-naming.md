Folders carry the category. Filenames stay plain: ASCII only, hyphens instead of spaces, and none of the typographic characters — no en or em dashes (– —), no accents. They are awkward to type in a terminal and have to be quoted in commands. Lower case everywhere except codes and IDs, which keep their capitals because the capital is part of the name: R, A1, B2 for diagrams, R.01, A4.12 for box notes. Every note is a Markdown file (.md). Obsidian adds the extension itself; it is never typed in a link.

conventions/  how we work — this file, tag-vocabulary
diagrams/     the verified diagrams, one per letter code (R, A1, B2 …)
glossary/     one note per term, #glossary if specific to this project
intentions/   one folder per diagram, named by its code (R, A1, B2, LK …), holding one note per box, named by its ID (R.01, A4.12 …)
templates/    reusable request formats
logs/         run logs, not committed

Box notes are named by their ID alone, because the ID is the name and it is
what every cross-reference points at. Never rename one. Moving one between
folders is safe — Obsidian links by name, not by path — but changing the
name breaks every link to it.

Each intentions folder holds a note named after the diagram (R.md, A1.md)
carrying its purpose in one sentence, plus anything decided about the
diagram as a whole rather than one box.

Terms are named as they are spoken, singular: node, re-run-crash.
Add aliases in the note's frontmatter so plurals and variants resolve to it.