---
tags:
  - processed
---

### R.08 — Make sure the repertoire exists

**What the code does**
The launcher looks for a repertoire belonging to that user with the title "Black Universal Repertoire". If there is one, it is used; if not, one is created with that title and the colour black.

Both the title and the colour are written into the script as plain text.

A repertoire record holds four things: an identifier, the title, the colour, and which user owns it. Everything the generator builds — every node, every move, every study card — hangs off this one record.

The colour is stored but never looked at afterwards. Nothing in the generator reads it. The decision to build Black's replies is made elsewhere, by the code itself always covering White's moves and always choosing a reply for Black.

**Why this matters**
This is the record that limits you to one repertoire, and it does so twice over. The title is fixed, so a run always finds this one. And the colour is decorative, so even changing the title would not produce a White repertoire — you would get a second, differently named repertoire that the generator would still build Black's replies for.[^1]

Because the search is by title, changing that word in the script quietly starts a new, empty repertoire rather than adding to the existing one. Nothing warns you. A typo does the same.[^2]

It also means the sweeper's reach is wider than it looks. The sweeper audits Black replies across the whole database rather than within one repertoire, so a second repertoire created here would be swept along with this one, judged by the same assumption that a higher score is worse.[^3]

**Why it may have been designed this way**
Known: the database is built so that a user can own several repertoires, each with its own colour. The structure anticipates more than one.

Likely: the title and colour were written in to get the first one built, with the intention of choosing them properly later. The colour being stored but unread suggests it was put there for a chooser that was never written.

**Also affects:** [[A1.07]] (the same step drawn in A1), [[R.07]] (the user this belongs to), [[R.10]] (the root node created inside it), [[DB.02]] (what a repertoire record holds), [[TS.06]] (which sweeps every repertoire, not just this one)

Notes:

[^1]: #roadmap Support more than one repertoire. Three things are fixed and would each need to come from outside the script: the title, the colour, and the assumption that Black is the side being prepared. The colour is already stored on the record and would become the thing that decides which side's moves are covered, rather than being ignored as it is now. Related: [[R.01]], where the starting position is also fixed.

[^2]: #note The repertoire is found by its title. Changing that word in the script — deliberately or by mistake — silently starts a new empty repertoire instead of adding to the existing one.

[^3]: #note A second repertoire would be audited by the sweeper along with this one, because [[TS.06]] loads Black replies from the whole database rather than from one repertoire.
