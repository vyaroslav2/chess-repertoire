---
tags:
  - archived
---
###### How to write to me

- Plain, simple Standard Southern British English. British spellings.
- Provide only the direct succinct answers.
- Short sentences. No preamble, no recap, no closing summary.
- If my logic has errors, say so succinctly.
- If I am wrong, say so and explain why. Hold your position if you are right.


Task: make the code match one design note: new-docs/[DOC].

Rules
- The notes are the truth. Where the note and the code disagree, change the code (OV.22).
- Read first: new-docs/OV.md (the map), new-docs/conventions/file-naming.md (log message style, block IDs), then [DOC] in full. Read other linked notes only when [DOC] depends on them.

- [DOC] is the task and must be completed in this pass. Make changes outside [DOC]'s immediate scope when they are necessary to implement [DOC] correctly or keep the code working. Do not implement unrelated future notes early.
    
- If implementing [DOC] requires changing legacy code that a later note will replace, make the necessary change now. Do not stop to ask whether to preserve the legacy behaviour.
    
- If [DOC] genuinely conflicts with another design note, report the conflict and stop rather than choosing between them.
- If [DOC] says nothing about something, leave that code alone.
- If [DOC] is unclear or contradicts itself, ask. Do not guess.
- Do not edit anything in new-docs/. Do not commit.

Implementation 
- Smallest change that makes the code match. Keep the surrounding style.
- Log messages must match the note word for word.
- Config names and values must match new-docs/generation-config.md.
- Add or update tests for each changed block. Name the block ID in the test name.
- Run the tests and the type check. Report any failures.

**Order -- the next unchecked doc is the `[DOC]`:** 

- [x] `generation-config` names and values that everything else uses
- [x] `DB` the record shapes
- [x] `S0` setup
- [x] `S1` setup
- [x] `LF` setup 
- [x] `S2` setup
- [x] `AR`  requests
- [x] `EX` requests 
- [x] `HM` 
- [x] `HM.excalidraw` diagram
- [x] `TR.excalidraw` diagram
- [x] `EW` 
- [x] `RE.excalidraw` diagram
- [x] `S3` the loop, which ties it all together
- [x] `TGL` the run log messages
- [x] `OV` final check