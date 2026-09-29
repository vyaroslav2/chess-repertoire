---
tags:
  - in-progress
---
Task: make the code match one design note: new-docs/[DOC].

Rules
- The notes are the truth. Where the note and the code disagree, change the code (OV.22).
- Read first: new-docs/specs/OV.md (the map), new-docs/conventions/file-naming.md (log message style, block IDs), then [DOC] in full. Read other linked notes only when [DOC] depends on them.
- Scope is [DOC] only. Change only behaviour that [DOC] owns. If you find a clash with another note, report it; do not fix it.
- If [DOC] says nothing about something, leave that code alone.
- If [DOC] is unclear or contradicts itself, ask. Do not guess.
- Do not edit anything in new-docs/. Do not commit.

Implementation 
- Smallest change that makes the code match. Keep the surrounding style.
- Log messages must match the note word for word.
- Config names and values must match new-docs/config/generation-config.md.
- Add or update tests for each changed block. Name the block ID in the test name.
- Run the tests and the type check. Report any failures.

**Order -- the next unchecked doc is the `[DOC]`:** 

- [ ] `generation-config` names and values that everything else uses
- [ ] `DB` the record shapes
- [ ] `S0` setup
- [ ] `S1` setup
- [ ] `LF` setup 
- [ ] `S2` setup
- [ ] `AR`  requests
- [ ] `EX` requests 
- [ ] `HM`  
- [ ] `HM.excalidraw` diagram
- [ ] `TR.excalidraw` diagram
- [ ] `EW` 
- [ ] `RE.excalidraw` diagram
- [ ] `S3` the loop, which ties it all together
- [ ] `TGL` the run log messages
- [ ] `OV` final check