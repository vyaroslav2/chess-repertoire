---
tags:
  - in-progress
---
# HER — Human Evidence Revised

HER is the revised version of [[HE]] and will replace it. So far it covers only what is built: downloading, filtering, loading into MySQL, the checks on the way, what each row holds, and the decisions behind them. Until the rest moves here, the curve, k and the algorithm stay in [[HE]].
All code lives in `experiments/he/`. All data stays in `experiments/he/data/`, which is git-ignored.


==archive --> prefix --> filter --> `sample.pgn` --> `games` table==
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

HER.10 **Filtering happens while reading.** The prefix is decompressed as a stream.[^8] Each complete game is checked and kept or rejected. An unfinished game at the cut-off point is discarded.[^9] The full month is never extracted.

HER.11 **A game is kept only if all of these hold.**[^10]
* Rated Rapid or Classical, read from the `Event` header.
* Standard chess from the starting position.[^11]
* Starts 1. d4 d5 or 1. e4 c6.
* Average of both ratings from 1600 up to, not including, 2200.
* Rating gap under 100[^12] (`--max-gap 200` exists as a diagnostic only).[^13]
* A full, valid date ==(`UTCDate`, else `Date`).[^14]== The year sets the period: 2023–24 fit, 2025 tune, 2026 test.
* A finished result[^15] and a valid Lichess game ID.
* Every move legal.[^16]
* The game reaches its sampled move (HER.12).

HER.12 **One sampled Black move per game.** A ==hash of the seed (`he-v1`)[^17]== and the ==game ID[^18]== picks one Black move number from 2 to 15. Ход выбирается **до** проверки длины, и если хода нет, другой не подбирают. Так в 2024-01-2500mb выбросили 1 277 партий. 
Побочный эффект: короткие партии попадают в выборку чуть реже. Партия из 5 ходов выживает, только если ей выпал ход 2–5, а партия из 30 ходов — всегда. If the game ends before that move, the game is dropped. So every kept game reached its sampled move==

HER.13 **Duplicates are dropped by game ID.**

HER.14 The filter reads games until N are kept (`--limit`). Example: 2024-01-2500mb read 5,712,931 games to keep 50,000:

| Rejected because                 | Games     |
| -------------------------------- | --------- |
| Not rated Rapid or Classical     | 4,922,688 |
| Rating average outside 1600–2199 | 452,665   |
| Other opening                    | 244,802   |
| Rating gap 100 or more           | 41,499    |
| Ended before the sampled move    | 1,277     |

## Files

HER.20 **Each run writes files.**
* `downloads/<run>/sample.pgn` — the kept games, full PGN.[^19]
* `runs/<run>/observations.jsonl` — one row per game: ==🟠the sampled position==[^20], Black's move and the result. 
* `runs/<run>/groups.jsonl` — ==win/draw/loss counts per position + move.[^21]==
* `runs/<run>/manifest.json` — filters, rejection counts and group sizes.[^22]

==HER.21 **Group sizes in 2024-01-2500mb.** 40,951 position + move groups: 39,313 with one game, 1,472 with 2–9, 136 with 10–49, 25 with 50–199, 5 with 200+.[^23]==

## Load into MySQL

HER.30 **The database.** A local MySQL 8.0 container, `he-mysql`, database `he`. Scripts connect through `HE_MYSQL_URL`, so no password lives in the code. `db-check` confirms the connection.

HER.31 **`load` copies `sample.pgn` into the `games` table.** It creates the table on first use. `--limit` loads only the first N games, for a quick look.

HER.32 **Loading is safe to repeat.** A game already in the table is overwritten, never doubled. Loading 100 games, then all 50k, needs no clean-up.

HER.33 Speed. About 4,000 games a minute: 2024-01-2500mb took 19 minutes. This is the step where chess.js replays every move and the result checks run (HER.50); that is the slow part.

## What a row holds

HER.40 **One row per game.**

| Column                   | Holds                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `game_id`                | Lichess ID, e.g. `1jf1GRFe`. The primary key. [^24][^25]                                      |
| `game_date`              | Date played. Read back as plain text, so the time zone cannot shift it (HER.44).              |
| `white_elo`, `black_elo` | Ratings before the game.[^26]                                                                 |
| `result`                 | `1-0`, `0-1` or `1/2-1/2`, as in the PGN. ==🟡//- сократить длину поля до минимума. -//==     |
| `termination`            | Lichess's reason, copied as is: `Normal` or `Time forfeit`.                                   |
| `final_state`            | `checkmate`, `stalemate`, `insufficient`, or `undefined` when the board settles nothing.[^27] |
| `stop_reason`            | Why the game stopped (HER.42).                                                                |
| `uci_moves`              | Full mainline in UCI: `e2e4 c7c6 d2d4`.                                                       |
| `san_moves`              | The same in SAN: `e4 c6 d4`.[^25]                                                             |

HER.41 **Moves are stored whole, with no move numbers.** The full game costs little. A query shows as much as it needs. A move's number follows from its place in the list. UCI is for code; SAN is for reading. Same as `history` and `displayPgn` in [[DB|DB.03]]. ==//- Опционально можно добавить генерируемое (не нужно писать запрос для заполнения это поля) поле `hash_uci` для каждой партии. Потому что строка `uci_moves` очень длинная и с `hash_uci` будет легче работать. -//==

