import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const stats = await prisma.repertoirePositionStat.findMany({
    include: {
      position: {
        include: { engineEvals: true, explorerMoves: true }
      },
      targetMove: true
    }
  });

  const allMoves = await prisma.move.findMany();
  const incomingMoves = new Map<string, any>();
  for (const m of allMoves) {
    if (!incomingMoves.has(m.toPositionId)) {
      incomingMoves.set(m.toPositionId, m);
    }
  }

  // We need to fetch positions up the tree to get the PGN and meta
  const positionsMap = new Map<string, any>();
  const allPos = await prisma.position.findMany({ include: { engineEvals: true, explorerMoves: true } });
  for (const p of allPos) positionsMap.set(p.id, p);

  let lines: { 
    moves: any[], 
    positions: any[], 
    sanArray: string[], 
    explanation: string 
  }[] = [];

  for (const s of stats) {
    const movesList = [s.targetMove];
    const positionsList = [s.position];
    const sanList = [s.targetMove.san];

    let currPosId = s.positionId;
    const visited = new Set<string>();
    visited.add(currPosId);

    while (true) {
      const incoming = incomingMoves.get(currPosId);
      if (incoming) {
        movesList.unshift(incoming);
        sanList.unshift(incoming.san);
        const p = positionsMap.get(incoming.fromPositionId);
        if (p) positionsList.unshift(p);
        
        currPosId = incoming.fromPositionId;
        if (visited.has(currPosId)) break;
        visited.add(currPosId);
      } else {
        // Root position
        const root = positionsMap.get(currPosId);
        if (root && !positionsList.find(p => p.id === root.id)) positionsList.unshift(root);
        break;
      }
    }
    
    lines.push({ moves: movesList, positions: positionsList, sanArray: sanList, explanation: s.explanation || "" });
  }

  const caroLines = lines.filter(l => l.sanArray.join(" ").startsWith("e4 c6 d4 d5 e5"));
  caroLines.sort((a, b) => b.sanArray.length - a.sanArray.length);

  function formatLine(l: any) {
    // Generate PGN string
    let pgnParts = [];
    for (let i = 0; i < l.sanArray.length; i++) {
        if (i % 2 === 0) pgnParts.push(`${Math.floor(i/2) + 1}.`);
        pgnParts.push(l.sanArray[i]);
    }
    const pgn = pgnParts.join(" ");

    let out = "================================================================================\n";
    out += `LINE: ${l.sanArray.join(" ")}\n`;
    out += `PGN:  ${pgn}\n`;
    out += "================================================================================\n\n";

    // Loop through each ply and print details
    for (let i = 0; i < l.sanArray.length; i++) {
      const isWhite = i % 2 === 0;
      const move = l.moves[i];
      const pos = l.positions[i]; // Position BEFORE the move

      out += `[POSITION / FEN: ${pos?.fen || "Unknown"}]\n`;
      if (pos?.eco || pos?.openingName) {
        out += `ECO: ${pos.eco || "?"} | Opening: ${pos.openingName || "?"}\n`;
      }
      /*if (pos?.wikiText) {
         out += `Wiki: ${pos.wikiText}\n`;
      }*/
      out += `Threat/Trap: ${pos?.isTrap ? "1 (True)" : "0 (False)"}\n\n`;

      out += isWhite ? `--- WHITE'S MOVE ---\n` : `--- BLACK'S MOVE ---\n`;
      const plyNum = Math.floor(i/2) + 1;
      out += `${plyNum}${isWhite ? "." : "..."} ${move.san}\n`;

      if (isWhite) {
        out += `Probability: ${((move.prob||0)*100).toFixed(1)}% | Cumulative Prob: ${((move.cumulativeProb||0)*100).toFixed(1)}%\n`;
        out += `Levels: Lichess Rapid/Classical (1600-2000)\n`;
        out += `Games: ${move.lichessGames || 0} | Win/Draw/Loss: ${((move.lichessWin||0)*100).toFixed(0)}% / ${((move.lichessDraw||0)*100).toFixed(0)}% / ${((move.lichessLoss||0)*100).toFixed(0)}%\n\n`;
      } else {
        const mProb = move.mastersGames ? (move.mastersGames / Math.max(1, pos?.explorerMoves?.filter((em: any) => em.dbType === 'masters').reduce((sum: number, em: any) => sum + em.games, 0))) : 0;
        const lProb = move.lichessGames ? (move.lichessGames / Math.max(1, pos?.explorerMoves?.filter((em: any) => em.dbType === 'lichess').reduce((sum: number, em: any) => sum + em.games, 0))) : 0;
        out += `Probability: ${(mProb*100).toFixed(1)}% (Masters) / ${(lProb*100).toFixed(1)}% (Lichess 2500)\n`;
        out += `Games Played:\n`;
        out += ` - Masters: ${move.mastersGames || 0}\n`;
        out += ` - Weighted Masters: ${(move.mastersGames || 0) * 5}\n`;
        out += ` - Lichess: ${move.lichessGames || 0}\n`;
        out += ` - Total Weighted: ${move.weightedCount || 0}\n`;
        const lEval = move.lichessEval !== null ? move.lichessEval.toFixed(2) : "N/A";
        const cEval = move.chessdbEval !== null ? move.chessdbEval.toFixed(2) : "N/A";
        out += `Eval: Lichess ${lEval} / ChessDB ${cEval} | Win/Draw/Loss: ${((move.lichessWin||0)*100).toFixed(0)}% / ${((move.lichessDraw||0)*100).toFixed(0)}% / ${((move.lichessLoss||0)*100).toFixed(0)}%\n\n`;
      }

      // Engines
      if (pos?.engineEvals && pos.engineEvals.length > 0) {
        out += `--- ENGINE TOP MOVES ---\n`;
        pos.engineEvals.sort((a: any, b: any) => a.rank - b.rank).forEach((ev: any) => {
          out += `${ev.cp > 0 ? "+" : ""}${(ev.cp/100).toFixed(2)}  ${plyNum}${isWhite ? "." : "..."} ${ev.san}\n`;
        });
        out += "\n";
      }

      // Masters
      if (pos?.explorerMoves) {
        const m = pos.explorerMoves.filter((em: any) => em.dbType === "masters").sort((a: any, b: any) => a.rank - b.rank);
        if (m.length > 0) {
          out += `--- MASTERS MOVES ---\n`;
          out += `Move | Total Games | W / D / L (%)\n`;
          m.forEach((em: any) => {
            out += `${em.san.padEnd(4)} | ${em.games.toString().padStart(11)} | ${(em.win*100).toFixed(0)}% / ${(em.draw*100).toFixed(0)}% / ${(em.loss*100).toFixed(0)}%\n`;
          });
          out += "\n";
        }

        const l = pos.explorerMoves.filter((em: any) => em.dbType === "lichess").sort((a: any, b: any) => a.rank - b.rank);
        if (l.length > 0) {
          out += `--- LICHESS MOVES ---\n`;
          out += `Move | Total Games | W / D / L (%)\n`;
          l.forEach((em: any) => {
            out += `${em.san.padEnd(4)} | ${em.games.toString().padStart(11)} | ${(em.win*100).toFixed(0)}% / ${(em.draw*100).toFixed(0)}% / ${(em.loss*100).toFixed(0)}%\n`;
          });
          out += "\n";
        }
      }
    }
    return out;
  }

  const qgdLines = lines.filter(l => l.sanArray.join(" ").startsWith("d4 d5 c4"));
  qgdLines.sort((a, b) => b.sanArray.length - a.sanArray.length);

  console.log("=== ADVANCE CARO-KANN LINES (DEEPEST) ===\n");
  for (const l of caroLines.slice(0, 3)) {
    console.log(formatLine(l));
  }

  console.log("=== QUEEN'S GAMBIT LINES (DEEPEST) ===\n");
  for (const l of qgdLines.slice(0, 3)) {
    console.log(formatLine(l));
  }
}

main().finally(() => prisma.$disconnect());
