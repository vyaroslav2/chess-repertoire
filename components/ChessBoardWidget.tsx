"use client";

import React, { useState, useEffect } from "react";
import Chessground from "@react-chess/chessground";
import "chessground/assets/chessground.base.css";
import { Chess } from "chess.js";

interface ChessBoardWidgetProps {
  initialFen?: string;
  pieceSet?: "cburnett" | "staunty" | "alpha" | "merida";
  onMove?: (move: string, fen: string) => void;
}

export default function ChessBoardWidget({ initialFen, pieceSet = "cburnett", onMove }: ChessBoardWidgetProps) {
  const [chess] = useState(initialFen ? new Chess(initialFen) : new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [lastMove, setLastMove] = useState<[string, string] | undefined>();

  useEffect(() => {
    if (initialFen) {
      chess.load(initialFen);
      setFen(chess.fen());
    }
  }, [initialFen, chess]);

  const calcTurnColor = () => (chess.turn() === "w" ? "white" : "black");
  
  const calcMovable = () => {
    const dests = new Map();
    chess.moves({ verbose: true }).forEach((m) => {
      dests.set(m.from, dests.get(m.from) ? dests.get(m.from).concat(m.to) : [m.to]);
    });
    return {
      free: false,
      dests,
      color: calcTurnColor(),
      showDests: true,
    };
  };

  const handleMove = (from: string, to: string) => {
    try {
      const move = chess.move({ from, to, promotion: "q" });
      if (move) {
        setFen(chess.fen());
        setLastMove([from, to]);
        if (onMove) {
          onMove(move.san, chess.fen());
        }
      }
    } catch (e) {
      console.warn("Invalid move", e);
    }
  };

  return (
    <div className={`cg-board-newspaper piece-set-${pieceSet}`} style={{ width: "560px", height: "560px", margin: "0 auto" }}>
      <Chessground
        width="100%"
        height="100%"
        config={{
          fen: fen,
          turnColor: calcTurnColor(),
          lastMove: lastMove,
          highlight: { lastMove: true, check: true },
          drawable: { enabled: true, visible: true },
          coordinates: true,
          animation: { enabled: true, duration: 200 },
          movable: {
            free: false,
            color: calcTurnColor(),
            dests: calcMovable().dests,
            showDests: true,
            events: {
              after: handleMove,
            },
          },
        }}
      />
    </div>
  );
}
