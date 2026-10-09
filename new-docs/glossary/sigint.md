---
tags:
  - reviewed
aliases:
  - SIGINT
---
OS-level signal meaning "interrupt", sent to the foreground process when you press Ctrl+C. It is a request, not a kill: a program may register a listener and decide what to do about it. This generator registers one and uses it to stop tidily at the next safe point ([[S0]]) rather than dying where it stands.

Not to be confused with [[forced-termination|forced termination]], which the process cannot intercept.
