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
**Now:** Inter, letter spacing -0.0062em (-0.087px at 14px). Weight 400 (regular), unchanged; 
**Was:** Segoe UI, 14px (17.5), weight 400, line height 20px (25), `#787674`. 

ECO code and name share one style, e.g. "A40 Queen's Pawn Game". The stack asks for Inter first; it is not installed, nor are -apple-system and BlinkMacSystemFont, so Segoe UI is used.

Letter spacing, chosen 2026-10-11. Inter's designer publishes a formula for tracking by size ("dynamic metrics"): letter-spacing (em) = -0.0223 + 0.185 × e^(-0.1745 × size in px). At 14px it gives -0.0062em = -0.087px. Set in `em`, so it scales if the size changes. Effect at 14px: the gap around a letter goes from about 1.4px to 1.3px, as in Roboto (Arial is about 1.1px); a long name gets about 1% narrower. -0.6px and -0.3px were tried first, while comparing zoomed text; dropped once judged at the real 14px. Inter looked loose at first out of habit: Arial spaces letters about a quarter tighter.

//- chosen `#979490` -//
%%Applied 2026-10-11 as `--opening-text` in `globals.css`. Contrast 6.05 : 1 on the page background (`#161512`); the guideline (WCAG AA) asks 4.5. Was `#787674`, 4.04 : 1. Lichess's dim text is `#949494`, 6.02 : 1; `#979490` is the warm version.%%

`1.2` Coordinates

Arial, 13px (16.25), weight 400, line height 19.5px, `#817e7a`, lower case. Chosen 2026-10-11 for a classical look. Stack: Arial, Arimo, sans-serif. Arimo (Google Fonts) has Arial's letter widths; it is self-hosted and downloads only on machines without Arial (Linux, Android).

//- color: `#817e7a` !important; -//
%%Applied 2026-10-11 as `--coord-text` in `globals.css`. Contrast 4.52 : 1, the dimmest of this tint that passes 4.5; about 70% of the opening name's brightness. Was `#787674`, 4.04 : 1.%%



%%
I'd recommend `#817e7a`.

```
#817e7a
```

It's the same warm tint as your `#979490`, just darker, and still passes the 4.5 : 1 guideline (4.52 : 1). At about 70% of the opening name's brightness, the step between them is visible without the coordinates looking faint.

Other options in the same tint, against the page background:

|Colour|Contrast|Brightness vs `#979490`|Note|
|---|---|---|---|
|`#979490`|6.05|100%|opening name|
|`#8b8884`|5.18|83%|gentle step|
|`#85827e`|4.77|75%||
|`#817e7a`|4.52|71%|recommended: the dimmest that passes|
|`#7c7975`|4.22|65%|below the guideline|
|`#787674`|4.04|61%|current, slightly less warm|

`#807e7c`, from earlier, is almost the same brightness as `#817e7a` but less warm. `#817e7a` matches the opening name's tint better.

%%












%%
Yes, both use `#787674` (`--lichess-text-muted`). So do the move numbers and the status line.

Its contrast against the page background (`#161512`) is 4.04 : 1. The WCAG guideline for normal-size text is 4.5 : 1. Here are some greys measured against the same background:

|Colour|Contrast|Note|
|---|---|---|
|`#787674`|4.04|current|
|`#7e7c7a`|4.39|still short|
|`#807e7c`|4.52|the smallest step that passes; same warm tint, 8 levels lighter|
|`#949494`|6.02|Lichess's dim text (`--c-font-dim`)|
|`#bababa`|9.41|your move text|

`#807e7c` is the minimal fix. It's barely lighter, so the look stays the same. `#949494` is what Lichess uses, but it's noticeably brighter and a neutral grey rather than warm.

Changing `--lichess-text-muted` in `globals.css` changes all four places at once. To change only some of them, they'd need their own colour.
%%

`1.3` Status line (shown on hover)
**Now:** Inter.
**Was:** Segoe UI, 16px (20), weight 400, line height 24px (30), `#787674`. Opacity 0 until the pointer is over it. Same stack as 1.1.

Grid (move list)
`1.4` Move numbers
**Now:** Inter.

**Was:** Arial, 14.5px (18.125), weight 400, line height 26px (32.5), `#787674`, right-aligned. The stack is Inter, Roboto, Noto Sans, Source Sans 3, sans-serif. None of the four is installed, so it falls to the generic sans-serif, which is Arial here.

`1.5` Moves (SAN)
**Now:** JetBrains Mono, self-hosted (no request to Google).
//- chosen Roboto -// 
%%Applied 2026-10-11: `.move-san` in `globals.css` uses Roboto, self-hosted like Inter. Size, colours and the current move's weight 600 are unchanged; Roboto has a true 600. Chosen on `/moves` against Arial and Inter, with 7-character moves covering every SAN character. Roboto is not monospace, so moves no longer take equal width per character.%%

**Was:** JetBrains Mono (from Google Fonts), 14.5px (18.125), weight 400, line height 26px (32.5), `#bababa`. Current move: weight 600, `#ffffff` on `#3692e7`. Hover: background `#363431`.



---

//- can you center the board? you can move the status line (that shows on hover) to the left free space. it doesn't matter now, I'll remove or change it later -- the status line is temp. If there's a conflict because of how CSS centers, e.g. pixel rounding, make it near perfect centered, so that everything is intact.  -//  
%%Done 2026-10-11. The board is centred across and down; only the board counts, as before.
- Down: the gap above the board is half the free height, rounded to the nearest 0.8px (1 screen px at 125%). So the board stays on whole screen px, and is at most 0.4px off centre. In a 779px-high window: 44px above, 43.8px below.
- The opening name sits 4px above the board, as before.
- The status line is in the free space left of the board: level with the board's top, 40px left of it, 280px wide, right-aligned. It wraps onto two lines. Still hidden until hover.
- Checked in the browser pane at 1536 × 779 (1:1 there, not 125%): no scrollbar, file letters fit below.
UI.01, UI.07 and UI.18 in UI.md updated to match.%%


