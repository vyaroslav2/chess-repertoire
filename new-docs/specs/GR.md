---
tags:
  - processed
---
# GR — Grading

How a card is answered and graded. The same on both pages: `/`, where Anki keeps the grades ([[AK|AK.07]]), and `/demo`, which keeps its own queue ([[AK|AK.15]]). The status light is in [[UI|UI.30]]; undo is in [[UN]] and [[AK|AK.13]].

GR.01 **A card.**
The board shows the position before the opponent's last move; that move then slides in ([[UI|UI.35]]). You answer for the side to move.
- A key pressed while the move slides in only skips the slide; it does nothing else. `Ctrl + Z`, `F` and `E` are not affected.

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
