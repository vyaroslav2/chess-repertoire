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

- Made by `scripts/anki_export.ts`. It reads the database and writes nothing to it.
- It refuses to run unless every repertoire's `generationStatus` is `IDLE`. A tree being built is wiped and only half there; on 2026-10-14 a run during generation made a deck of 15 cards.
- A one-off for testing during a run: `npx tsx scripts/anki_export.ts --limit 10 --while-generating`. `--limit` sets the number of cards (20 if left out); `--while-generating` skips the check above. The cards are correct, but they are the top 10 of the tree built so far, not the real top 10. 

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
- The app opens Anki's study screen on the deck (`guiDeckReview`) and shows the card Anki shows there (`guiCurrentCard`). Anki picks the card, with its learning steps and daily limits.
- Cards are answered and graded as in [[GR]]. ==🔵Each grade goes to Anki with `guiShowAnswer` then `guiAnswerCard`, as if pressed in Anki.==
- The deck is found by note type (AK.06): the deck of the first `Chess Repertoire` card. The app does not switch profiles.
==`AK.07.02` //- #roadmap multi decks support. -//==
- The app asks Anki only when it needs a card: on page load and after each grade. No polling.
- Why not `answerCards`: the app would pick the order, not Anki, and Anki would log each answer as taking 0s.
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
==AK.12.01 //- #roadmap  polish the status line -//==

AK.13 **Undo.**
`Ctrl + Z` takes back the last grade made on the page, through our Anki add-on ([[AD]]), and only if that grade is Anki's next undo step. Its card comes back. Replaces the local history of [[UN]] on `/`.
- Only grades made on this page are undone. On the page's first card nothing happens (UN.02).




==`AK.13.12`== 
==//- the problem is that I don't want to alter native Anki tooltip, I only want to alter it when our web app is up and running. perhaps we can switch it on/off depending whether we use our app or not. hopefully -//==
%%Yes, and it can be even narrower than on/off. The page wouldn't use AnkiConnect's `guiUndo` any more, but our own action, say `chessUndo`. That action runs Anki's undo itself, without Anki's tooltip, and shows our own instead. So only undos asked for by the page get our tooltip. `Ctrl + Z` in Anki's own window still goes through Anki's code, with its native tooltip, whether the page is open or not.
That's better than a switch: there's no state to forget. A switch left on after you close the page would keep changing Anki's tooltips. Per call, nothing needs turning off.
Our tooltip is a small window of our own, so we can style it as we like. Like Anki's, it floats on top of the browser.%%


==`AK.13.13`== 
==//- I wanted to polish Anki's tooltips anyway, I wouldn't leave them as it is. it seems the addon is unavoidable. if so, we are close to make the decision on this -- we will write our our addon. and we'll decide the logic later, either stick to anki's native behaviour or to block ctrl+z if it is not answer undo. we'll figure out what's better/simpler later. am I right in my deduction? we need to figure out no addon or addon before we can proceed -//== 
%%Yes, your deduction is right, with one note.
- Right: nothing outside Anki can change Anki's tooltips. If you want to polish them, an add-on is unavoidable.
- Right: add-on or not comes first. The undo logic depends on it. With the add-on, "check before undoing" becomes possible. Without it, the page can only notice a wrong undo after it has happened, and block.
- Right: the undo logic can wait. Once the add-on exists, either logic is a few lines.
The note: "polish Anki's tooltips" can mean two things.
1. Only the tooltips the page causes: a grade or an undo from the page (AK.13.12). Easy, and Anki stays native otherwise.
2. All Anki's tooltips, also when you use Anki on its own. Also possible, but that's changing Anki itself, not just our link to it. It works by replacing Anki's tooltip code at start-up, and an Anki update could break it.
Which one you mean decides how deep the add-on goes. Either way, the decision we need now is "add-on: yes". The rest can follow.%%

























































%%
"Send `Ctrl + Z` only once before Anki replies" is already the case: further presses are ignored while Anki works (AK.16).
Suggested text for AK.13:
"- If an undo doesn't take back the expected grade (the card's review count doesn't go down), Anki has undone some other change, e.g. an edit made in Browse. The page then shows: 'Anki's last change was not a grade, so Anki undid that instead. To get it back, use Edit → Redo in Anki. Undo here is off until you reload the page.' From then on, `Ctrl + Z` does nothing until the page is reloaded.
- Why not an add-on that checks first: this is an edge case, and Anki's own `Ctrl + Z` behaves the same way. The block keeps it to one wrong undo, and Anki's redo puts it right."
%%

- After an undo, Anki's study screen doesn't redraw until you click on Anki's window. The add-on redraws it at once, so the undone card is back on screen ([[AD|AD.04]]).
- In the app since 2026-10-14.

==`AK.13.01` //- #roadmap polish undo tooltip -//==

AK.16 **Waiting for Anki.**
After a grade, Anki says 'done' before it has saved the grade and shown the next card. So the app keeps asking for Anki's current card, every 0.1s for up to 3s, until it is a different card or the deck is finished. If the same card rightly comes back (Again on the last card left), the app takes it once the grade is saved, plus 0.3s.
- Every grade or undo takes about 0.5s. The old card stays on screen meanwhile. A grade or `Ctrl + Z` pressed during that time is ignored.
==`AK.16.01` //- #roadmap robust oprimisation -//==

AK.14 **Errors.**
- Anki not running: "Anki is not running. Start Anki, then reload."
- No `Chess Repertoire` cards in the open profile: "No Chess Repertoire cards in profile [X]. Open profile User test New in Anki, then reload."
- Nothing due: "You're all caught up!", "No more cards due in Anki."
==`AK.14.01` //- #roadmap polish messages -//==

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
