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
- During the intro, `1`–`4` and other keys do nothing, and the intro plays on. `Ctrl + Z`, `F`, `E` and `X` (GR.07) work as always.
- During the slide of the answer, `1`–`4` or `Enter` grade at once; the next card cuts the slide short.
- Why `Enter` acts during the intro: one press shows the answer, with no waiting for a slide you've seen before, and `Enter`, `Enter` passes over a card quickly.
- The 500ms wait is Lichess's: its puzzles play the first move 500ms after loading, or at once with animation off (`ui/puzzle/src/ctrl.ts`).
- Since 2026-10-14. Before, any key in the wait only skipped it, `Enter` included, and the board took moves during the slide.
- #note To watch in use: whether `Enter`, `Enter` reveals answers too soon.

GR.02 **Playing the answer.**
Play a move on the board.
- The right move stays on the board. The card is answered; the light turns green, unless it's already red or amber (GR.06).
- A wrong move shows for 300ms, as on Lichess (`revertUserMove` in lila's puzzle `ctrl.ts`), then goes back; the light turns red. You can try again, as often as you like.
- A pawn reaching the last rank becomes a queen.

**Was:** a wrong move showed for 250ms, until 2026-10-22.

GR.03 **Revealing the answer.**
`Enter`, before the right move is played, plays the answer on the board for you. The light turns amber. It works after a wrong move too.

GR.04 **Grading.**
`1`–`4` are Again, Hard, Good, Easy. `Enter` on an answered card is Good. So `Enter`, `Enter` reveals the answer, then grades it Good.
- `1` works at any of your moves in a line, even before the first, once the intro (GR.01) has ended. It grades Again at once and goes on to the next card; the rest of the line is skipped. So a mistake early in a line needn't be played out to the end.
- Holding `1` down grades one card, not the next ones too.
- `2`–`4` work at the line's end (GR.06), once a move has been played, right or wrong, or the answer revealed. Before that, they do nothing.
- **Was:** until 2026-10-23, `1` worked only as `2`–`4` do.
- After a wrong move, `1`–`4` grade at once, without the answer being shown. As in Anki, a wrong answer can be graded straight away. `Enter` after a wrong move reveals the answer; it does not grade.
- The mouse can play the move, but there are no grade buttons.

GR.05 **What a grade does.**
- On `/`: the grade goes to Anki, and Anki picks the next card ([[AK|AK.07]]).
- On `/demo`: Easy, or a second Good, takes the card out of the session. Any other grade sends it to the back of the queue; Again also clears its Good count. Nothing is saved.

Checked in the app 2026-10-14, on `/demo`: GR.01 (`1` mid-slide does nothing; `Enter` mid-slide and in the wait reveals; the opponent's piece landing at once, watched by you with a 2s slide), GR.02 (wrong move red and back, right move green), GR.03 (also after a wrong move), GR.04 (`1` before a move does nothing; `Enter`, `Enter`; `3`; `2` straight after a wrong move), GR.05 (Easy out of the session, Hard to the back). Not checked: promotion, a second Good, Again clearing the Good count.


GR.06 **Whole lines.**
A card is a whole line: you play each of your moves in turn. The status light ([[UI|UI.30]]) shows how the line has gone so far, not only the last move.
- No light until your first move in the line.
- A right move turns it green.
- A wrong move turns it red; a reveal turns it amber. The latest of these wins.
- Once red or amber, it can't go back to green, except by clearing marks with `X` (GR.07).
- It stays through the opponent's replies, and goes off at the next card: after a grade or `Ctrl + Z`.
- `2`–`4` and `Enter` grade at the line's end whatever the light shows; `1` at any move (GR.04). A misclick turns it red, but you can still grade Good, or clear it with `X`.
- In the app since 2026-10-22: `lineStatus` in `components/SrsTrainer.tsx`. Before, the light showed only the move being asked, so mid-line green and amber went off at once. Since 2026-10-23, worked out from the marks (GR.07).

Checked in the app 2026-10-22, on `/demo`: no light before the first move; right move green, kept through the reply; wrong move red; right move after it still red; reveal amber; right last move still amber; off after a grade and after `Ctrl + Z`; a wrong move then `Enter` on the same move gives amber. Not checked on `/`, but it's the same code.

GR.07 **Clearing a mark.**
A misclick turns the light red. `X` takes it back.
- A wrong move tints its move number red in the move list; a reveal tints it amber ([[UI|UI.36]]). Right moves are not marked.
- One mark per move. A wrong move then a reveal on the same move leaves amber, as on the light (GR.06).
- The light shows the latest mark left. With none, it's green once one of your moves is on the board, and off before that.
- `X` undoes the latest reveal or wrong move, one mistake row per press ([[UI|UI.37]]). A move's mark stays red while it has a row left; the last row takes the red with it. The light updates to match.
- Press again to undo the one before it. Each press changes a row or a number you can see, so you know what it did.
- **Was:** until 2026-10-23, one press cleared a move's whole mark, however many wrong moves it had.
- No marks: nothing happens. Holding `X` down clears one.
- A plain key, read as `e.key`, like `E` and `F` ([[UI|UI.34]]). With Ctrl, Alt or Meta held it does nothing, so `Ctrl + X` stays the browser's.
- Why `X`: your right hand is on the mouse, and `1`–`4`, `E`, `F` and `S` are under the left. `X` is there too, on the bottom row, away from `1`–`4`, so a slip can't cost a grade.
- Why marks, not a one-step undo of the light: a second red on a red light changes nothing you can see. An undo of it would leave you unsure which mistake it took back.
- In the app since 2026-10-23: `marks` in `components/SrsTrainer.tsx`, by ply.

Checked in the app 2026-10-23, on `/demo`, a Black line: wrong move, number 1 red, light red; `X`, number plain, light off; wrong then `Enter`, number 1 amber; wrong on the next move, number 2 red, light red; `X`, 2 plain, light amber; `X`, 1 plain, light green; `X` with no marks, nothing. Not checked: a White line, where a wrong move's row has only its number until the right move is played.