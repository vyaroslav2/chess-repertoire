---
tags:
  - processed
---
### R.07 — Make sure the user exists

**What the code does**
The launcher looks in the database for a user named "Yaroslav". If there is one, it is used; if not, one is created with that name and nothing else.

The name is written into the script as plain text. Nothing asks who you are, and nothing reads it from a settings file.

A user record holds only two things: an identifier the database generates, and the name. Nothing else — no password, no preferences.

**Why this matters**
This is here because everything below it has to belong to somebody. A repertoire belongs to a user, and every node, move and study card belongs to a repertoire. So the chain has to start somewhere, and this is where.

In practice it runs once, on the very first run against an empty database, and finds the same record every time after that.

It also means there is nothing to log in to. Whoever runs the script gets Yaroslav's repertoire, because that is the only name the script knows. That is correct for a tool you run on your own machine, and would be the first thing to change if the app were ever used by anyone else.[^1]

If you ever wanted a second repertoire — a White one, say — this is not what would stand in the way. The user can own several. The obstacle is further down, in [[R.08]], where the repertoire's title is fixed.[^2]

**Why it may have been designed this way**
Known: the database is built for several users, each owning several repertoires. So the structure anticipates more than one person even though the script only ever uses one.

Likely: the name was written in as a placeholder for a proper account system later, rather than as a decision that there would only ever be one person.

**Also affects:** [[A1.06]] (the same step drawn in A1), [[R.08]] (the repertoire that belongs to this user), [[DB.01]] (what a user record holds)

Notes:

[^1]: #deferred Only one user, named in the script. Correct while this runs on your machine alone. Revisit if the app is ever used by anyone else, or put anywhere other people can reach it — at that point the name has to come from whoever is using it rather than from the code.

[^2]: #note The user is not what limits you to one repertoire; a user can own several. See [[R.08]].