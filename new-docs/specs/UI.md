---
tags:
  - reviewed
---
# UI — Board Screen

Sizes are CSS px, with screen px at 125% in brackets (1 CSS px = 1.25 screen px). Measured 2026-10-11 in Chromium on this Windows machine. Contrast is against the page background, `#161512`; the WCAG guideline for normal text is 4.5 : 1. **Was** is the state before 2026-10-11, kept for comparison.

## Text

UI.20 **ECO and opening name.**
Inter, 14px (17.5), weight 375, line height 20px, letter spacing -0.0062em (-0.087px), `#979490` (6.05 : 1). ECO code and name share one style, e.g. "A40 Queen's Pawn Game".
- Weight 375, since 2026-10-22: tried on `/status` (UI.29). 350 looked cleaner but washed out; 400, heavy across a long name. Inter is a variable font, so 375 is a true weight, not a fake.
- Letter spacing is Inter's own recommendation for 14px, from its designer's "dynamic metrics" formula: letter-spacing (em) = -0.0223 + 0.185 × e^(-0.1745 × size in px). Set in `em`, so it scales with the size. Tighter values (-0.3px, -0.6px) were tried and dropped.
- `#979490` is a warm version of Lichess's dim text, `#949494` (6.02 : 1).

**Was:** Segoe UI (Inter was asked for but never loaded), no letter spacing, `#787674` (4.04 : 1).

UI.21 **Coordinates.**
Arial, 13px (16.25), weight 400, line height 19.5px, lower case, `#817e7a` (4.52 : 1).
- Arial for a classical look. Stack: Arial, Arimo, sans-serif. Arimo has Arial's letter widths; it is self-hosted and not preloaded, so only machines without Arial (Linux, Android) download it.
- `#817e7a` is the same warm tint as the opening name, at about 70% of its brightness: the dimmest of this tint that passes 4.5 : 1.
- Not selectable (`user-select: none`), since 2026-10-13: a drag through empty space had highlighted them.
- Large coordinates: see UI.32.

UI.32 **Large coordinates.**
Ctrl + Alt + Shift + C + U switches the coordinates to a large style and back. Arial, 16px (20), weight 400, upper case, `#e0dcd6` (13.37 : 1), full opacity. The choice is kept in the browser (localStorage).
- The shortcut is deliberately awkward, so it never clashes with the browser or the trainer. Keys are read by position (`e.code`), so it works on any layout, and C and U can be pressed in either order.
- Size: upper case at 16px gives capitals 11.5px tall, against the 6.7px x-height of the normal style: clearly larger, yet still about an eighth of a square, so the labels stay beside the board, not over it. Weight stays 400: bold Arial looks heavy at this size.
- Colour: off-white, not white. Pure white on a near-black page glares and seems to bleed (halation); Material Design's dark theme uses white at 87% for high-emphasis text. `#e0dcd6` is that brightness in the same warm tint as UI.20 and UI.21.
- Chessground draws coordinates at 0.8 opacity; the large style sets it to 1, so the colour is exact.
- In the app since 2026-10-13.

UI.22 **Status line (temporary).**
Inter, 16px (20), weight 400, line height 24px, letter spacing -0.011em (-0.175px), `#787674`. Hidden until the pointer is over it. It sits in the free space left of the board, level with the board's top, its right edge 40px left of the board. It will be redone.
- Letter spacing is Inter's own for 16px, by the formula in UI.20.
- On `/`: Anki's counts ([[AK|AK.12]]), three rows, no colons. Labels in one column, left-aligned; numbers in another, right-aligned, so the units line up. 16px between the columns. Digits all one width (`tabular-nums`). The block is as wide as its text. Since 2026-10-22.
  - Labels: weight 400, `#787674`.
  - Numbers: weight 350, in Anki's night-mode colours: New `#93c5fd`, Learning `#f87171`, To Review `#22c55e` (`--anki-new`, `--anki-learn`, `--anki-review`). From Anki's `deckbrowser.css`, and checked against a screenshot of Anki. Lighter than the labels, as the colours are much brighter. A zero keeps its colour, as on Anki's overview screen.
  - Chosen on `/status` (UI.29).
- On `/demo`: one line, 280px wide, right-aligned.

**Was:** Segoe UI, above the board.

### Move list
UI.23 **Panel.** The panel is 220 × 691.2px (275 screen px wide), background `#262421`, attached to the board's right edge. Rows are 26px. The move-number column is 44px; the two move columns share the rest: (220 − 44 − 10px scrollbar) ÷ 2 = 83px when the list scrolls, 88px when it doesn't. The longest moves (7 characters, 71.6px with padding) have about 11px to spare.
- Since 2026-10-13 the panel is 318.4px wide, to make room for the evals (UI.26).
- Since 2026-10-13 the eval gauge sits between the board and the panel (UI.31), so the panel starts 23px right of the board.

**Was:** 188px wide. At the new move size the columns were too narrow: they grew unequal and the list scrolled sideways.

