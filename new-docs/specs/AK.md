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

AK.03 **The note type.**
`Chess Repertoire`, with four fields:
- `Line`: the moves before the answer, in SAN with move numbers, e.g. `1. e4 c6 2. d4`. The first field, so Anki sorts and checks duplicates by it.
- `Opening`: the opening name at the end of the line.
- `Answer`: the move to play, e.g. `2... d5`.
- `Key`: see AK.04. Not shown on the card.

The front shows the line and the opening; the back adds the answer. So a card can still be reviewed in Anki itself.

AK.04 **The key.**
SHA-1 of the line's UCI history and the answer's UCI, joined by a space: `e2e4 c7c6 d2d4 d7d5`. It says "this card is ours" and which reply it is.
- The script skips a reply whose key is already in Anki. Run twice, it adds nothing the second time.
- It is built from the moves alone, not from database ids, so a rebuilt tree gives the same keys.

AK.05 **One way.**
After the deck is made, cards and database rows are not linked. Deleting a card in Anki changes nothing in the database. A change in the database reaches Anki only through a new run of the script, and only as new cards.

AK.06 **A new computer.**
AnkiWeb sync carries the note type and its fields. On any device, the app finds our cards with `note:"Chess Repertoire"`, whatever the deck is called.

AK.07 **Reviews from the web app.** #roadmap
The app asks AnkiConnect for the next due card in the deck, shows it, and sends the grade back with `answerCards`. It asks afresh on each page load and each next card. ==🟠If that proves awkward, it syncs every 30s instead.==

AK.08 **The test.** #roadmap
The integration works when:
1. The app gets the next card from Anki.
2. It shows the card's fields correctly.
3. The user grades it in the app.
4. The grade reaches Anki.
5. The card's state in Anki changes exactly as if it had been graded in Anki.
6. Deleting a card in Anki leaves the database unchanged.