HER.42 **`stop_reason` is filled in by MySQL** from ==🔵the other columns, so it is never out of date.==
1. `final_state` is set `-->` that value.
2. ==`termination` is `Time forfeit` `-->` `time`.[^28]==
3. A draw `-->` `drawn` (agreed, repetition or 50-move rule).
4. Otherwise `-->` `resigned`.
==🔵//- Список значений нужен, отдельная таблица в db. 6 значений всего. Do not write it yet. We need to discuss it first. -//==
`stop_reason`

| `resigned`     |
| -------------- |
| `checkmate`    |
| `time`         |
| `drawn`        |
| `insufficient` |
| `stalemate`    |




Only `time` comes from Lichess directly. `resigned` is inferred and may include players who left the game.

==HER.43 **Game IDs and SAN moves are case-sensitive.** Lichess IDs mix cases, and `bxc4` (pawn) is not `Bxc4` (bishop). MySQL ignores case by default, so these columns override it. 


==🔵//- should it be its own block or just footnotes? -//==
[^29]

HER.44 **Dates come back as plain text** (`2024-01-01`). ==//- come back to where? -//== Turning them into clock times would shift them a day in some time zones.

HER.45 **The date is per row, not per table.** More months and years go into the same table. A query filters by `game_date`.

## Checks on load

HER.50 **A game is rejected on load if:**
* the `Result` header and the result after the last move differ;
* a move is illegal;
* the final position contradicts the result: checkmate must match the winner; stalemate and insufficient material must be draws;
* Lichess ended it for a rules infraction (HER.61).

HER.51 **Cross-check with the importer.** Every row was compared with `observations.jsonl`, written separately by the importer. For each game, the result and the sampled move (UCI and SAN) must agree. 2024-01-2500mb: 49,995 rows checked, 0 mismatches. Both come from the same PGN, so this checks the code, not Lichess.[^30] To check against Lichess, open `lichess.org/<game_id>`.

HER.52 **2024-01-2500mb in the table.** 49,995 games.

| `stop_reason`  | White won | Black won | Drawn | Games  |
| -------------- | --------- | --------- | ----- | ------ |
| `resigned`     | 16,460    | 15,213    | —     | 31,673 |
| `checkmate`    | 5,765     | 4,768     | —     | 10,533 |
| `time`         | 2,507     | 2,451     | 154   | 5,112  |
| `drawn`        | —         | —         | 1,778 | 1,778  |
| `insufficient` | —         | —         | 610   | 610    |
| `stalemate`    | —         | —         | 289   | 289    |

The 154 time draws are flags where the opponent could not mate. ==//- Provide an example of how time ended and a player had a rook and king vs king. -//==

## Decisions

HER.60 **Store facts now, filter in queries later.** The table holds every kept game and how it ended. Which games an analysis uses is decided in the query, not by deleting rows. Facts only in the PGN header (`termination`) must be stored on load. Facts that follow from the moves can be added any time.

HER.61 **Rules-infraction games are dropped.** Lichess may have set the result after catching a rule breaker, so it proves nothing. 2024-01-2500mb had 5.

HER.62 **No guessed reasons are stored.** Lichess's `Normal` covers mate, resignation, agreed draws and stalemate. "Resigned" and "agreed" are not stored as facts, only inferred in `stop_reason`. ==🔵Repetition and the 50-move rule are not detected: a repetition on the board does not prove that is why the game ended.==

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

[^8]: The file is unpacked bit by bit as it is read, and each game is checked as soon as it is complete. The unpacked month is never saved to disk or held in memory whole; unpacked, it is several times bigger.

[^9]: The 2.5 GB cut lands in the middle of a game. That last game has no result after its moves, so it is thrown away. Every other game is complete.

[^10]: This answers ^11   %%Yes.%%

[^11]: Standard games in the monthly archive have no `Variant` tag, and we download the standard archive, so all of them are standard. The check works the other way round. It rejects a game only if a tag says it is not standard: `Variant` present and not `Standard`, or a `FEN` tag, or `SetUp "1"` (game from a set position). A missing tag counts as standard. It is a safety net; in practice it should reject nothing. 

[^12]: 100 excluded, check

[^13]: this exists in HE spe

[^14]: why else Date?
[^15]: Lichess returns the `Result` header: `1-0`, `0-1`, `1/2-1/2`, or `*` when there is no result (still running, or cut off). "Finished" means anything but `*`.

[^16]: A safety net. Checked by chess.js, a JavaScript library (the project is TypeScript, so not Pychess). It replays the whole game from the starting position, one move at a time. One illegal move rejects the game.

[^17]: explain %%A hash turns any text into a fixed, random-looking number. Same text, same number, every time. The seed `he-v1` is a fixed word mixed in; change it and every game gets a new sampled move.%%