UI.24 **Move numbers.**
Roboto, 14px (17.5), weight 400, `#787674`, centred, no dot ("1", not "1."), in a shaded column, `#33312e`, as on the Lichess analysis board.
- The same font as the moves, as Lichess uses Noto Sans for both. Roboto's digits are all one width, so numbers stay steady from 1 to 200. "200" is 28px wide.
- The shading is painted on the grid, so it runs flush from the list's top and ends level with the last move's cell, as on Lichess. The grid keeps its 6px padding above the first row and below the last; only the top padding is shaded.
- Open: the numbers are only 2.9 : 1 on the shading (Lichess: 2.4 : 1).

**Was:** Inter (Arial before that), 14.5px, right-aligned with a dot, no shading. Until 2026-10-13 the shading ran 6px below the last move, through the bottom padding.

UI.25 **Moves (SAN).**
Roboto, 16.59px (20.7), weight 400, `#bababa`. Hover: background `#363431`. Current move: weight 600, `#ffffff` on `#3692e7`.
- Roboto was chosen over Arial and Inter on `/moves`, with 7-character moves covering every SAN character.
- Sizes from the Lichess analysis board at a 1536px window: numbers 14px, moves 16.59px, a ratio of 0.84. Lichess derives the move size from the window width, hence the odd number.

**Was:** JetBrains Mono, 14.5px.

UI.26 **Evals.**
In each move's cell, pushed to its right edge and centred vertically in the row, as on Lichess. Lichess centres the number, move and eval each in its row rather than sharing a baseline, so smaller text sits about 2px higher; ours: eval 1px, number 2px above the move's baseline. JetBrains Mono, 0.8em of the move size = 13.27px (16.6), weight 300, `#949494`; on the current move it turns white with the move. Two decimals, -9.99 to +9.99, e.g. `+0.00`, `-0.00`, `+9.99`. A move and its eval highlight as one cell.
- Lichess does the same with Roboto and one decimal. JetBrains Mono gives every eval the same width (39.8px for "+9.99"), so the decimal points line up.
- The font is Eval Mono: JetBrains Mono Light with the dot taken out of the zero. A dotted zero tells 0 from O in code; evals have no letters, so the dot is only clutter. JetBrains Mono has no plain zero (its one alternate is slashed), so `scripts/build_eval_font.py` builds a 1.2 KB copy: weight fixed at 300, only `0`–`9 + - . #`, renamed as the SIL Open Font License asks of a changed copy. Font and licence are in `app/_fonts/`.
- Cell padding is Lichess's: 0.5em left, 0.3em right (8.3px, 5px). White's eval ends 13.3px before Black's move.
- The panel grows to 318.4px (398 screen px), so the moves keep the room they have at 220px. Its right edge would be at 1432px of the 1536px window.
- Data: every move on a card carries an eval ([[DB|DB.11]]), in White's view. The card's answer shows its eval once played or revealed. A wrong move shows none.
- Beyond ±9.99 the eval keeps two decimals (e.g. `+12.34`). A mate shows as on Lichess: `#3` (White mates), `#-3` (Black mates).
- In the app since 2026-10-13. `/grid` keeps the mock.

## Layout

UI.27 **Centring.** The board is centred across and down; only the board counts. The gap above it is half the free height, rounded to the nearest 0.8px (1 screen px), so the board stays on whole screen pixels and is at most 0.4px off centre. In a 779px-high window: 44px above, 43.8px below.

UI.28 **Opening name position.** The opening name sits 4px above the board, as wide as the board and lined up with its left edge.

