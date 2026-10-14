---
tags:
  - in-progress
---
# MS — Messages

Every message the app shows, on the page or in Anki: what it says, where, for how long, and how it looks. The specs of the features say only when a message shows, and point here.

MS.01 **Answer undone.**
Shown on the page after `Ctrl + Z` on the page has taken back a grade ([[AD|AD.04]], [[AD|AD.06]]).
- Text: "Answer undone". "Answer", as Anki says: its undo step is "Answer Card".
- Where: the bottom left, 16px from the left edge, left edges level with the status light ([[UI|UI.30]]), 8px above it. Above it, not over it, so a move made before the message fades doesn't hide the light.
- How long: 3s, then a 0.45s fade, then it goes. A second undo restarts it, and a grade or MS.03 replaces it. MS.02 stays at 2s.
- On `/` only: `/demo`'s undo ([[UN]]) shows no message.
- Look: the same as MS.02. Background `#262421` (`--lichess-panel-bg`), 1px border `#363431` (`--lichess-border`), 1px corners (`--settings-menu-radius`). Text: Inter, 14px, line height 20px, `#dad6d0` (`--menu-text`), on one line. Padding 4px 8px.
- Source: `components/SrsTrainer.tsx` (`undoNotice`) and `.undo-notice` in `app/globals.css`, which shares its look with `.settings-notice`.
- Since 2026-10-14. Before, it was a tooltip in Anki, "Grade undone from the web page", at the bottom left of the screen. A click on it brought Anki forward (MS.01.01, #fixed 2026-10-14), and its look was Anki's, not ours (MS.01.02, #fixed 2026-10-14).

MS.02 **PGN copied, FEN copied.**
Shown on the page after a copy from the settings menu worked ([[SM|SM.07]]).
- Text: "PGN copied" or "FEN copied".
- Where: where the menu was, the menu having closed: fixed in the top-right corner, 4px under the settings button (40px from the top), 8px from the right edge, right edges level with the menu's.
- How long: 2s, then a 0.45s fade, then it goes. Opening the menu hides it at once. A second copy restarts it.
- Look: the menu's. Background `#262421` (`--lichess-panel-bg`), 1px border `#363431` (`--lichess-border`), 1px corners (`--settings-menu-radius`). Text as the menu items: Inter, 14px, line height 20px, `#dad6d0` (`--menu-text`), on one line. Padding 4px 8px.
- Source: `components/SettingsMenu.tsx` (`showNotice`) and `.settings-notice` in `app/globals.css`.

MS.03 **Nothing undone.**
Shown on the page when `Ctrl + Z` on the page undid nothing ([[AD|AD.05]], [[AD|AD.07]]). Decided 2026-10-14 (UN.3.01, UN.3.02).
- Text, by cause:
  - Anki's next undo step is not a grade: "Nothing undone. Anki's last change was 'Update Note': undo it in Anki first." The step's name is Anki's, in Anki's language.
  - Anki's latest grade is not the page's last one (a card graded in Anki's own window or in another tab, or the page's grade already undone in Anki): "Nothing undone. Anki's last answer wasn't made on this page: undo it in Anki first."
  - The add-on is missing: "Undo needs the Chess Repertoire add-on in Anki."
- Anki has nothing to undo at all: no message ([[AD|AD.05]]).
- Where: as MS.01, bottom left above the status light. It replaces any message there, and a newer one replaces it.
- How long: until your next grade or `Ctrl + Z`. No time limit: it tells you what to do, and 3s is too short to read it with your eyes on the board.
- Look: as MS.01 and MS.02, the same box and text, no colour of its own (amber already means a revealed answer, [[UI|UI.30]]). It wraps at 280px, the status line's width.
- Since 2026-10-14. Before, the refusals were amber text under the status line, until the next card, and "Anki has nothing to undo." was one of them.
