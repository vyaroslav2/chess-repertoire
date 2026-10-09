---
tags:
  - in-progress
---
# HER — Human Evidence Revised

HER is the revised version of [[HE]] and will replace it. So far it covers only what is built: downloading, filtering, loading into MySQL, the checks on the way, what each row holds, and the decisions behind them. Until the rest moves here, the curve, k and the algorithm stay in [[HE]].
All code lives in `experiments/he/`. All data stays in `experiments/he/data/`, which is git-ignored.


Lichess archive --> [[archive-prefix|prefix]] --> `sample.pgn` --> `games` table. Each step:

| Step     | Reads                   | Writes                                              | Blocks    |
| -------- | ----------------------- | --------------------------------------------------- | --------- |
| Download | Lichess monthly archive | its first N GB, the prefix (`archive-prefix.pgn.zst`) | HER.01–04 |
| Filter   | the prefix              | the kept games (`sample.pgn`)                        | HER.10–14 |
| Import   | `sample.pgn`            | `observations.jsonl`, `groups.jsonl`                 | HER.20–21 |
| Load     | `sample.pgn`            | the MySQL `games` table                             | HER.30–33 |

The `download` command runs the first three steps in one go; `load` is run on its own.

## Download

HER.01 **Source.** A Lichess monthly archive of rated standard games (`.pgn.zst`). For now, the pilot uses the January 2024 archive.

HER.02 **Only the start of the archive is downloaded.** A month is about 32 GB compressed. The archive is in time order, so its start holds the month's earliest games. The pilot[^1] downloads the first 2.5 GB. The download asks the server for the first N GB (`--gb`). It then checks that the server answered with HTTP 206 (part of a file) and sent exactly the bytes asked for, not the whole file or another range. If not, it stops. N can be anything from 16 bytes to the whole month; 0.001 (1 MB) suits a quick trial. 2.5 GB was a guess at a size big enough for 50,000 kept games. The guess held: the filter reached 50,000 before the [[archive-prefix|prefix]] ran out. The size is a cap, not a promise of 50,000 games. The prefix is a short window of time: 2024-01-2500mb covers only 1–2 January 2024.

The command:
`npm --prefix experiments/he run download -- --run 2024-01-2500mb --month 2024-01 --gb 2.5 --limit 50000`. 

| Part                      | Whose   | What it does                                                                                                  |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `npm`                     | Node.js | Node's package manager. Runs the scripts listed in a `package.json`.                                          |
| `--prefix experiments/he` | npm     | Use the `package.json` in `experiments/he`, so the command works from the repo root.                          |
| `run download`            | npm     | Run the script named `download` in that `package.json`: `tsx cli.ts download`.                                |
| `--`                      | npm     | Everything after it goes to our script, not to npm.                                                           |
| `--run 2024-01-2500mb`    | ours    | The run's name. Its files go in `downloads/<run>/` and `runs/<run>/`. Required.                               |
| `--month 2024-01`         | ours    | Which monthly archive to download. Required.                                                                  |
| `--gb 2.5`                | ours    | How much of the archive's start to download (HER.02). Required.                                               |
| `--limit 50000`           | ours    | Stop once this many games are kept. Optional; without it the whole prefix is filtered.                        |
| `--seed`, `--max-gap`     | ours    | Not in this command, so the defaults apply: `he-v1` (HER.12) and a rating gap under 100 (200 is for a check). |


HER.03 **Provenance is kept.** The download manifest[^2] records the URL, the bytes requested, the archive's total size, ETag[^3] and last-modified date[^4], and the prefix's SHA-256[^5][^6]. A run can then be traced to the exact bytes it came from[^7].

HER.04 **Names are protected.** An existing run or download name is never overwritten. A failed download stays marked failed; retry under a new name.

## Filter

HER.10 **Filtering happens while reading.** The prefix is decompressed as a stream.[^8] Each complete game is checked and kept or rejected. An unfinished game at the cut-off point is discarded.[^9] Only the kept games are written out, to `sample.pgn`. With `--limit`, reading stops at the N-th kept game; the rest of the prefix is never unpacked.

HER.11 **A game is kept only if all of these hold.**
* Rated Rapid or Classical, read from the `Event` header.
* Standard chess from the starting position.[^10]
* Starts 1. d4 d5 or 1. e4 c6.
* Average of both ratings from 1600 up to, not including, 2200.
* Rating gap under 100[^11] (`--max-gap 200` exists as a diagnostic only).[^12]
* A full, valid date (`UTCDate`, else `Date`).[^13] The year sets the period: 2023–24 fit, 2025 tune, 2026 test.
* A finished result[^14] and a valid Lichess game ID.
* Every move legal.[^15]
* The game reaches its sampled move (HER.12).
* ==Postponed:== not ended by Lichess for a rules infraction, read from the `Termination` header (HER.61).

