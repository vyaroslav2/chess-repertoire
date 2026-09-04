---
tags:
  - processed
aliases:
  - malicious tampering
---
**Malicious tampering** — someone intentionally messing with the lockfile on purpose — deliberately writing garbage into it, corrupting it, or editing it by hand — rather than it becoming invalid by accident (like a crash mid-write). It's mentioned mainly for completeness: from the code's point of view, an intentionally-corrupted file and an accidentally-corrupted one look identical, so the same "stop with an error" handling covers both, even though our system doesn't need to specifically defend against sabotage.