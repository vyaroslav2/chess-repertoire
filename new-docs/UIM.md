---
tags:
  - in-progress
---
# UI mine
> [!note] Purpose
> This file will replace UI.md in the end. It is mine; the AI fixes its grammar, formatting and flow.

`1` The exact fonts, colours and sizes rendered now for all text. The final "demo finished" text is out of scope.
Measured 2026-10-11 in the app's browser pane (Chromium, same Windows fonts as Edge), at 125% scale, so 1 CSS px = 1.25 screen px. Sizes are CSS px; screen px in brackets.
**Was** is before the fonts were self-hosted; **Now** is after (both 2026-10-11). Sizes and colours did not change.

`1.1` ECO and opening name
**Now:** Inter.
**Was:** Segoe UI, 14px (17.5), weight 400, line height 20px (25), `#787674`. 

//-1.1.1 so only the font changed, everything else is the same? -//
%%Yes. Measured again after the change: Inter, 14px, weight 400, line height 20px, `#787674`, 4px above the board. The settings are the same, but the text looks a little different: Inter's letters are wider and taller than Segoe UI's at the same 14px. "A40 Queen's Pawn Game" is about 170px wide in Inter and 154px in Segoe UI (10% wider), and a lower-case x is 8px tall instead of 7. The paragraph below describes the "Was" state: Inter is now loaded, so the fallback to Segoe UI no longer happens.%%

ECO code and name share one style, e.g. "A40 Queen's Pawn Game". The stack asks for Inter first; it is not installed, nor are -apple-system and BlinkMacSystemFont, so Segoe UI is used.

`1.2` Coordinates
**Now:** Inter, weight 500 (real now: Inter has a 500 weight).
**Was:** Arial, 13px (16.25), line height 19.5px, `#787674`, lower case. The CSS asks for weight 500, but Arial on Windows has no 500, so it renders as regular (400). Stack: Inter, Arial, sans-serif.

`1.3` Status line (shown on hover)
**Now:** Inter.
**Was:** Segoe UI, 16px (20), weight 400, line height 24px (30), `#787674`. Opacity 0 until the pointer is over it. Same stack as 1.1.

Grid (move list)
`1.4` Move numbers
**Now:** Inter.
**Was:** Arial, 14.5px (18.125), weight 400, line height 26px (32.5), `#787674`, right-aligned. The stack is Inter, Roboto, Noto Sans, Source Sans 3, sans-serif. None of the four is installed, so it falls to the generic sans-serif, which is Arial here.

`1.5` Moves (SAN)
**Now:** JetBrains Mono, self-hosted (no request to Google).
**Was:** JetBrains Mono (from Google Fonts), 14.5px (18.125), weight 400, line height 26px (32.5), `#bababa`. Current move: weight 600, `#ffffff` on `#3692e7`. Hover: background `#363431`.

---

//- can you center the board? you can move the status line (that shows on hover) to the left free space. it doesn't matter now, I'll remove or change it later -- the status line is temp. If there's a conflict because of how CSS centers, e.g. pixel rounding, make it near perfect centered, so that everything is intact.  -//  
%%Done 2026-10-11. The board is centred across and down; only the board counts, as before.
- Down: the gap above the board is half the free height, rounded to the nearest 0.8px (1 screen px at 125%). So the board stays on whole screen px, and is at most 0.4px off centre. In a 779px-high window: 44px above, 43.8px below.
- The opening name sits 4px above the board, as before.
- The status line is in the free space left of the board: level with the board's top, 40px left of it, 280px wide, right-aligned. It wraps onto two lines. Still hidden until hover.
- Checked in the browser pane at 1536 × 779 (1:1 there, not 125%): no scrollbar, file letters fit below.
UI.01, UI.07 and UI.18 in UI.md updated to match.%%


