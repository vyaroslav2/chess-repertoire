---
tags:
  - reviewed
---
### Can we avoid a score?

No. To rank moves, we must turn W/D/L into one number. So we must choose a formula.

### Options

1. **Points per game:** `(wins + 0.5 × draws) / games`
   The standard chess score: 1 for a win, ½ for a draw, 0 for a loss. Elo uses the same score, so it matches the goal of gaining rating.
2. **Wins only:** `wins / games`
   A draw counts the same as a loss: zero. So it will swap any number of draws for losses to gain one win.
   Example: move A has 10 games, all draws, and scores 0%. Move B has 10 games, 1 win and 9 losses, and scores 10%. Wins only picks B, although A earns 5 points and B earns 1.
   Use it only if a draw is worthless to you, as in a must-win game. It may favour sharp lines.[^1]
3. **Wins over decisive games:** `wins / (wins + losses)`
   Measures the share of decisive games won. Useful alongside the draw rate[^2], but unsuitable by itself for ranking expected points or rating gain. For example, 1 win and 99 draws gives 100%, although it earns only 50.5% of the available points. With no decisive games, it is undefined.

| Results over 100 games         | Wins over decisive games | Points per game |
| ------------------------------ | ------------------------ | --------------- |
| A: 1 win, 99 draws, 0 losses   | **100%**                 | 50.5%           |
| B: 60 wins, 0 draws, 40 losses | 60%                      | **60%**         |
Option 3 picks A, although B earns more points per game. Also, A’s 100% comes from one decisive result; the 99 draws provide no additional evidence about its win/loss balance. 

   
4. **Weighted draws:** `(wins + d × draws) / games`
   Draws get their own weight `d`, from 0 to 1.
   - `d = 0.5` → neutral. Same as option 1.
   - `d < 0.5` → prefer sharp lines with more winning chances.[^1]
   - `d > 0.5` → prefer solid, safe lines.
   - `d = 0` → same as option 2.

### 100% draws vs 50% wins and 50% losses

Both give 0.5 points per game, so on average they are equal. Only the spread differs:

- All draws: every game gives 0.5. No surprises.
- 50/50: each game gives 1 or 0. Big swings.

Against comparable opponents, both patterns have the same expected score and expected immediate rating change. 

Spread matters particularly for short goals: one event, a fixed target (for example, a draw is enough to qualify), or "must not lose today". 

50% wins / 50% losses is riskier in terms of variability, despite having the same expected score as all draws. The difference in variability can take effect over longer periods.

Whether you prefer that risk is personal. That is taste, not maths. 

### Decision

The project uses points per game (option 1) as the raw score: `rawScore = (wins + 0.5 × draws) / games`. Other scores build on it.

### Problems with the current score

The current score ([[EW|EW.04]]) is option 1 with shrinkage:

`(wins + 0.5 × draws + anchorGames × repertoireSidePrior) / (games + anchorGames)`

with `anchorGames = 50` and `repertoireSidePrior = 48%`. All counts are weighted games.

1. **Small samples.** Three games with three wins scores 100%. A raw score cannot tell that from 1000 games at 100%. Shrinkage fixes most of this. It pulls a score towards an average (the prior). The fewer the games, the stronger the pull. It works like adding 50 imaginary games at 48%:
   - 3 wins from 3 games: (3 + 24) / (3 + 50) ≈ 51%, not 100%.
   - 1000 wins from 1000 games: (1000 + 24) / (1000 + 50) ≈ 97.5%. Big samples barely move.
1. **Minimum number of games.** `minimumWeightedGames = 15` is a cliff. And the number is a guess. At 14 games, the move is excluded. At 15, it becomes eligible, but its score is still **23% observed results + 77% prior**. 
2. **Static `anchorGames`.** 50 is a guess.
3. **Static `prior`.** Every move starts at 48%, whatever its eval. So a bad move with few games gets lifted towards 48%. Example: Nd7 (3 games, 33%) scores 47.2% and beats Bg7 (142 games, 44%), which scores 45.0%.


 

[^1]: An assumption. Many decisive games do not prove a line is sharp.



[^2]: Together, they show how often games end decisively and who tends to win when they do. 
	
	`drawRate = draws / games`
	
	For example, two moves can both score 55%:
	
	- 55% wins, 45% losses: decisive `winRate` 55%, `drawRate` 0%.
	- 15% wins, 80% draws, 5% losses: decisive `winRate` 75%, `drawRate` 80%.
	
	It matters when a win or avoiding a loss matters more than average points:
	
	- Must win: prefer the first move: 55% wins versus 15%.
	- A draw is enough: prefer the second: 5% losses versus 45%.