HER.12 **One sampled Black move per game.** A hash of the seed (`he-v1`) and the game ID[^16] picks one Black move number from 2 to 15. The move is picked **before** the game's length is checked. If the game ends before that move, the game is dropped; no other move is picked instead. So every kept game reached its sampled move. In 2024-01-2500mb, 1,277 games were dropped this way.
Fair side effect: short games are kept less often. A game in which Black makes 5 moves is kept only if it drew move 2–5. A game in which Black makes 15 moves or more is always kept. Why it's fine: the sample is unbiased for each position. A short game can't be observed at moves it never reached.   

HER.13 **Duplicates are dropped by game ID.**

HER.14 The filter reads games until N are kept (`--limit`). Example: 2024-01-2500mb read 5,712,931 games to keep 50,000:

| Check, in order                     | Rejected  | Still in  |
| ----------------------------------- | --------- | --------- |
| Read                                |           | 5,712,931 |
| Not rated Rapid or Classical        | 4,922,688 | 790,243   |
| Rating average outside 1600–2199    | 452,665   | 337,578   |
| Rating gap 100 or more              | 41,499    | 296,079   |
| Other opening                       | 244,802   | 51,277    |
| Ended before the sampled move       | 1,277     | 50,000    |
| Rules infraction (on load, HER.61)  | 5         | 49,995    |

Each game is counted once, in the highest row it fails.

==The last row shows today's code: rules-infraction games are dropped on load, after the filter. Moving that check into the filter is postponed (HER.61). Then the table will end at 50,000, with rules infraction as the filter's last check.==

## Files

HER.20 **Each run writes files.**
* `downloads/<run>/sample.pgn` — the kept games, full PGN.[^17]
* ==🔴`runs/<run>/observations.jsonl` — one row per game: the sampled position, Black's move and the result.==  //- why do we need observations.jsonl and what it does, conceptually. use simple language -//
* ==🔴`runs/<run>/groups.jsonl` — win/draw/loss counts per position + move.[^18]==
* `runs/<run>/manifest.json` — filters, rejection counts and group sizes.

==🔴HER.21 **Group sizes in 2024-01-2500mb.** 40,951 position + move groups: 39,313 with one game, 1,472 with 2–9, 136 with 10–49, 25 with 50–199, 5 with 200+.[^19]==

## Load into MySQL

HER.30 **The database.** A local MySQL 8.0 container, `he-mysql`, database `he`. Scripts connect through `HE_MYSQL_URL`, so no password lives in the code. `db-check` confirms the connection.

HER.31 **`load` copies `sample.pgn` into the `games` table.** It creates the table on first use. `--limit` loads only the first N games, for a quick look.

HER.32 **Loading is safe to repeat.** A game already in the table is overwritten, never doubled. Loading 100 games, then all 50k, needs no clean-up.

HER.33 Speed. About 4,000 games a minute: 2024-01-2500mb took 19 minutes. This is the step where chess.js replays every move and the result checks run (HER.50); that is the slow part.

## What a row holds

HER.40 **One row per game.**

