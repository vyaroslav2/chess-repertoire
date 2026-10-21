---
tags:
  - reviewed
---
# AD — Anki add-on: Anki's messages on the page

Our own small Anki add-on. Its job: show Anki's messages on the web page, in the page's style, instead of over the browser. It decides nothing. `Ctrl + Z` from the page is Anki's own undo ([[AK|AK.13]]). So if something goes wrong, it's Anki's or AnkiConnect's behaviour, not the add-on's. Rewritten 2026-10-22. In the app since 2026-10-22: `anki-addon/chess_repertoire/`, and `ankiUndo` in `app/anki.ts`.

AD.01 **What it is.**
A folder of Python, about 20–40 lines, in Anki's add-on folder (`addons21`). It runs inside Anki, so it can see what AnkiConnect can't: Anki's tooltips.
- The source lives in this repo, in `anki-addon/`, and is copied into `addons21` on each computer. AnkiWeb sync doesn't carry add-ons.
- Built against Anki 25.09.4 and the AnkiConnect installed here.

AD.02 **How the page reaches it.**
The add-on gives AnkiConnect one new action, `chessMessages`. The page calls it like any AnkiConnect action: same port (8765), same request format.
- This works because AnkiConnect looks up each action by name among its own methods when the request comes in (`addons21/2055492159/__init__.py`, `handler`). A method added by another add-on is found the same way.
- The add-on attaches itself once AnkiConnect has loaded.
- AnkiConnect's own file is not edited: an update would overwrite it.

AD.13 **Native undo.**
`Ctrl + Z` on the page does exactly what `Ctrl + Z` in Anki's window does: it undoes Anki's next undo step, whatever it is.
- The page sends AnkiConnect's `guiUndo`. AnkiConnect calls Anki's own undo (`mw.undo()`), the same code as Anki's Edit → Undo.
- The add-on doesn't run the undo, check it or block it.
- So any step can be undone from the page: a grade, a Browse edit, a Set Due Date, a reset. Anki's Edit → Redo (`Ctrl + Shift + Z` in Anki's window) brings it back.
- The page keeps no list of its own grades ([[AK|AK.13]]). `Ctrl + Z` works even before you've graded anything on the page, as in Anki.
- `guiUndo` returns `true` at once, before the undo has run, and whether there was anything to undo or not. What happened is known only from Anki's message (AD.14).

AD.12 **Where Anki's tooltips show.**
An Anki tooltip is a window marked "always on top", so it shows over the browser too. Its place is worked out from Anki's main window; with that window minimised, it can land mid-screen. Anki has no setting to turn tooltips off.
- The add-on replaces Anki's tooltip function (`aqt.utils.tooltip`, which every Anki tooltip goes through) with its own.
- Other add-ons may have replaced it first: `anki-power-suite` does, to log tooltips. Modules imported earlier keep their own copy (Anki's undo, `aqt/operations/collection.py`, keeps Anki's original). So the add-on wraps every copy it finds, and each wrapper still calls the function it replaced. Found 2026-10-22: wrapping only one copy missed undo's tooltip.
- If one of Anki's windows has focus (you're working in Anki, e.g. in Browse), the tooltip shows in Anki, as usual.
- If not (the browser has focus), it doesn't show in Anki. It goes to the page instead (AD.14).
- A tooltip still showing when Anki loses focus is closed at once. Otherwise one shown in Anki (e.g. "Set due date of 1 card." after Set Due Date in Browse) floats on over the browser for the rest of its 3s: seen 2026-10-14.
- Only tooltips. Dialogs (warnings, errors) stay in Anki: they can be real problems.
- `Ctrl + Z` in Anki's own window is untouched: Anki's code, Anki's tooltip, in Anki.

