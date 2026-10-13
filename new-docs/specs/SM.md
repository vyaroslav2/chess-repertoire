---
tags:
  - in-progress
---
# SM — Settings Menu

A button on the board screen opens the settings menu. For now it holds actions on the current position; real settings come later. Board screen styles are in [[UI]].

SM.01 **Settings button.**
Opens and closes the menu. Three dots stacked upright, in the top-right corner of the window, 8px in from each edge. No tooltip.
- Copied from Obsidian's "More options" button, but square: a 16px icon in a 28 × 28px box (35 × 35 screen px), 6px of space on each side. Obsidian's box is 28 × 24px. The dots are Lucide's `ellipsis-vertical`, which Obsidian uses.
- Dots: `#b5b1ab`, Obsidian's `#b3b3b3` in the warm tint of UI.20.
- On hover, a box fills behind the dots: `rgb(224 220 214 / 0.075)`, as Obsidian's hover, light at 7.5%. Corners rounded 4px, as Obsidian and most design systems (Bootstrap 4, Tailwind's `rounded`, Fluent 2). The box stays lit while the menu is open.
- The button never takes focus, so Enter still goes to the trainer.
- Test page: `/settings` (UI.29).

SM.06 **Menu.**
Opens under the button, 4px below it, right edges level, as Obsidian's menus. A click outside, Escape or choosing an item closes it.
- Panel: `#262421`, 1px border `#363431`, corners rounded 1px, no shadow, 6px padding. At least 180px wide. These are Lichess's panel and border colours, which are Obsidian's `#262626` and `#363636` in the warm tint.
- Items: Inter 14px, line height 20px, padding 4px 8px, `#dad6d0` (Obsidian's `#dadada`, warm). Square corners, the same hover colour as the button. A 16px Lucide icon, 8px before the text, in the dots' colour.
- The line is the move list without a wrong move: before the answer, it ends at the opponent's move; after it, it includes the answer.

## Actions

SM.02 **Open on Lichess.**
Opens the line on Lichess's analysis board, in a new tab, at the position on the board, from the board's side. Icon: `external-link`.
- URL: `https://lichess.org/analysis/pgn/<PGN>?color=<white|black>#<ply>`, with the PGN as in SM.03, URL-encoded. Lichess loads the whole line, so its move list shows what came after too. Checked on 2026-10-13.
- With no moves: `https://lichess.org/analysis?color=…`.

SM.03 **Copy PGN.**
Copies the whole line to the clipboard, whatever the position on the board, e.g. `1. d4 d5 2. Bf4 c5`. Moves only: no headers, no result. Icon: `copy`.

SM.04 **Copy FEN.**
Copies the FEN of the position on the board to the clipboard. Icon: `copy`.

SM.07 **Copied message.**
After a copy, the menu closes and `PGN copied` or `FEN copied` shows where the menu was: 4px under the button, right edges level. In the menu's style: panel colour, border and 1px corners, text as the items, padding 4px 8px. It stays 2s, fades over 0.45s, then goes. Opening the menu hides it. Shown only if the copy worked.

## Later

SM.05 **Settings to add.** #roadmap
- Board.
- Piece set.
- Animation speed.
