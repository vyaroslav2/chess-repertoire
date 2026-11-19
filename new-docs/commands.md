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
```
