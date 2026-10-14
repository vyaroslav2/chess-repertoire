---
tags:
  - in-progress
---
# SM — Settings Menu

A button on the board screen opens the settings menu. It holds actions on the current position, then the board and the piece set. Board screen styles are in [[UI]].

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
After a copy, the menu closes and `PGN copied` or `FEN copied` shows ([[MS|MS.02]]). Shown only if the copy worked.

## Board and pieces

Both from Lichess, 2D only, in Lichess's order. The files are in `public/board` and `public/piece`, copied from [lila](https://github.com/lichess-org/lila) on 2026-10-13; licences in `public/piece/COPYING.md`. Some sets are for personal, non-commercial use only.

SM.08 **Board.**
Under the actions, after a line (`#363431`, edge to edge, 6px above and below, as Obsidian's). Icon: `grid-3x3`, with `chevron-right` at the right edge. A click shows Lichess's 25 2D boards in the menu's place, as Lichess's own menu does.
- Top row: `chevron-left` and `Board`, in the items' style. It goes back to the menu. A line under it.
- The panel is 222px wide inside, Lichess's width. Three boards to a row, each a 64 × 32 thumbnail (two squares) in a 40px high button. Newspaper has no thumbnail: its top two squares, from the SVG.
- As Lichess: on hover the button brightens 5% and the thumbnail grows 5%; the current board sits on green, `#629924`. The name shows as a tooltip.
- A click changes the board at once and keeps the list open, to compare. Escape or a click outside closes the menu.
- The outer edge of UI.17 is newspaper's only: other boards have no lines between squares.
- Default: newspaper.

SM.09 **Piece set.**
Under Board. Icon: `crown`, with `chevron-right`. As SM.08, but Lichess's 42 2D sets, four to a row, each shown by its white knight in a square button. As Lichess: hover `rgb(250 250 250 / 0.15)`, the current set on `rgb(191 128 29 / 0.7)`, Lichess's orange.
- Default: merida.

SM.10 **Kept.**
Both choices are kept in localStorage (`board`, `piece-set`). A script in `<head>` applies them before the first paint, so the defaults never flash. As Lichess, the board and the pieces are CSS variables on `<html>`: `--board`, `--piece-wP` … `--piece-bK`.

## Later

SM.05 **Settings to add.** #roadmap
- Animation speed.
- Horsey board's own highlights: on Lichess it has its own last-move, selected and move-dest images. Here it uses the same highlights as every board.
