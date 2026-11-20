---
tags:
  - processed
---
```text
npm run tree-log      // print the log in the console
npm run dev           // start the app
npm run generate      // start generation; depthCap is in src/lib/core/config.ts

// Export the engine cache (the whole cache, every time)
npx tsx scripts/sc_export.ts                     // writes exports/evals-YYYY-MM-DD.json
npx tsx scripts/sc_export.ts --out <path>        // writes to <path> instead
// Each generator run also exports by itself when it ends.
// It doesn't if the run is killed (window closed, or Ctrl+C in a plain window).

// Import the friend's file (checks the whole file first; writes all or nothing)
npx tsx scripts/sc_import.ts <file>
// Adds only evals we don't have yet. Best done when no run is going.

// Export the tree's lines to Anki (Anki must be running; profile and deck are in src/lib/core/anki-export.ts)
npx tsx scripts/anki_export.ts                       // every line; opens the profile itself
npx tsx scripts/anki_export.ts --while-generating    // during a run: only lines that can't grow any more
npx tsx scripts/anki_export.ts --limit 10            // at most 10 cards
// Adds only lines not yet in the deck; a longer line replaces its shorter card.
// A generator run also exports by itself, after each position, while its profile is open in Anki.
```
