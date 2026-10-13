---
tags:
  - in-progress
---
# SM — Settings Menu

A button on the board screen opens the settings menu. For now it holds actions on the current position; real settings come later. Board screen styles are in [[UI]].

SM.01 **Settings button.**
Opens and closes the menu. Three dots stacked upright, in the top-right corner of the window, 16px in from each edge. No tooltip.
- Copied from Obsidian's "More options" button, but square: a 16px icon in a 28 × 28px box (35 × 35 screen px), 6px of space on each side. Obsidian's box is 28 × 24px. The dots are Lucide's `ellipsis-vertical`, which Obsidian uses.
- Dots: `#b5b1ab`, Obsidian's `#b3b3b3` in the warm tint of UI.20.
- On hover, a box fills behind the dots: `rgb(224 220 214 / 0.075)`, as Obsidian's hover, light at 7.5%. Corners rounded 4px, as Obsidian; to be tuned on the test page.
- Does nothing yet: the menu is not built.
- Test page: `/settings` (UI.29).

## Actions

SM.02 **Open on Lichess.**
Opens the current position on Lichess.

SM.03 **Copy PGN.**
Copies the PGN to the clipboard.

SM.04 **Copy FEN.**
Copies the current position's FEN to the clipboard.

## Later

SM.05 **Settings to add.** #roadmap
- Board.
- Piece set.
- Animation speed.