| Column                   | Holds                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `game_id`                | Lichess ID, e.g. `1jf1GRFe`. The primary key. Case-sensitive (HER.43)                         |
| `game_date`[^20]              | Date played. Read back as plain text, so the time zone cannot shift it (HER.44).              |
| `white_elo`, `black_elo` | Ratings before the game.[^21]                                                                 |
| `result`                 | `1-0`, `0-1` or `1/2-1/2`, as in the PGN.[^22]                                                |
| `termination`            | Lichess's reason, copied as is: `Normal` or `Time forfeit`.                                   |
| `final_state`            | `checkmate`, `stalemate`, `insufficient`, or `undefined` when the board settles nothing.[^23] |
| `stop_reason`            | Why the game stopped (HER.42).                                                                |
| `eco`                    | Lichess's ECO code for the whole game, e.g. `D30`.                                             |
| `opening`                | Lichess's opening name for the whole game, e.g. `Queen's Gambit Declined`.                     |
| `uci_moves`              | Full mainline in UCI: `e2e4 c7c6 d2d4`.                                                       |
| `san_moves`              | The same in SAN: `e4 c6 d4`. Case-sensitive (HER.43).                                         |

==Code does not match yet: the column is still `played_on`, and `final_state` still uses NULL instead of `undefined`. To fix later.==

HER.41 **Moves are stored whole, with no move numbers.** The full game costs little. A query shows as much as it needs. A move's number follows from its place in the list. UCI is for code; SAN is for reading. Same as `history` and `displayPgn` in [[DB|DB.03]]. 

#note A generated `hash_uci` column (a short fixed key from `uci_moves`) would make whole-game comparisons fast, e.g. finding identical games. It does not help "starts with" queries. Not added: no query needs it yet, and MySQL can add it at any time without a reload (HER.60).
 

HER.42 `stop_reason` is filled in by MySQL from the other columns; no code writes it, so it always agrees with them.

`stop_reason` takes one of six values, checked in this order:

| Value          | Meaning                                                               | From                      |
| -------------- | --------------------------------------------------------------------- | ------------------------- |
| `checkmate`    |                                                                       | The board (`final_state`) |
| `stalemate`    | The final position is stalemate. A draw.                              | The board (`final_state`) |
| `insufficient` | Neither side has enough material to mate. A draw.                     | The board (`final_state`) |
| `time`         | A player ran out of time. A draw if the opponent could not mate.[^24] | Lichess (`termination`)   |
| `drawn`        | Any other draw: agreed, repetition or 50-move rule.                   | Inferred                  |
| `resigned`     | Any other win. May include players who left the game.                 | Inferred                  |

#note The rows don't hold text: `stop_reason` is an [[enum|ENUM]], so MySQL stores a small number per row (1 byte) and shows the word. It also refuses any value outside the six. That is what a separate table gives, without a join in every query. A separate table pays off when the values carry more data (a description, a group) or change often. 



HER.43 **Game IDs and moves are case-sensitive.** Lichess IDs mix cases, and `bxc4` (pawn) is not `Bxc4` (bishop). MySQL compares text by a collation, a set of comparison rules. The default, `utf8mb4_0900_ai_ci`, ignores case ("ci" = case-insensitive). `game_id` and `san_moves` use `ascii_bin` instead, which compares exact characters. It is set when the table is created. `uci_moves` is always lower case, so case cannot cause a wrong match there. It uses `ascii_bin` too, for size and speed: one byte per character, compared byte by byte. 


#note Why `ascii_bin`, not a hash. A hash is case-sensitive (`b` and `B` give different hashes), but it helps only one kind of query: an exact match on the whole value. It keeps no order or structure: the hash of `e2e4 c7c6` says nothing about the hash of `e2e4 c7c6 d2d4`, so "starts with" (`LIKE 'e2e4 c7c6%'`) cannot use it, and hashes sort in random order. `ascii_bin` is a setting on the column, so every query that uses the column compares exact characters: equality, "starts with", sorting, grouping and the primary key. The primary key matters most: with a case-insensitive `game_id`, `abcdEFGH` and `ABCDefgh` would count as the same game, and `load` would overwrite one with the other. Making a hash the key instead would take 32 bytes instead of 8 and a hash on every lookup, and `game_id` would still be stored for reading. `ascii_bin` does the job with no extra column. 

HER.44 **`game_date` is a MySQL `DATE`; our code reads it as text.** In MySQL the column is a true date, with no time. When a script reads a row through the mysql2 driver, it gets the text `2024-01-01`, not a JavaScript date. A JavaScript date always carries a clock time and a time zone, so mysql2 would add midnight on the machine's clock. That can move the date to the day before. Example: on a machine set to Moscow time (UTC+3), midnight on 1 January 2025 is 21:00 on 31 December 2024 in UTC. Code working in UTC would put the game in 2024. The connection sets `dateStrings: true` (`db.ts`) to prevent that.

#note **The date is per row, not per table.** More months and years go into the same table. A query filters by `game_date`.

## Checks on load

HER.50 **A game is rejected on load if:**
* the `Result` header and the result after the last move differ;
* a move is illegal;
* the final position contradicts the result: checkmate must match the winner; stalemate and insufficient material must be draws.

HER.51 **Cross-check with the importer.** Every row was compared with `observations.jsonl`, written separately by the importer. For each game, the result and the sampled move (UCI and SAN) must agree. 2024-01-2500mb: 49,995 rows checked, 0 mismatches. Both come from the same PGN, so this checks the code, not Lichess.[^25] To check against Lichess, open `lichess.org/<game_id>`.

HER.52 **2024-01-2500mb in the table.** 49,995 games.

| `stop_reason`  | White won | Black won | Drawn | Games  |
| -------------- | --------- | --------- | ----- | ------ |
| `resigned`     | 16,460    | 15,213    | —     | 31,673 |
| `checkmate`    | 5,765     | 4,768     | —     | 10,533 |
| `time`         | 2,507     | 2,451     | 154   | 5,112  |
| `drawn`        | —         | —         | 1,778 | 1,778  |
| `insufficient` | —         | —         | 610   | 610    |
| `stalemate`    | —         | —         | 289   | 289    |

The 154 time draws are flags where the opponent could not mate.[^24]

## Decisions

HER.60 **Store facts now, filter in queries later.** The table holds every kept game and how it ended. Which games an analysis uses is decided in the query, not by deleting rows. Facts only in the PGN header (`termination`) must be stored on load. Facts that follow from the moves can be added any time.

HER.61 **Rules-infraction games are dropped.** Lichess may have set the result after catching a rule breaker, so it proves nothing. The filter drops them as its last check (HER.11), so they never reach `sample.pgn`, `observations.jsonl` or the table. `load` does not check again. ==Postponed until the spec is finished, so the code does not match this yet: it still checks on load only. 2024-01-2500mb was made that way: its 5 rules-infraction games were dropped on load, so they are still in its `sample.pgn` and `observations.jsonl`. Once the filter checks, it will be filtered and loaded again from scratch; a sample made before the change must not be loaded.==

HER.62 **No guessed reasons are stored.** Lichess's `Normal` covers mate, resignation, agreed draws and stalemate. "Resigned" and "agreed" are not stored as facts, only inferred in `stop_reason`. Repetition and the 50-move rule are not detected: a repetition on the board does not prove that is why the game ended.

HER.63 **Every game counts, whatever its stop reason.** Time losses and early endings are checked by the sensitivity check in [[HE]], not removed.

HER.64 **Results are kept in PGN form** (`1-0`). Not from one side's view, e.g. not `wins`, `draws`, `losses` for Black, as `observations.jsonl` stores it.". Neutral, so there is no doubt whose view it is.

HER.65 **More data means a new download from byte 0.** There is no "continue": every download starts at the beginning of the archive (HER.02). For more games, raise `--gb` (e.g. `--gb 5`) or choose another month. Each is a new run with a new `--run` name (HER.04). Continuing from where a prefix ended is possible, but needs new code, so it is deferred. Downloading the first 2.5 GB again costs only minutes. Loading the bigger run on top of the old one is safe: games already in the table are overwritten with the same values, never doubled (HER.32), and only the new games are added. Raise `--limit` too, or drop it: with `--limit 50000` the filter stops at the same 50,000 games.







[^1]: The pilot is the first, small trial of human evidence, planned in [[HE#Next step: a small pilot]]. It runs the whole chain (download, filter, load, then the curve and k) on a little data before scaling up. So far it covers one run, 2024-01-2500mb: 50,000 games of 1. d4 d5 or the Caro-Kann from 1–2 January 2024, all in the fit period. HE suggests 50,000 first, then 100,000; if the curve and k barely change, 50,000 is enough.

[^2]: A manifest is a small JSON file describing a run: the settings used, the source, the counts and whether it finished. Each run has two: `downloads/<run>/manifest.json` for the download and filter, and `runs/<run>/manifest.json` for the import (HER.20).

[^3]: A version label the server gives a file. If Lichess ever replaces the January file, the label changes, so we would know our copy came from the older version.

[^4]: The date the server says the file last changed. For January 2024 it is 17 June 2024, so the file was re-uploaded months after the month ended; why, we don't know. Like the ETag, it changes if the file is replaced again.

[^5]: A fingerprint of the downloaded bytes, 64 characters long. Change one byte and the fingerprint changes completely. If any game changes, the hash changes. The hash can also change when no game has changed, if Lichess only recompresses the file.

[^6]: The month and the bytes requested say what we asked for; the hash says what we got. If Lichess replaces the file at the same URL, the same request returns different bytes, and only the hash proves it. It also catches a download damaged on the way. The settings need no hash: the manifest stores them in full (options, policy, limit), in plain text. One thing is missing: the code version. The same bytes and settings can give a different result after a code change. Recording the git commit in the manifest would close that gap. #deferred 

[^7]: Anyone can download the same URL and range again, take its fingerprint and compare. Same fingerprint --> same bytes --> the filter gives the same games.

[^8]: The file is unpacked bit by bit as it is read, and each game is checked as soon as it is complete. The unpacked prefix is never saved to disk or held in memory whole; unpacked, it is several times bigger.

[^9]: The 2.5 GB cut lands in the middle of a game. That last game has no result after its moves, so it is thrown away. Every other game is complete.

[^10]: A safety net; in practice it should reject nothing. Standard games in the monthly archive have no `Variant` tag, and we download the standard archive, so all of them are standard. The check works the other way round. It rejects a game only if a tag says it is not standard: `Variant` present and not `Standard`, or a `FEN` tag, or `SetUp "1"` (game from a set position). A missing tag counts as standard. 

[^11]: A gap of 99 is kept, 100 is rejected.

[^12]: Covered in [[HE]]: test the gap cut-off with curves for gaps 0–50, 50–100 and 100–200.

[^13]: A fallback for PGN files from elsewhere. Lichess writes both tags; all 50,000 games in 2024-01-2500mb have both, so `Date` is never used for them. `UTCDate` comes first because its time zone is fixed (UTC). `Date` is the standard PGN tag that almost every PGN has, but its time zone is not stated. The `import` command takes any `.pgn`, so the fallback keeps such files usable.

[^14]: Lichess writes the `Result` header: `1-0`, `0-1`, `1/2-1/2`, or `*` when the game has no result. "Finished" means anything but `*`.

[^15]: A safety net. Checked by chess.js, a JavaScript library. It replays the whole game from the starting position, one move at a time. One illegal move rejects the game.

[^16]: The text `he-v1:Pl5d9kYH` is hashed; the number is cut down to 0–13 and 2 is added --> a move from 2 to 15. Pl5d9kYH gets move 9. It works like a fair die rolled once per game, but the roll is fixed by the ID, so a rerun picks the same move.

[^17]:  `sample.pgn` is the kept games, copied unchanged, clocks and comments included.

[^18]: We group //- what? -// by `positionKey`/ `normalisedFen`. So one position reached by different move orders is one group. Then by move (UCI) and by period. All three come after filtering: the download filters into `sample.pgn`, then import writes the `observations.jsonl`. JSON is one document. JSONL (JSON Lines) is one JSON object per line: easier for long lists, read or added one line at a time. 

[^19]: Why do we have them? We should explain in the spec. Wouldn't it be more logical to split into 2-5, 6-10, 11-15 groups? My logic, move number matters. -100cp in the first few moves is not the same as -100 in the middle (potentially, I can't back my words), because it's closer to the end (less moves to equalise in theory). Those 3 bands for start point should be enough. Could be later checked for accuracy, but should not be a spec. A note rather.    ==🟠%%They come from HE item 2: k is fitted separately for groups of 2–9, 10–49, 50–199 and 200+ games, to see whether one k fits all. So the bands are about how many games share a position + move, not move numbers. Agreed: the spec should say why. Your move-number idea is a separate axis. HE already asks to check k across move numbers, and each observation stores its move number, so 2–5, 6–10, 11–15 can be checked later. Agreed: a research note, not spec.%%==
[^20]: **`game_date`:** the column is called `played_on` in the code. HER.45 also uses `game_date`. The code must change to match the spec. #bug

[^21]: One rating can be outside 1600–2199; the average counts. 1660 and 1583 average 1621.5, so the game is in. 

[^22]:  `result` is an ENUM of the three values, which MySQL stores as one byte per row. It cannot get smaller.

[^23]: A bug could also leave NULL, and then a deliberate NULL (the board settles nothing) and a NULL left by a bug would look the same." Also, the code does not do this yet: `final_state` still allows NULL, with no `undefined` value. #bug



[^24]: Example: White has king and rook, Black has only a king. White's clock runs out. Normally that loses, but Black has nothing left to mate with, so the game is drawn, not won by Black. Lichess records `Termination "Time forfeit"` and `1/2-1/2`. On the board it is no stalemate and no insufficient material (White could still mate), so `final_state` is empty and `stop_reason` is `time`. If Black's clock had run out instead, White would win on time.

[^25]: "The code" means our two programs: the importer, which wrote `observations.jsonl`, and the loader, which filled the table. Agreement shows they read each game the same way and did not mix up rows. It cannot catch an error in Lichess's own file, e.g. a wrong result recorded by Lichess: both programs would copy it.



[^26]: A time loss may be random, or caused by a sharp line that eats the clock. The second would not cancel out. The sensitivity check in HE covers it for now. Later check: compare time-loss rates per move.



[^27]: The ID is the game's address on Lichess: lichess.org/1jf1GRFe.