UI.29 **Test pages.** Temporary: `/fonts`, `/coords`, `/moves`, `/grid`, `/gauge`, `/settings` and `/status`. Delete them before deploying.
- `/status` shows Anki's counts (UI.22, [[AK|AK.12]]) left of a real board, always visible. Sliders set the size, the labels' weight and the numbers' weight (Anki's overview: 700), line height, column gap, the gap to the board and the offset from its top; letter spacing follows the size, by UI.20's formula. Colours: the app's muted grey, or Anki's own for New, Learning and To Review (blue, red, green; night or day). Zeros can be faint, as in Anki's deck list (its overview never fades them). The counts can be typed, or set to 9999 each, 54 · 5 · 0, or 0 · 0 · 0. Above the board, the opening name (UI.20, UI.28), with sliders for its size, weight and gap to the board, and for its grey: the lightness of `#979490`'s warm grey. Its colour can also be picked or typed as hex, with its contrast shown. Weights step by 25; letter spacing and line height follow the size. Three real names to try, from the repertoire's longest (90 characters) to "A40 Queen's Pawn Game". Lines at the bottom sum up the choice, for UI.20 and UI.22.
- `/settings` shows the settings button (SM.01) at up to 12× and the menu (SM.06) at up to 6×, each with its hover box forced on. Sliders set the rounding of the button, the menu panel and the items' hover box, each on its own. The real button, in its corner, opens the menu.
- `/gauge` shows the eval gauge (UI.31) at chosen evals, without the database: one gauge you set by typing (`-0.25`, `#-3`) or with buttons, which slides as in the trainer, and every preset side by side, from `#-1` to `#1`, each with White's share.
- `/grid` can switch its evals' zero between plain (the app's), slashed and dotted (JetBrains Mono's own). The slashed font is built by the same script and lives only in `app/grid/`.

UI.30 **Status light.**
A circle in the bottom-left corner, 16px in from each edge, shown once a move is made or revealed. What it shows over a whole line: [[GR|GR.06]]. Diameter `clamp(12px, 0.9vw, 18px)`: 13.8px (17.3) in a 1536px window; 12px up to 1333px, 17.3px at 1920px, 18px from 2000px up. Fill by state, with a 1px border about 30% darker in the same hue:

| State | Fill | Border |
|---|---|---|
| wrong | `#c62828` | `#8e1b1b` |
| correct | `#629924` (`--lichess-green`) | `#456b19` |
| revealed | `#f9a825` | `#b87a14` |

- Modelled on the macOS window buttons ("traffic lights"), which are always 12pt across. Larger here because a macOS button is something you aim the pointer at; this light is seen out of the corner of the eye while looking at the board, and side vision needs more area to notice colour.
- Grows with the window's width: the board stays centred, so on a wider window the corner is further from it and further out of view.
- 12px floor: smaller is hard to notice. 18px cap: larger reads as a button or a warning. The light is secondary, since the board already shows the result (a wrong move snaps back).
- If the board ever scales with the window, tie the light to the board instead: about 2% of `--board-size`.
- Tried and dropped: 0.8vw with a 10–20px clamp (12pt's share of a 13" MacBook Air's 1470pt), then a fixed 12px (macOS's exact size).
- A darker ring of the same hue, as on macOS, gives a crisp edge. A border in the fill colour can't be seen; a grey one looks like a socket and dulls the colour.
- Inset from the corner, not flush: a circle touching both edges looks clipped.

**Was:** a 250 × 25px stripe flush in the corner, with a `#363431` border on its top and right.

## Motion

UI.35 **Piece animation.**
A moving piece slides over 250ms, Lichess's default ("Normal").
- Lichess's four steps: None 0ms, Fast 120ms, Normal 250ms, Slow 500ms (`animationMillis` in lila's `Pref.scala`).
- A new card snaps to the position before the opponent's last move with no animation; only that last move slides.
- Since 2026-10-13.

**Was:** 200ms, Chessground's default: between Fast and Normal, not a Lichess step.

UI.31 **Eval gauge.**
A copy of the Lichess gauge, dark theme. A bar 15px wide and as tall as the board, between the board and the move list, 4px from each, as on the Lichess analysis board. Square ends; Lichess rounds them (7px).
- Fill: Black's share `#444` from the top, White's `#c0c0c0` below. The split is Lichess's winning-chances curve: 2 / (1 + e^(-0.00368208 × cp)) − 1, with cp capped at ±1000. A mate counts as (21 − min(10, |mate|)) × 100 cp, so mate in 1 is 2000 and mate in 10 or more is 1100.
- It shows the eval of the position on the board, from the same evals as the move list (UI.26). The split slides over 1s.
- Ticks at every 12.5%: 2px ridge lines, `#888` at 40%. The middle line is 7px thick, in Lichess's accent at half strength, `hsl(22 100% 42% / 0.5)`.
- An inner shadow, 5px, black at 50%.
- A position without an eval (the start, a wrong move) keeps the last split at 50% opacity, as on Lichess.
- Flipped with the board: from Black's side, White's share is at the top.
- Written from Lichess's source, not copied: lila is AGPL-3.0.
- The split is rounded to 0.01% (0.07px). Node and the browser can differ in the last digits of `Math.exp`, and the server-drawn page then fails to match the browser's.
- In the app since 2026-10-13.

UI.34 **Showing evals.**
The evals (UI.26) and the eval gauge (UI.31) are hidden at the start of each card. `E` shows them; a second press hides them again. Each new card starts hidden again.
- Why: cards are Anki style, and a game has no evals. The eval on the opponent's last move is the eval of the position you face, so it gives away roughly how strong the best reply is. The gauge shows the same figure.
- Why not remove them: they are worth a look after answering, or when stuck. One press spoils only the current card.
- Hidden, the move list's cells keep their width with no eval in them, and the gauge's slot stays empty, so nothing moves when they show.
- Not clipped when hidden: a narrower panel would make every move jump sideways on each press, and the space saved is no use, since only the board is centred (UI.27).
- A plain key, read as `e.key`, like `F` for flipping.
- Not built: showing evals only once the answer is in. The answer's own eval already waits for it (UI.26); build the rest only if needed.
- In the app since 2026-10-13.

**Was:** UI.33, Ctrl + Alt + Shift + G + U, hid the gauge alone and kept the choice in localStorage. Removed: hiding the gauge without the move list's evals hides nothing.