[^18]: explain how they both pick the move number, is it like random? %%The text `he-v1:Pl5d9kYH` is hashed; the number is cut down to 0–13 and 2 is added --> a move from 2 to 15. Pl5d9kYH gets move 9. It works like a fair die rolled once per game, but the roll is fixed by the ID, so a rerun picks the same move.%%

[^19]:  `sample.pgn` is the kept games, copied unchanged, clocks and comments included.

[^20]: This what our code does, right? 
	I need a sample with explanation. Most importantly, do we truncate the game on a Black's move?  %%Yes, the importer (`import.ts`). Example row, shortened: `{"gameId":"Pl5d9kYH", "moveNumber":9, "fen":"rn1q1rk1/pb2bppp/1pp1pn2/2Pp4/1P1P1B2/P2BP2P/5PP1/RN1QK1NR b KQ - 1 9", "uci":"b8d7", "san":"Nbd7", "outcome":"wins"}`, plus date, ratings and opening. It reads: in game Pl5d9kYH, before Black's 9th move the board was this FEN; Black played 9...Nbd7; Black went on to win. No truncation: `outcome` is the result of the whole game, and the full game stays in `sample.pgn` and the table. The row records one moment.%%

[^21]: We group ... by `positionKey`: the FEN without the two move counters, exactly the normalised FEN in the glossary. So one position reached by different move orders is one group. Then by move (UCI) and by period. Yes, all three come after filtering: the download filters into `sample.pgn`, then import writes the three files. JSON is one document. JSONL (JSON Lines) is one JSON object per line: easier for long lists, read or added one line at a time. 

[^22]: It records the filter rules used (rating band, speeds, openings, seed…), the input file, how many games were rejected and why, the group sizes (HER.21) and whether the run finished.

[^23]: Why do we have them? We should explain in the spec. Wouldn't it be more logical to split into 2-5, 6-10, 11-15 groups? My logic, move number matters. -100cp in the first few moves is not the same as -100 in the middle (potentially, I can't back my words), because it's closer to the end (less moves to equalise in theory). Those 3 bands for start point should be enough. Could be later checked for accuracy, but should not be a spec. A note rather.    ==🟠%%They come from HE item 2: k is fitted separately for groups of 2–9, 10–49, 50–199 and 200+ games, to see whether one k fits all. So the bands are about how many games share a position + move, not move numbers. Agreed: the spec should say why. Your move-number idea is a separate axis. HE already asks to check k across move numbers, and each observation stores its move number, so 2–5, 6–10, 11–15 can be checked later. Agreed: a research note, not spec.%%==
[^24]: The ID is the game's address on Lichess: lichess.org/1jf1GRFe.

[^25]: Case matters: `bxc4` is a pawn capture, `Bxc4` a bishop capture. See HER.43.

[^26]: Make a footnote that one elo could be below or above the limit. It's the average that counts. %%Suggested footnote: "One rating can be outside 1600–2199; the average counts. 1660 and 1583 average 1621.5, so the game is in."

[^27]: A bug could also leave NULL, and the two could not be told apart. Better: add a value `undefined` and make the column required (NOT NULL), so MySQL refuses a missing value. 



[^28]: Time could be a random distribution or could be caused by a sharp line. We should make a note about possible future check ups. %%Agreed. Suggested note: "A time loss may be random, or caused by a sharp line that eats the clock. The second would not cancel out. The sensitivity check in HE covers it for now. Later check: compare time-loss rates per move."%%

[^29]: Explain. What columns override it? This deserves it's own place in the spec (HER), rather than my earlier footnote suggestion, right? So what's the solution to this, how do we avoid case-insensitivity?  %%MySQL compares text by a collation, a set of comparison rules. The default, `utf8mb4_0900_ai_ci`, ignores case ("ci" = case-insensitive). `game_id`, `uci_moves` and `san_moves` ==use `ascii_bin`== //- нужен или hash или ascii_bin #question -// instead, which compares exact characters, so b is not B. That is the fix, set when the table is created. And yes, it already has its own block, so [^32] can point here.

[^30]: "The code" means our two programs: the importer, which wrote `observations.jsonl`, and the loader, which filled the table. Agreement shows they read each game the same way and did not mix up rows. It cannot catch an error in Lichess's own file, e.g. a wrong result recorded by Lichess: both programs would copy it.

[^31]: 





[^32]: 


[^33]: 

[^34]: 



[^35]: 

[^36]: 





[^37]: 

[^38]: 

[^39]: 

[^40]: Should mention as a footnote the date can be screwed by the local time setting in the DB. %%Small correction: the stored date is always right. Only reading it back shifted it, and that is fixed (HER.44). Suggested footnote: ""%%

[^41]: 

[^42]: 

[^43]:
[^44]: explain %%Where the data came from, recorded so it can be checked.%%

[^45]:==A small JSON file describing a run: the settings used, the source, the counts and whether it finished. Here: `data/downloads/2024-01-2500mb/manifest.json`.==

[^46]: Should be part of the spec. Write it. 

[^47]: So what exactly is `prefix`?

[^48]: should mention this, either as a footnote or as part of the spec

[^49]: should be part of the spec or a footnote



[^50]: make a footnote

[^51]: 

