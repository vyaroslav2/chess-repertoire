---
tags:
  - deferred
---
# JT — Join the tree

JT lets Black choose a move that leads into a position the tree already has, even when Stockfish prefers another move. It may cost up to 30 cp. The aim is a consistent repertoire: fewer new positions to learn, and more lines that end up in the 1. e4 c6 and 1. d4 d5 trees. Draft, 2026-11-06. Nothing is built yet.

## Why

JT.01 **Today Black never aims for a transposition.** Black's move is hardcoded ([[EW|EW.13]]), Stockfish's top move ([[EW|EW.09]]), or the selector's ([[HEG]]). A transposition only happens by chance. Then the second route points to the first ([[HM|HM.07]]).

JT.02 **It costs little.** A test on 2026-11-06 (Stockfish 19, 200M nodes) compared e5 with the move that heads for the main trees:

| White | e5 | Joining move | Loss |
| --- | --- | --- | --- |
| 1. c4 | +0.14 | c6 +0.22 | 8 cp |
| 1. g3 | +0.08 | d5 +0.06 | −2 cp |
| 1. b3 | 0.00 | d5 0.00 | 0 cp |
| 1. b4 | −0.14 | d5 −0.03 | 11 cp |

## Decided 2026-11-06

JT.03 These answers came from the user:
* **Any move**, not just Black's first.
* **Up to 30 cp**, the same as the selector's limit. The positions it joins are already in the tree, so they are known to be safe.
* **Join any position in the tree**, but prefer the 1. e4 c6 and 1. d4 d5 trees.
* **Look more than one White move ahead.**
* **JT wins over the selector.** A consistent tree matters more than a small gain in score.

## The join value

JT.10 **What counts as the tree.** A position owned by a node ([[DB|DB.36]]), with either side to move. Not counted: a node that ended as too rare ([[HM.excalidraw|HM.21]]) or as game over. A too-rare node has no moves under it, so joining it gains nothing.

JT.11 **Main and other.** A position is **main** if the route of the node that owns it starts with a line in `hardcodedBlackResponses`. Any other counted position is **other**. A main position is worth 1. An other position is worth `joinOtherWeight` (JT.31).

JT.12 **The join value of a position**, looking `joinDepth` White moves ahead. Write J(P, d) for a position P with White to move and d White moves left:
* P is in the tree: its worth (JT.11).
* d = 0: 0.
* Otherwise: the sum, over White's moves w at P, of w's Explorer share times B(P + w, d − 1).

B(Q, d) is for a position Q with Black to move:
* Q is in the tree: its worth.
* d = 0: 0.
* Otherwise: the best J(Q + b, d) over Black's legal moves b.

White's shares are Explorer's, as in [[HM]] (`explorerSpeeds`, `explorerRatings`). A move Explorer doesn't list counts 0.

JT.13 **Examples**, with `joinDepth` 2:
* 1. c4 c6. White's 2. e4 reaches 1. e4 c6 2. c4, which is main. So J includes 2. e4's share × 1.
* 1. c4 c6 2. d4 d5 does not join. After 1. d4 d5 2. c4 the tree plays e6, not c6.
* 1. c4 e6 2. Nc3 d5 3. d4 reaches 1. d4 d5 2. c4 e6 3. Nc3. That takes two White moves, so it needs `joinDepth` 2.

JT.14 **The value is a best case.** B takes Black's best move with no eval check. When the route really reaches that position later, JT runs again there, with the cp check (JT.21). If that check fails, the join doesn't happen.

## The choice

JT.20 **Where it hooks in: [[EW]], after the hardcoded check and before the selector.**
* A hardcoded move (EW.13) wins. JT doesn't run.
* Otherwise EW.09's top move is the **champion**. JT judges the other legal moves against it (JT.21).
* A JT switch: the selector doesn't run. Record `selectionMethod = Join`, `moveOrigin = Join Move`.
* No switch: the selector runs as today ([[HEG|HEG.10]]).

JT.21 **The steps for one position:**
1. The champion's join value, J(position after the champion, `joinDepth`).
2. The same for each other legal move. Cheap first: JT.40.
3. Keep the moves whose join value beats the champion's by at least `joinMinGain`.
4. Best join value first: measure its cp loss against the champion at 200M nodes, as the selector does ([[HEG|HEG.32]]). It must be within `joinCpLimit`, and within what the line budget has left ([[HEG|HEG.31]]).
5. The first move that passes is Black's move. A near-tie in join value (within `joinNearTie`) goes to the better eval.

