---
tags:
  - processed
---
# AD — Anki add-on: the `Ctrl + Z` layer

Our own small Anki add-on. Its main job: `Ctrl + Z` from the web page undoes a grade, and only a grade. Why it's needed is in [[AK|AK.13]]: Anki keeps one undo list for everything (grades, edits, moves), and AnkiConnect's `guiUndo` undoes whatever came last, without saying what.

AD.01 **What it is.**
A folder of Python, about 20–40 lines, in Anki's add-on folder (`addons21`). It runs inside Anki, so it can see what AnkiConnect can't.
- The source lives in this repo, in `anki-addon/`, and is copied into `addons21` on each computer. AnkiWeb sync doesn't carry add-ons.
- Built against Anki 25.09.4 and the AnkiConnect installed here.

AD.02 **How the page reaches it.**
The add-on gives AnkiConnect one new action, `chessUndo`. The page calls it like any AnkiConnect action: same port (8765), same request format.
- This works because AnkiConnect looks up each action by name among its own methods when the request comes in (`addons21/2055492159/__init__.py`, `handler`). A method added by another add-on is found the same way.
- The add-on attaches itself once AnkiConnect has loaded.
- AnkiConnect's own file is not edited: an update would overwrite it.

AD.03 **What Anki knows.**
- The next undo step: `col.undo_status().undo`, e.g. "Answer Card" or "Update Note". Empty when there is nothing to undo.
- The name is in Anki's language. So the add-on compares it with Anki's own name for a grade, `tr.actions_answer_card()`, not with the English text. It works in any language.
- The card of the latest grade: the newest row in the review log (`revlog`).

AD.04 **`chessUndo(cardId)`.**
In one step, on Anki's main thread:
1. Read the next undo step and the card of the latest grade.
2. If the step is a grade, of card `cardId`, undo it, and reply `{ undone: true }`.
3. Otherwise undo nothing, and reply `{ undone: false, step: "Update Note" }`, naming the step.
- Check and undo happen in one step, so nothing can slip in between.
- The page passes the card it expects back: the last card it graded ([[AK|AK.13]]).
- The add-on also puts the undone card back on Anki's study screen. Anki redraws that screen only once its window has focus, so the add-on redraws it at once. The page no longer restarts it ([[AK|AK.13]]).
- In the app since 2026-10-14: `anki-addon/chess_repertoire/`, and `ankiUndo` in `app/anki.ts`.

AD.05 **When the next step is not a grade.**
Block: undo nothing. Decided 2026-10-14 (AD.05.01).
1. **Block.** Undo nothing (AD.04 as written). The page says: "Anki's last change was 'Update Note', not a grade, so nothing was undone. To undo it, use `Ctrl + Z` in Anki." Nothing has changed, so the page's list of grades stays in step: once that step is dealt with in Anki, `Ctrl + Z` on the page works again. No reload needed, unlike the no-add-on plan in AK.13.
2. **Native** (not chosen). Undo it anyway, as Anki's own `Ctrl + Z` would. The page says: "'Update Note' undone, not a grade. Edit → Redo in Anki brings it back."
Block is safer: nothing is undone by surprise. Native matches Anki.

==`AD.05.01` //- I'm okay with block, the only thing I see is that, suppose user edited something in browse, now he presses `Ctrl+Z` in the web app. It says the user should settle the Anki first before he can proceed with undo. So a user has no way to undo, he is forced to undo whatever he made in Anki. But native option doesn't solve this either. Again, this is an edge case. Suppose a user edited 10 cards in a row. He would not then be able to go back to previous cards. But that's okay. Block is safer. User can manually change due data if need be. I think this is settled, what to do you think? Block it is. -//==
%%Agreed, block. You're right that neither way lets you jump past the edits: Anki's undo list is one line, and a grade under 10 edits can only be reached by undoing all 10. Native would be worse: it would undo the edits one by one, from the page, without you seeing them. With block, you decide in Anki. Two ways out, both in Anki: undo the edits there, or leave them and fix the card's schedule by hand (Browse → Cards → Set Due Date, or Reset). I've marked AD.05 decided.%%

