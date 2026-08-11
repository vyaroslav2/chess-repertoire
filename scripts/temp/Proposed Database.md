 Basically, I want to capture granular data for us to use (if possible -- even for every limit), so we don't have to call API every time. 

I propose to create several databases: 
1. one is for Lichess data only.
2. second for chessdb, wikibooks.  
3. third one is for our algorithm data + FSRS.

We'll skip FSRS for now. I want to focus on this task at hand.  

I also tried to organise fields in logical structure - buckets: 
position - isolated instance with fen, eco, openingName and wikitext. 
line - histrory with a cumulative probability. E.g. '1 in 500 games' you will encounter this exact sequence of moves.  
Lichess (for position): positions are static, we can reuse them. 
OpponentMove: this is what we calculate, depending on the user's rate limit, other settings. Algorithm causes it to change, so it can be tricky to reuse. Although, we can put them as positions and corresponding related data to Lichess table. 
Response: again, highly changing. We'll calculate in tree generation run time.

So the idea is: 
We ran Lichess and  chessdb & wiki and store the raw data.

We tweak our algorithm: we reuse already existed lines and data. If something is missing we call Lichess, chessdb, wikibooks again. Once the data gets to our first two databases, it's there for our algorithm to use. E.g. we changed logic, and now new moves are chosen, and we fetch the missing information only.

| Position                                                        | Line           | Lichess (for position)                                                          | OpponentMove    | Response                                                                              |
| --------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| fen                                                             | pgn            | lichessEvalCp                                                                   | san             | san                                                                                   |
| eco                                                             | eco            | lichessGames(1600 Rapid) count + winrates                                       | prob            | dbType                                                                                |
| openingName                                                     | openingName    | lichessGames(1800 Rapid) count + winrates                                       | trueProbability | totalWeightedGames (masters+Lichess 2500Rapid/Classical)                              |
| wikiText                                                        | cumulativeProb | lichessGames(2000 Rapid) count + winrates                                       | isAmateurTrap   | totalWeightedWinrate()                                                                |
| chessdbEvalCp                                                   |                | lichessGames(1600 Classical) count + winrates                                   | isMasterThreat  | games / win / draw / loss                                                             |
| chessdbEngine rank                                              |                | lichessGames(1800 Classical) count + winrates                                   |                 | lichessCp                                                                             |
| colour                                                          |                | lichessGames(2000 Classical) count + winrates                                   |                 | chessdbCp                                                                             |
| chessdbEval:<br>top 10 moves (if impossible, then max possible) |                | lichessGames(2500 Rapid) count + winrates                                       |                 | lichessEngineRank                                                                     |
|                                                                 |                | lichessGames(2500 Classical) count + winrates                                   |                 | chessdbEngineRank                                                                     |
|                                                                 |                | mastersGames count + winrates                                                   |                 | mastersRank                                                                           |
|                                                                 |                | totalAmateur LichessGames(1600-2000 Rapid/Classical) + winrates                 |                 | lichessPlayersRank                                                                    |
|                                                                 |                | totalLichessGames(2500 Rapid+Classical) + winrates                              |                 | lichessMate                                                                           |
|                                                                 |                | totalWeightedGames (masters+Lichess 2500Rapid/Classical) +totalWeightedWinrates |                 | chessdbMate                                                                           |
|                                                                 |                | Lichess 1600 Rapid rank                                                         |                 | mastersGames / mastersWin / mastersDraw / mastersLoss                                 |
|                                                                 |                | Lichess 1800 Rapid rank                                                         |                 | lichessGames (Rapid 2500) / lichessWin / lichessDraw / lichessLoss                    |
|                                                                 |                | Lichess 2000 Rapid rank                                                         |                 | lichessGames (Classical 2500) / lichessWin / lichessDraw / lichessLoss                |
|                                                                 |                | Lichess 1600 Classical rank                                                     |                 | lichessGames (total 2500: Rapid + Classical) / lichessWin / lichessDraw / lichessLoss |
|                                                                 |                | Lichess 1800 Classical rank                                                     |                 |                                                                                       |
|                                                                 |                | Lichess 2000 Classical rank                                                     |                 |                                                                                       |
|                                                                 |                | masters rank                                                                    |                 |                                                                                       |
|                                                                 |                | lichessCp                                                                       |                 |                                                                                       |
|                                                                 |                | lichessEngine rank                                                              |                 |                                                                                       |
|                                                                 |                | lichessEval: top 10 moves (if impossible, then max possible)                    |                 |                                                                                       |







Let's discuss.





