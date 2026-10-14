---
tags:
  - in-progress
---
# AK — Anki

Anki is the backend for reviews; the web app is the frontend. The deck is made once from our database. After that, the two are not linked.

AK.01 **The model.**
Anki keeps each card's state: the queue, intervals, due dates and grades. The web app keeps no copy of it. A thin layer between them lets the app get the next card, read its fields and send the grade back.
- The layer is AnkiConnect, on `localhost:8765`. Anki must be running.
- The app never opens or writes Anki's collection file itself.

AK.02 **The deck.**
20 cards: the 20 Black replies with the highest `cumProb`, from 1. e4 c6 (64%) down to about 1%. One card per reply (`RepertoirePositionStat`).
- Deck: `Chess Repertoire`. Profile: `User test New` while we test. 

==`AK.02.03` //- Can we make a 10 cards deck, as an exception? (bypassing the block of when the generation is running) -//==
==`AK.02.04` //- How to open Anki log to see key pressed or notes updates -- due times, or whatever it shows? -//== 

- Made by `scripts/anki_export.ts`. It reads the database and writes nothing to it.
- It refuses to run unless every repertoire's `generationStatus` is `IDLE`. A tree being built is wiped and only half there; on 2026-10-14 a run during generation made a deck of 15 cards.

AK.03 **The note type.**
`Chess Repertoire`, with four fields:
- `Line`: the moves before the answer, in SAN with move numbers, e.g. `1. e4 c6 2. d4`. The first field, so Anki sorts and checks duplicates by it.
- `Opening`: the opening name at the end of the line.
- `Answer`: the move to play, e.g. `2... d5`.
- `Key`: see AK.04. Not shown on the card.

The front shows the line and the opening; the back adds the answer. So a card can still be reviewed in Anki itself.

AK.04 **The key.**
SHA-1 of the line's UCI history and the answer's UCI, joined by a space: `e2e4 c7c6 d2d4 d7d5`. One key per reply. The script works out the key for each reply and skips any reply whose key is already in Anki. The script looks for the key among all our notes (`note:"Chess Repertoire"`), in any deck, not only in this deck. So a card you moved to another deck still counts as "already there".
- The script skips a reply whose key is already in Anki. Run twice, it adds nothing the second time.
- It is built from the moves alone, not from database ids, so a rebuilt tree gives the same keys.

AK.05 **One way.**
After the deck is made, cards and database rows are not linked. Deleting a card in Anki changes nothing in the database. A change in the database reaches Anki only through a new run of the script, and only as new cards.

AK.06 **A new computer.**
AnkiWeb sync carries the note type and its fields. On any device, the app finds our cards with `note:"Chess Repertoire"`, whatever the deck is called.

AK.07 **Reviews from the web app.**
Anki's own reviewer runs the session; the web app is its screen. `/` trains from Anki.
- The app starts Anki's reviewer on the deck (`guiDeckReview`) and reads the card it shows (`guiCurrentCard`). Anki picks the card, with its learning steps and daily limits.
- A grade goes back with `guiShowAnswer` then `guiAnswerCard`, as if pressed in Anki. 1–4 are Again, Hard, Good, Easy; Enter is Good.
- The deck is found by note type (AK.06): the deck of the first `Chess Repertoire` card. The app does not switch profiles.
- The app asks Anki only when it needs a card, on page load and after each grade, so it always gets Anki's current card. No polling.
- Why not `answerCards`: then the app would pick the order, not Anki, and Anki would log each answer as taking 0s.
- Downside: while you train, Anki's main window stays on its study screen for our deck, out of sight behind the browser. Anki is not frozen: Browse works as usual, and the main window can go elsewhere, but the app switches it back at the next card.
- In the app since 2026-10-14.

AK.09 **The card's timer.**
Anki times each answer from when its own window showed the card. The web page may show it much later, say the next morning. So the app restarts Anki's timer (`guiStartCardTimer`) when the page shows the card; otherwise the log would read Anki's cap ('Maximum answer seconds', 70s here), not the real time.

AK.10 **A card changed in Anki.**
The page and Anki's window can get out of step: a card graded in Anki itself, or in a second tab, moves Anki on while the page still shows the old card. A grade from the page would then grade a card you never saw. So before a grade, the app checks that Anki's current card is the one on the page. If not, it drops the grade and shows Anki's card.

AK.11 **Line details.**
The card has the line, the opening and the answer. The evals (UI.26) and the opening at each ply (UI.04) come from the database: the app finds the node whose SAN line matches, read-only.
- Not found (the tree was rebuilt without that line): the card still works. The opening shows at the end of the line only, and there are no evals.
- This reads the database; it does not link to it (AK.05). Card state stays in Anki.

AK.12 **Status line.**
Left of the board, Anki's counts for the deck: `Black to move · 12 new · 3 learning · 5 due`.

AK.13 **Undo.**
`Ctrl + Z` is Anki's undo (`guiUndo`): the last grade is taken back in Anki and its card comes back. Replaces the local history of [[UN]] on `/`.
- Only grades made on this page are undone. Anki's undo would take back anything, so on the page's first card nothing happens (UN.02).
- Anki's reviewer does not show the undone card until its window has focus. So once the undo is saved, the app restarts the reviewer (`guiDeckReview`); the undone card heads Anki's queue.
- In the app since 2026-10-14.

AK.16 **Waiting for Anki.**
After a grade, Anki says 'done' before it has saved the grade and shown the next card. So the app keeps asking for Anki's current card, every 0.1s for up to 3s, until it is a different card or the deck is finished. If the same card rightly comes back (Again on the last card left), the app takes it once the grade is saved, plus 0.3s.
- Every grade or undo takes about 0.5s. The old card stays on screen meanwhile. A grade or `Ctrl + Z` pressed during that time is ignored.

AK.14 **Errors.**
- Anki not running: "Anki is not running. Start Anki, then reload."
- No `Chess Repertoire` cards in the open profile: "No Chess Repertoire cards in profile [X]. Open profile User test New in Anki, then reload."
- Nothing due: "You're all caught up!", "No more cards due in Anki."

AK.15 **The demo.**
The trainer without Anki moves to `/demo`, unchanged: its own queue, nothing saved.

AK.08 **The test.**
The integration works when:
1. The app gets the next card from Anki.
2. It shows the card's fields correctly.
3. The user grades it in the app.
4. The grade reaches Anki.
5. The card's state in Anki changes exactly as if it had been graded in Anki.
6. Deleting a card in Anki leaves the database unchanged.

Checked 2026-10-14: 1–5. The review log for a grade from the app reads ease 3, a 10-minute step, and 15.1s, as from Anki's own buttons. 6 holds by design: nothing on `/` writes to the database. Not yet tried by deleting a card.
