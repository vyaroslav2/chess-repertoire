---
tags:
  - in-progress
aliases:
  - container OOM-kill
---

**Container OOM-kill** — "OOM" means "out of memory." Many apps (including this one, potentially) run inside a "container" — a lightweight sandboxed box that's given a fixed amount of memory to use. If the program inside tries to use more memory than the container is allowed, the operating system kills it immediately and without warning, mid-task, to protect the rest of the system. "OOM-kill" is just the name for that specific kind of forced termination.