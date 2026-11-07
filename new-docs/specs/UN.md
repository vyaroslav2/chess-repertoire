---
tags:
  - processed
---
# UN — Undo

`Ctrl + Z` goes back to the previous card, as in Anki. There is no redo: after an undo you go forward by grading again. Board screen styles are in [[UI]].

UN.01 **History.**
A list of steps, empty when the page loads. Each grade adds one step: a snapshot of the session taken just before the grade.
- A snapshot holds the queue (`stats`), the Good counts (`goodHitsByCard`) and the graduated count. That is all a grade changes.
- Each showing of a card is its own step. A card graded Again comes back later in the queue; its two showings are two steps. E.g. the queue is A, B, C and A is graded Again: the cards shown are A, B, C, A. On the second A, `Ctrl + Z` goes back to C.
- Enter on an answered card is Good, so it adds a step too.
- Reloading the page loses the history. True spaced repetition is postponed ([[OV]]), so there is nothing to keep it for.

UN.02 **Undo.**
`Ctrl + Z` takes the last step off the history and puts its snapshot back. The card that was graded comes back and starts afresh: as when first shown (UI.35), its answer not played, evals hidden (UI.34).
- The grade it was given is dropped. The next 1–4 or Enter grades it again and adds a new step.
- Pressed again, it goes back one more card, and so on to the first card of the session.
- On the first card, the history is empty, so nothing happens. No message.
- It works from the end screen ("Demo complete"): the last card comes back.
- In the app since 2026-10-13.

UN.03 **Mid-card.**
Whatever state the current card is in — a move played, a wrong move, the answer revealed, browsing the move list, the opening move still sliding in — `Ctrl + Z` goes straight to the previous card. It never takes back a single move. The current card is not graded and adds no step.

UN.04 **No redo.**
No `Ctrl + Y` or `Ctrl + Shift + Z`. The cards after the one you went back to are reached by grading again, and their new grades replace the old ones.

UN.05 **The key.**
Read by position (`e.code` is `KeyZ`), so it works on any layout, as UI.32. Ctrl must be held; Alt and Shift must not.
- It is checked before any other key, so the key that skips the opening animation does not swallow it.
- `Ctrl + Z` in a text field is left to the field.
- The browser's default is prevented. Outside a text field it does nothing anyway.

UN.06 **The database.** #roadmap
Grades are not saved yet: the trainer runs in demo mode, and `updateSrsStats` is never called. Once grades are saved, undo takes the save back too, as Anki does: the card's FSRS fields go back to what they were before the grade.
