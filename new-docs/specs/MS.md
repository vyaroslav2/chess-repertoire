---
tags:
  - in-progress
---
# MS — Messages

Every message the app shows, on the page or in Anki: what it says, where, for how long, and how it looks. The specs of the features say only when a message shows, and point here.

MS.01 **Answer undone.**
Shown on the page after `Ctrl + Z` on the page has taken back a grade ([[AD|AD.13]], [[AD|AD.15]]).
- Text: "Answer undone". "Answer", as Anki says: its undo step is "Answer Card".
- It replaces Anki's own "Answer Card undone", passed on by the add-on ([[AD|AD.15]]). Since 2026-10-22.
- Where: the bottom left, 16px from the left edge, left edges level with the status light ([[UI|UI.30]]), 8px above it. Above it, not over it, so a move made before the message fades doesn't hide the light.
- How long: 3s, then a 0.45s fade, then it goes. A second undo restarts it, and a grade or MS.04 replaces it. MS.02 stays at 2s.
- On `/` only: `/demo`'s undo ([[UN]]) shows no message.
- Look: the same as MS.02. Background `#262421` (`--lichess-panel-bg`), 1px border `#363431` (`--lichess-border`), 1px corners (`--settings-menu-radius`). Text: Inter, 14px, line height 20px, `#dad6d0` (`--menu-text`), on one line. Padding 4px 8px.
- Source: `components/SrsTrainer.tsx` (`showUndoMessage`) and `.undo-notice` in `app/globals.css`, which shares its look with `.settings-notice`.
- Since 2026-10-14. Before, it was a tooltip in Anki, "Grade undone from the web page", at the bottom left of the screen. A click on it brought Anki forward (MS.01.01, #fixed 2026-10-14), and its look was Anki's, not ours (MS.01.02, #fixed 2026-10-14).

MS.02 **PGN copied, FEN copied.**
Shown on the page after a copy from the settings menu worked ([[SM|SM.07]]).
- Text: "PGN copied" or "FEN copied".
- Where: where the menu was, the menu having closed: fixed in the top-right corner, 4px under the settings button (40px from the top), 8px from the right edge, right edges level with the menu's.
- How long: 2s, then a 0.45s fade, then it goes. Opening the menu hides it at once. A second copy restarts it.
- Look: the menu's. Background `#262421` (`--lichess-panel-bg`), 1px border `#363431` (`--lichess-border`), 1px corners (`--settings-menu-radius`). Text as the menu items: Inter, 14px, line height 20px, `#dad6d0` (`--menu-text`), on one line. Padding 4px 8px.
- Source: `components/SettingsMenu.tsx` (`showNotice`) and `.settings-notice` in `app/globals.css`.

MS.03 **Nothing undone.**
Removed 2026-10-22. With native undo ([[AD|AD.13]]), the page never refuses an undo, so there is nothing to explain. With nothing to undo, Anki shows no message, and neither does the page ([[AD|AD.14]]). From 2026-10-14 to 2026-10-22, it said why an undo was refused, and stayed until the next grade or `Ctrl + Z`.

MS.04 **Anki's messages.**
Anki's tooltips, shown on the page instead of in Anki while the browser has focus ([[AD|AD.14]]). Decided 2026-10-22. For now only after `Ctrl + Z` on the page.
- Text: Anki's, as it is, in Anki's language: "Update Note undone", "Set Due Date undone". One exception: "Answer Card undone" shows as "Answer undone" (MS.01, [[AD|AD.15]]).
- Where, how long, look: as MS.01. Bottom left, 3s, then a 0.45s fade. A newer message replaces it.
- Anki's own tooltips last 3s too (`aqt/utils.py`, `tooltip`).
- Source: as MS.01. The text comes from `ankiUndo` in `app/anki.ts`.