AD.14 **Anki's messages on the page.**
- Anki doesn't reply with its message: `guiUndo` returns at once, and the message appears later as a tooltip inside Anki. So the add-on's tooltip function (AD.12) keeps the latest tooltip's text until the page asks for it. A new tooltip replaces it.
- `chessMessages()` returns that text, or nothing, and empties it. It changes nothing else in Anki.
- On `Ctrl + Z`, the page first empties it, then sends `guiUndo`, then asks every 0.1s until a text comes, for up to 3s (as [[AK|AK.16]]).
- Every tooltip, not only undo's: Anki's text as it is, in Anki's language. One exception: AD.15.
- Anki puts invisible marks (U+2068, U+2069) round the step's name, e.g. "⁨Answer Card⁩ undone". The page drops them.
- Nothing to undo: Anki shows no message, so the page shows none either. `Ctrl + Z` simply does nothing, as in Anki.
- An undo that fails with an error: Anki shows a warning dialog, in Anki. The page shows nothing.
- Not decided: whether the page also asks between its own actions (e.g. every 1s), to catch tooltips from other sources while the browser is in front. For now, only after `Ctrl + Z`.

AD.15 **"Answer undone".**
Anki's "Answer Card undone" shows on the page as "Answer undone" ([[MS|MS.01]]). Every other message stays as Anki wrote it.
- It's the message you'll see most, so it gets the polished text.
- The add-on marks it: it compares the text with Anki's own, `tr.undo_action_undone(action=tr.actions_answer_card())`, not with the English words. So it works in any language.

AD.16 **The card comes back.**
After an undo, Anki's study screen redraws only once its window has focus ([[AK|AK.16]]). So the page restarts it on the deck itself, through AnkiConnect (`guiDeckReview`), then shows Anki's current card, whatever it is.
- The page restarts it once Anki's message has come (the undo is done), or after the 3s wait if none comes.
- If the undo wasn't a grade, the card on screen may well stay the same.

AD.11 **Changes Anki can't undo.**
Some changes clear Anki's whole undo list. A note edited through AnkiConnect (`updateNoteFields`) is one: found 2026-10-14. After such a change, `Ctrl + Z`, on the page or in Anki, does nothing until there is something new to undo. An edit in Browse is not one of them: it's an undo step of its own ("Update Note").

AD.17 **Without the add-on.**
`Ctrl + Z` still works: `guiUndo` is AnkiConnect's own. Only the message is missing: AnkiConnect replies "unsupported action" to `chessMessages`, and the page shows nothing. Anki's tooltips show over the browser again. Grading works too.

AD.08 **Out of scope.**
Grades go through AnkiConnect's `guiAnswerCard`, undo through its `guiUndo` ([[AK|AK.07]], [[AK|AK.13]]). The add-on runs, checks and blocks nothing. It only moves tooltips (AD.12) and passes their texts on (AD.14).

AD.09 **What it relies on.**
- AnkiConnect finding actions by method name (AD.02).
- `aqt.utils.tooltip` in Anki's interface code (AD.12).
- `tr.undo_action_undone` and `tr.actions_answer_card` in Anki's Python API (AD.15).
- AnkiConnect's `guiUndo` calling `mw.undo()` (AD.13).
- An update of Anki or AnkiConnect can break any of them. Then AD.17 applies until the add-on is fixed.

AD.18 **The test.**
Checked 2026-10-22: 1, 2 and 5. 2 with a reset in Browse, not a typo fix: the page said "Reset Card undone". 5 by the messages of 1 and 2, the browser in front. Not yet: 3 (Anki's undo list wasn't empty), 4 and 6. Through our server code, an undo takes 0.3s; through the page in dev mode, 0.4s, or about 4s the first time while the server compiles.
1. Grade A, then B, on the page. `Ctrl + Z`: B comes back, ungraded, and the page says "Answer undone". `Ctrl + Z`: A comes back.
2. Grade A on the page, fix a typo in Browse, then `Ctrl + Z` on the page: the typo fix is undone, and the page says "Update Note undone". `Ctrl + Shift + Z` in Anki brings it back.
3. `Ctrl + Z` on the page with nothing to undo: nothing happens, no message.
4. `Ctrl + Z` in Anki's own window: Anki's own tooltip, in Anki, as before.
5. Anki's tooltip while the browser has focus: none in Anki, the message on the page.
6. Without the add-on: grading and `Ctrl + Z` work; no message.