AD.06 **Tooltips.**
Anki shows "Answer Card undone" after each undo: a small yellow window that floats on top of all others, at the bottom left of Anki's main window, for 3s (`aqt/utils.py`, `tooltip`).
- For undos from the page, the add-on runs the undo itself and shows its own tooltip instead, styled our way (AK.13.01). Anki's tooltip is not shown.
- `Ctrl + Z` in Anki's own window is untouched: Anki's code, Anki's tooltip.
- ~~Only for the page. Anki's other tooltips stay as they are. Decided 2026-10-14.~~ Replaced by AD.12: Anki's tooltips no longer show over the page.
==`AD.06`==
==//- no, only for our web app. does that answer your question? -//==
%%Yes. I've replaced the question with the decision.%%

AD.07 **Without the add-on.**
If `chessUndo` is missing (the add-on isn't installed, or an update broke it), AnkiConnect replies "unsupported action". `Ctrl + Z` on the page then does nothing and says: "Undo needs the Chess Repertoire add-on in Anki." Grading still works: it doesn't need the add-on.

AD.08 **Out of scope.**
Grades still go through AnkiConnect's `guiAnswerCard` ([[AK|AK.07]]). The add-on handles undo from the page and its tooltip (AD.06), nothing else.

==`AD.08.01`==
==//- perhaps? what do you mean? -//==
%%Loose wording: when I wrote it, the tooltip question (AD.06) was still open. It's settled now, so the tooltip for undos from the page is in scope. Reworded.%%

AD.12 **No Anki tooltips over the page.**
An Anki tooltip is a window marked "always on top", so it shows over the browser too. Its place is worked out from Anki's main window; with that window minimised, it can land mid-screen. Anki has no setting to turn tooltips off.
- The add-on replaces Anki's tooltip function (`aqt.utils.tooltip`, which every Anki tooltip goes through) with its own.
- If one of Anki's windows has focus (you're working in Anki, e.g. in Browse), the tooltip shows as usual.
- If not (the browser has focus), the tooltip is dropped.
- A tooltip still showing when Anki loses focus is closed at once. Otherwise one shown in Anki (e.g. "Set due date of 1 card." after Set Due Date in Browse) floats on over the browser for the rest of its 3s: seen 2026-10-14.
- Our own tooltip (AD.06) always shows, at the bottom left of the screen, not of Anki's window.
- Only tooltips. Dialogs (warnings, errors) are left alone: they can be real problems.
- Replacing Anki's function relies on its name and place in Anki's code (AD.09).
- Decided 2026-10-14 (U2.02). In the add-on since 2026-10-14.

AD.11 **Changes Anki can't undo.**
Some changes clear Anki's whole undo list. A note edited through AnkiConnect (`updateNoteFields`) is one: found 2026-10-14. After such a change, the page's grades can no longer be undone, and `Ctrl + Z` on the page says "Anki has nothing to undo." An edit in Browse is not one of them: it's an undo step of its own ("Update Note").

AD.09 **What it relies on.**
- AnkiConnect finding actions by method name (AD.02).
- `col.undo_status()` and `tr.actions_answer_card()` in Anki's Python API (AD.03).
- `aqt.utils.tooltip` in Anki's interface code (AD.12).
- An update of Anki or AnkiConnect can break either. Then AD.07 applies until the add-on is fixed.

AD.10 **The test.**
Checked 2026-10-14: all five. 1 and 5 (before the add-on was loaded: "unsupported action") by me; 2 with a real Browse edit, 3 and 4 by you, by hand. Also checked by you: AD.12, with Set Due Date in Browse, then the browser.
1. Grade A, then B, on the page. `Ctrl + Z`: B comes back, ungraded. `Ctrl + Z`: A comes back.
2. Grade A on the page, fix a typo in Browse, then `Ctrl + Z` on the page: the typo fix stays, and the page says what it found (AD.05).
3. `Ctrl + Z` in Anki's own window: Anki's own tooltip, as before.
4. Undo from the page: our tooltip, not Anki's.
5. Without the add-on: grading works; `Ctrl + Z` gives the AD.07 message.

