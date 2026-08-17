---
aliases:
  - nodes
  - repertoire node
  - tree node
tags:
  - glossary
---
 **Node** — one position in the repertoire tree, identified by the exact move sequence that reached it. The same board reached by a different move order is a different node. Holds the position, the move history, the cumulative probability, and the trap and threat flags. See DB and RM. 
 
 Not "a position on the board". The same board arrangement reached by two different move orders is two separate nodes, because the move history differs. That's the key point, and it's what makes the tree a tree rather than a web: each node has one path leading into it, and the branches leading out are the moves you cover from there.
   
Two things the word is easy to confuse with:

- A node is not a move. Moves are the arrows between nodes. A node with three White moves covered has three moves leading out of it, each pointing at another node.

- A node is not a cached position. The cache stores one entry per position, shared across every node that reaches it — that's where the human game statistics and engine scores live, so the same position reached three ways is fetched once but is still three nodes. 

The DB diagram shows what a node holds, RM shows how one is created and looked up, and A1's queue is a queue of nodes waiting to be expanded.
   