JT.22 **What follows** is built like any other line ([[S3]]). If the move reaches a position the tree already owns, HM.07's transposition check sends the route there, as today.

## Order

JT.30 **The problem.** Today, when a position comes off the queue, HM fetches White's moves and EW picks Black's reply to each one at once ([[HM.excalidraw|HM.36]]). So all of White's first moves get their replies before any subtree is built. When 1. c4 gets its reply, the 1. e4 and 1. d4 trees don't exist yet. The same happens at every depth: after 1. d4 d5, 2. Nf3 gets its reply before the 2. c4 subtree is built.

JT.30a **Proposed fix: choose Black's reply when the position comes off the queue.** HM puts the position after White's move on the queue, and EW runs when it comes off. The queue is LIFO ([[S3|S3.09]]) and the most played move is taken first. So the tree is built depth first: 1. e4 and all of its subtree, then 1. d4 and all of its subtree, then 1. c4. By the time 1. c4 gets its reply, both main trees are built. Inside a tree, 2. c4's subtree is built before 2. Nf3 gets its reply.
* This changes S3, HM.36 and the order of the log ([[TGL]]).
* A transposition between siblings still works: the first to be built owns the position.

JT.30b **What the fix can't do.** A route can only join what was built before it. 1. e4 is built before 1. d4, so a line under 1. e4 can't join the 1. d4 tree. For example, the Panov (1. e4 c6 2. d4 d5 3. exd5 cxd5 4. c4) leads to 1. d4 positions. A second pass could fix that later. It is left out for now.

## The dials

JT.31 **Settings**, added to [[generation-config]]:

| Setting | Proposed | Notes |
| --- | --- | --- |
| `joinTree` | on / off | Off: the tree is built as today. |
| `joinDepth` | 2 | White moves ahead (JT.12). 2 finds 1. c4 e6 2. Nc3 d5 3. d4. |
| `joinCpLimit` | 30 cp | Decided (JT.03). Measured at 200M. |
| `joinMinGain` | 0.10 | The join value must beat the champion's by this much (10% of White's games). |
| `joinOtherWeight` | 0.5 | What a non-main position is worth (JT.11). |
| `joinNearTie` | 0.02 | JT.21 step 5. |

## Cost

JT.40 **Search the tree before calling Explorer.** First find, in memory, whether any legal White moves (and Black replies) can reach a counted position within `joinDepth`. Only those paths need Explorer's shares. Most moves reach nothing and cost no call. The tree's positions are kept in memory as a set of position keys.

JT.41 **Engine searches.** Only for moves that pass JT.21 step 3, best first, stopping at the first that passes. Most positions need none.

JT.42 **Unknown so far:** the in-memory search at `joinDepth` 2 is about 30 × 30 × 30 positions per candidate move. It needs measuring before the default is fixed (JT.90).

## Record and log

JT.50 **Recorded on the move** ([[DB|DB.14]]): what JT judged, as the selector does ([[HEG|HEG.40]]). The champion's join value, and for each move kept at step 3: its join value, the position it aims for, its cp loss and its verdict.

JT.51 **In the tree log** ([[TGL]]): a join table under the position, like the selector's table.

## Before building

JT.90 **Test it on the current tree first.** A script, read-only, over the stored tree. For each Black reply, compute JT.21 steps 1–3 against the tree as it stands. Report:
* how many replies JT would change, and to what;
* how many Explorer calls and engine searches it would need;
* how long the in-memory search takes at `joinDepth` 1, 2 and 3.

This fixes the defaults in JT.31 before the generator changes.

## Open questions

JT.91 **The order fix** (JT.30a), or another way?

JT.92 **Main first or weighted?** JT.11 gives other positions half the worth of main ones. The other choice is strict: any main join beats any other join. Strict means a 1% chance to join the main tree beats a 60% chance to join another line.

JT.93 **Count the join's cp against the line budget?** JT.21 says yes, as a selector switch does. Then two joins in one line could use up the budget.
