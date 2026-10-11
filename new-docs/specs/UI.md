---
tags:
  - in-progress
---
# UI — Board Screen

UI describes how the board screen looks and behaves.

UI.01 The chessboard is centred on the page, across and down.
UI.02 The move list stays attached to the right edge of the board. It is 188px wide and as tall as the board. It does not count towards centring, so only the board is centred. Nothing else moves, except the opening name (UI.04).

UI.04 The opening name above the board is as wide as the board and lines up with its left edge. A name too long for that width ends in an ellipsis.

## Fonts, sizes and colours

These are the values in use now. Colours name their CSS variable where there is one (`app/globals.css`).

UI.05 Fonts. Inter for all text except moves, which use Roboto (UI.14), and coordinates, which use Arial (UI.11). Inter and Roboto are self-hosted with `next/font/google` (`app/layout.tsx`), so they show on every machine and the browser never contacts Google. #note
UI.06 Page background: `#161512` (`--lichess-bg`).
UI.07 Status line, in the free space left of the board: 16px, normal weight, `#787674` (`--lichess-text-muted`), 280px wide, right-aligned, 40px left of the board, level with its top. It is hidden until the pointer is over it. Temporary.
UI.08 Opening name: 14px, line height 20px, letter spacing -0.0062em (-0.087px), `#979490` (`--opening-text`), 6.05 : 1 on the page background. The spacing is Inter's recommended value for 14px.
UI.09 Board: 691.2 × 691.2px (UI.18), Lichess "newspaper" squares, Lichess "merida" pieces. No shadow: `--glass-shadow` is commented out.
UI.10 Board highlights (Chessground "brown" theme): last move `rgba(155, 199, 0, 0.41)`; selected square `rgba(20, 85, 30, 0.5)`; legal-move dot `#208530`; check is a red glow.
UI.11 Coordinates: Arial, 13px, weight 400, lower case, `#817e7a` (`--coord-text`), 4.52 : 1 on the page background: the same warm tint as the opening name, dimmer. Ranks on the left, files at the bottom. Where Arial is not installed (Linux, Android), Arimo stands in: it has Arial's letter widths, is self-hosted and is not preloaded, so only those machines download it.
UI.12 Move list panel: 188 × 691.2px, background `#262421` (`--lichess-panel-bg`). Scrollbar 8px wide, thumb `#555` (`#777` on hover), track `#262421`.
UI.13 Move numbers: 14.5px, line height 26px, `#787674` (`--lichess-text-muted`).
UI.14 Moves: Roboto, 14.5px, line height 26px, `#bababa` (`--lichess-text-primary`). Hover background `#363431`. The current move: background `#3692e7` (`--lichess-accent`), text `#ffffff` (`--lichess-text-bright`), weight 600.
UI.15 Answer bar (bottom-left corner, 250 × 25px, border `#363431`): wrong `#c62828`, correct `#629924` (`--lichess-green`), revealed `#f9a825`.
UI.16 End screen: heading 32px, `#629924` (`--lichess-green`); text below it 17.6px, `#787674` (`--lichess-text-muted`).
UI.17 The board's border is uneven. It is not a CSS border: it comes from the square outlines in Lichess's `newspaper.svg` (`#939393`, about 0.84px), and the outer half of each edge outline is cut off. At 100% display scale the left and top edges show a 1px line, the right and bottom show none, and the lines between squares are 1px. At 125% all four edges show a 1px line, but the lines between squares are 1 or 2px, unevenly. Measured in Edge; Firefox not checked. Answer: the app draws its own `#939393` edge over the board, 0.8px (1 screen px at 125%). As on Lichess, the edge is half a line between squares: each square adds 1 screen px to the line it shares, so lines between squares are 2 screen px and the edge is 1. Measured in Edge at 125%.
UI.18 Sizes are pixel-exact for one screen only: 1920 × 1080 at 125% Windows scale, browser zoom 100%. 1 CSS px = 1.25 screen px, so every size and gap above the board is a multiple of 0.8px (0.8px = 1 screen px; 4px = 5). A temporary fix; on other screens it works but is not pixel-exact. #note
- Board: `--board-size` 691.2px = 864 screen px, 108 per square, as Lichess shows it on this screen.
- Down: the gap above the board is half the free height (window height minus board), rounded to 0.8px, so the board top lands on a whole screen px. At least 24px, for the opening name (20) and its gap (4). In a 779.2px-high window, 44px above and below.
- Left edge, centred in 1536px: 422.4px = 528 screen px. Whole pixels only while the page has no scrollbar, so the page must fit the height (about 779px). File letters end 20px below the board.
- The rank labels are clipped to their box: the last one's box hung below the board and made the page scroll.


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


---


