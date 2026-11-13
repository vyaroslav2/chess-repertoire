---
tags:
  - archived
---
Three positions we both searched (rows 1, 10 and 22) match in every field, `nodes` and the full `pv` included, so the engines agree.

**Test done, 2026-11-13.** Seven more of his rows (2, 4, 9, 18, 21, 24, 27) were searched again on my PC. All seven match in every field, so 10 of 10 positions agree. The friend made all the fixes except point 2: he keeps the 0s, and his export will turn them into NULL.

## Critical

`1.` **The PV is cut at 255 characters.** `pv` is `varchar(255)`, and Stockfish lines often run longer.
   * The server runs in non-strict mode, so MySQL cut the PVs without an error and nobody noticed.
   * Fix: make `pv` a `TEXT` column, and turn on strict mode so that the next such fault raises an error.
   * Rows 5, 12 and 23 must be searched again: their full PVs can only come from a new search.

`2.` **0 instead of NULL.** A normal eval stores `mate = 0`, and a mate stores `cp = 0`. SC uses NULL for "no value", and the columns allow it. Why this matters:
   * `cp = 0` is also a real eval: a level position. So a mate looks level unless you check `mate` too, and every query must know the rule. `WHERE cp > 100` drops a White mate, and `ORDER BY cp` puts mates among the draws.
   * The export has to turn each 0 into NULL, and the import has to turn NULL back into 0. With NULL in the table, both are plain copies.

`3.` **Case-insensitive collation.** With `utf8mb4_0900_ai_ci`, `Q` equals `q`. When an import matches on `fen`, two different positions could count as the same. A binary collation fixes it.

## Worth checking

`4.` **No unique key on `fen`.** The table doesn't forbid a repeat. Today's 22 rows are all different, so this is a precaution.
   * Make `KEY fen` a `UNIQUE KEY`, so that MySQL refuses a second row for the same position. Do it after the collation fix (point 3).

```sql
ALTER TABLE calculations DROP KEY fen, ADD UNIQUE KEY fen (fen);
```

`5.` **Login.** The comment says the login comes from Colab Secrets, but the code doesn't read them. It doesn't affect SC.

`6.` **`HOSTING4`.** I haven't seen its structure. It probably has the same 255 limit, and maybe the same collation.
   * Check it and fix it the same way: `pv` as `TEXT`, and a binary collation. Colab writes to `HOSTING4` first, so a 255 limit there cuts the PV before it reaches `calculations`.
   * But no unique key there: `HOSTING4` holds repeats on purpose, and Colab searches each position only once.

`7.` **The missing ids.** There are no rows 13–17 or 28–32. That's probably harmless, but worth asking.


## Still open/next step 
- Export and import scripts.
