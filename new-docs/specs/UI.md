---
tags:
  - in-progress
---
# UI — Board Screen

UI describes how the board screen looks and behaves.

UI.01 The chessboard is centred horizontally on the page.
UI.02 The move list stays attached to the right edge of the board, at its current size. It does not count towards centring, so only the board is centred. Nothing else moves, except the opening name (UI.04).

UI.04 The opening name above the board is as wide as the board and lines up with its left edge. A name too long for that width ends in an ellipsis.

## Fonts, sizes and colours

These are the values in use now. Colours name their CSS variable where there is one (`app/globals.css`).

UI.05 Fonts. Only JetBrains Mono is loaded by the app (Google Fonts). Inter comes first in every stack but is not loaded, so it shows only where it is installed. On this Windows machine it is not, so text falls back to Segoe UI (body stack) or Arial (move numbers, coordinates). #note
UI.06 Page background: `#161512` (`--lichess-bg`).
UI.07 Status line above the board: 16px, normal weight, `#787674` (`--lichess-text-muted`). It is hidden until the pointer is over it.
UI.08 Opening name: 14px, line height 20px, `#787674` (`--lichess-text-muted`).
UI.09 Board: 560 × 560px, Lichess "newspaper" squares, Lichess "merida" pieces. No shadow: `--glass-shadow` is commented out.
UI.10 Board highlights (Chessground "brown" theme): last move `rgba(155, 199, 0, 0.41)`; selected square `rgba(20, 85, 30, 0.5)`; legal-move dot `#208530`; check is a red glow.
UI.11 Coordinates: 13px, weight 500, lower case, `#787674` (`--lichess-text-muted`). Ranks on the left, files at the bottom.
UI.12 Move list panel: 188 × 560px, background `#262421` (`--lichess-panel-bg`). Scrollbar 8px wide, thumb `#555` (`#777` on hover), track `#262421`.
UI.13 Move numbers: 14.5px, line height 26px, `#787674` (`--lichess-text-muted`).
UI.14 Moves: JetBrains Mono, 14.5px, line height 26px, `#bababa` (`--lichess-text-primary`). Hover background `#363431`. The current move: background `#3692e7` (`--lichess-accent`), text `#ffffff` (`--lichess-text-bright`), weight 600.
UI.15 Answer bar (bottom-left corner, 250 × 25px, border `#363431`): wrong `#c62828`, correct `#629924` (`--lichess-green`), revealed `#f9a825`.
UI.16 End screen: heading 32px, `#629924` (`--lichess-green`); text below it 17.6px, `#787674` (`--lichess-text-muted`).
UI.17 The board's border is uneven. It is not a CSS border: it comes from the square outlines in Lichess's `newspaper.svg` (`#939393`, about 0.84px), and the outer half of each edge outline is cut off. At 100% display scale the left and top edges show a 1px line, the right and bottom show none, and the lines between squares are 1px. At 125% all four edges show a 1px line, but the lines between squares are 1 or 2px, unevenly. Measured in Edge; Firefox not checked. Should the app draw its own 1px `#939393` border on all four sides? #question


---

No. The `--lichess-` names are this project's own. I opened lichess.org (dark theme) and read its CSS: no variable there starts with `--lichess`. Lichess names its colours `--c-…`.

Most of the colour values do come from Lichess:

|This project|Value|Lichess name|Lichess value|
|---|---|---|---|
|`--lichess-bg`|`#161512`|`--c-bg-page`|same|
|`--lichess-panel-bg`|`#262421`|`--c-bg-box`|same|
|`--lichess-text-primary`|`#bababa`|`--c-font`|same|
|`--lichess-green`|`#629924`|`--c-good`|same|
|`--lichess-accent`|`#3692e7`|`--c-primary`|same|
|`--lichess-text-muted`|`#787674`|`--c-font-dim`|`#949494`, different|
|`--lichess-border`|`#363431`|`--c-border`|`#404040`, different|

So the muted text and the border are not Lichess's colours, even though their names suggest they are. I didn't check the other variables.