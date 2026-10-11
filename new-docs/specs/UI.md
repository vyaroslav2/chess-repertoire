---
tags:
  - in-progress
---
# UI — Board Screen

Sizes are CSS px, with screen px at 125% in brackets (1 CSS px = 1.25 screen px). Measured 2026-10-11 in Chromium on this Windows machine. Contrast is against the page background, `#161512`; the WCAG guideline for normal text is 4.5 : 1. **Was** is the state before 2026-10-11, kept for comparison.

## Text

UI.20 **ECO and opening name.**
Inter, 14px (17.5), weight 400, line height 20px, letter spacing -0.0062em (-0.087px), `#979490` (6.05 : 1). ECO code and name share one style, e.g. "A40 Queen's Pawn Game".
- Letter spacing is Inter's own recommendation for 14px, from its designer's "dynamic metrics" formula: letter-spacing (em) = -0.0223 + 0.185 × e^(-0.1745 × size in px). Set in `em`, so it scales with the size. Tighter values (-0.3px, -0.6px) were tried and dropped.
- `#979490` is a warm version of Lichess's dim text, `#949494` (6.02 : 1).

**Was:** Segoe UI (Inter was asked for but never loaded), no letter spacing, `#787674` (4.04 : 1).

UI.21 **Coordinates.**
Arial, 13px (16.25), weight 400, line height 19.5px, lower case, `#817e7a` (4.52 : 1).
- Arial for a classical look. Stack: Arial, Arimo, sans-serif. Arimo has Arial's letter widths; it is self-hosted and not preloaded, so only machines without Arial (Linux, Android) download it.
- `#817e7a` is the same warm tint as the opening name, at about 70% of its brightness: the dimmest of this tint that passes 4.5 : 1.

UI.22 **Status line (temporary).**
Inter, 16px (20), weight 400, line height 24px, `#787674`. Hidden until the pointer is over it. It sits in the free space left of the board: level with the board's top, 40px left of it, 280px wide, right-aligned. It will be redone.

**Was:** Segoe UI, above the board.

### Move list
UI.23 **Panel.** The panel is 220 × 691.2px (275 screen px wide), background `#262421`, attached to the board's right edge. Rows are 26px. The move-number column is 44px; the two move columns share the rest: (220 − 44 − 10px scrollbar) ÷ 2 = 83px when the list scrolls, 88px when it doesn't. The longest moves (7 characters, 71.6px with padding) have about 11px to spare.

**Was:** 188px wide. At the new move size the columns were too narrow: they grew unequal and the list scrolled sideways.

UI.24 **Move numbers.**
Roboto, 14px (17.5), weight 400, `#787674`, centred, no dot ("1", not "1."), in a shaded column, `#33312e`, as on the Lichess analysis board.
- The same font as the moves, as Lichess uses Noto Sans for both. Roboto's digits are all one width, so numbers stay steady from 1 to 200. "200" is 28px wide.
- The shading is painted on the whole grid, so it runs flush from the list's top to 6px below the last move. The grid keeps its 6px padding above the first row and below the last.
- Open: the numbers are only 2.9 : 1 on the shading (Lichess: 2.4 : 1).

**Was:** Inter (Arial before that), 14.5px, right-aligned with a dot, no shading.

UI.25 **Moves (SAN).**
Roboto, 16.59px (20.7), weight 400, `#bababa`. Hover: background `#363431`. Current move: weight 600, `#ffffff` on `#3692e7`.
- Roboto was chosen over Arial and Inter on `/moves`, with 7-character moves covering every SAN character.
- Sizes from the Lichess analysis board at a 1536px window: numbers 14px, moves 16.59px, a ratio of 0.84. Lichess derives the move size from the window width, hence the odd number.

**Was:** JetBrains Mono, 14.5px.

UI.26 **Evals (designed; a mock on `/grid` only).**
In each move's cell, pushed to its right edge and centred vertically in the row, as on Lichess. Lichess centres the number, move and eval each in its row rather than sharing a baseline, so smaller text sits about 2px higher; ours: eval 1px, number 2px above the move's baseline. JetBrains Mono, 0.8em of the move size = 13.27px (16.6), weight 300, `#949494`; on the current move it turns white with the move. Two decimals, -9.99 to +9.99, e.g. `+0.00`, `-0.00`, `+9.99`. A move and its eval highlight as one cell.
- Lichess does the same with Roboto and one decimal. JetBrains Mono gives every eval the same width (39.8px for "+9.99"), so the decimal points line up.
- Cell padding is Lichess's: 0.5em left, 0.3em right (8.3px, 5px). White's eval ends 13.3px before Black's move.
- The panel grows to 318.4px (398 screen px), so the moves keep the room they have at 220px. Its right edge would be at 1432px of the 1536px window.
- Data: every move carries an eval ([[DB|DB.11]]). The generator does not yet do this for White: today only Black's moves have one (11 of 11; White's 0 of 36).
- To bring into the app: the eval in the move cell, the 0.5em/0.3em padding and the 318.4px panel.

## Layout

UI.27 **Centring.** The board is centred across and down; only the board counts. The gap above it is half the free height, rounded to the nearest 0.8px (1 screen px), so the board stays on whole screen pixels and is at most 0.4px off centre. In a 779px-high window: 44px above, 43.8px below.

UI.28 **Opening name position.** The opening name sits 4px above the board, as wide as the board and lined up with its left edge.

UI.29 **Test pages.** Temporary: `/fonts`, `/coords`, `/moves` and `/grid`. Delete them before deploying.
