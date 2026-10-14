---
tags:
  - processed
---
# GR — Grading

How a card is answered and graded. The same on both pages: `/`, where Anki keeps the grades ([[AK|AK.07]]), and `/demo`, which keeps its own queue ([[AK|AK.15]]). The status light is in [[UI|UI.30]]; undo is in [[UN]] and [[AK|AK.13]].

GR.01 **A card.**
The board shows the position before the opponent's last move. After a 500ms wait, that move slides in ([[UI|UI.35]]). You answer for the side to move.
- The wait and the slide are the intro. The board takes moves only once it has ended.
- During the intro, only `Enter` acts: it ends the intro and reveals the answer (GR.03). Mid-slide, the opponent's piece lands at once and the answer slides in. In the wait, the answer just appears.
- During the intro, `1`–`4` and other keys do nothing, and the intro plays on. `Ctrl + Z`, `F` and `E` work as always.
- During the slide of the answer, `1`–`4` or `Enter` grade at once; the next card cuts the slide short.
- Why `Enter` acts during the intro: one press shows the answer, with no waiting for a slide you've seen before, and `Enter`, `Enter` passes over a card quickly.
- The 500ms wait is Lichess's: its puzzles play the first move 500ms after loading, or at once with animation off (`ui/puzzle/src/ctrl.ts`).
- Since 2026-10-14. Before, any key in the wait only skipped it, `Enter` included, and the board took moves during the slide.
- #note To watch in use: whether `Enter`, `Enter` reveals answers too soon.

GR.02 **Playing the answer.**
Play a move on the board.
- The right move stays on the board. The card is answered; the light turns green.
- A wrong move shows for 250ms, then goes back; the light turns red. You can try again, as often as you like.
- A pawn reaching the last rank becomes a queen.

GR.03 **Revealing the answer.**
`Enter`, before the right move is played, plays the answer on the board for you. The light turns amber. It works after a wrong move too.

GR.04 **Grading.**
`1`–`4` are Again, Hard, Good, Easy. `Enter` on an answered card is Good. So `Enter`, `Enter` reveals the answer, then grades it Good.
- `1`–`4` work once a move has been played, right or wrong, or the answer revealed. Before that, they do nothing, so a card can't be graded before you've tried it.
- After a wrong move, `1`–`4` grade at once, without the answer being shown. As in Anki, a wrong answer can be graded straight away. `Enter` after a wrong move reveals the answer; it does not grade.
- The mouse can play the move, but there are no grade buttons.

GR.05 **What a grade does.**
- On `/`: the grade goes to Anki, and Anki picks the next card ([[AK|AK.07]]).
- On `/demo`: Easy, or a second Good, takes the card out of the session. Any other grade sends it to the back of the queue; Again also clears its Good count. Nothing is saved.

Checked in the app 2026-10-14, on `/demo`: GR.01 (`1` mid-slide does nothing; `Enter` mid-slide and in the wait reveals; the opponent's piece landing at once, watched by you with a 2s slide), GR.02 (wrong move red and back, right move green), GR.03 (also after a wrong move), GR.04 (`1` before a move does nothing; `Enter`, `Enter`; `3`; `2` straight after a wrong move), GR.05 (Easy out of the session, Hard to the back). Not checked: promotion, a second Good, Again clearing the Good count.
