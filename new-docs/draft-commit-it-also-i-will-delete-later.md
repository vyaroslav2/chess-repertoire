I'd keep one file per session, in a new `sessions/` folder.

**Name:** `sessions/session-2026-10-09.md`

- Use the date the session **started**, even if you finish at 2 am. A late night then belongs to the day it began, which is how you'll remember it.
- Two sessions on the same day: `session-2026-10-09-2.md`.
- The `session-` prefix follows your log style (`treegen-2026-…`) and keeps the filename from starting with a digit.
- Put the real start and end times in the frontmatter, so the file still shows when a session ran past midnight.

**Structure:**

```markdown
---
tags:
  - in-progress
  - session
date: 2026-10-09
start: 2026-10-09 22:40
end: 2026-10-10 02:15
branch: new-docs-code-matches-specs
---
## Done
- 

## Decisions
- 

## Open / next
- 

## Commits
- 
```

- **Done:** what changed, one line each, with links to notes such as [[HER]].
- **Decisions:** what you chose and why. This is the part you'll want later.
- **Open / next:** where to start next time.
- **Commits:** short hashes. Leave the section out if you didn't commit.

Unlike `logs/`, I'd commit `sessions/`, since this is a record you'll want to keep.

I can also add the template to `templates/` and a `sessions/` rule to [file-naming.md](https://claude.ai/epitaxy/new-docs/conventions/file-naming.md) if you'd like.