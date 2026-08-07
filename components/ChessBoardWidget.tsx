"use client";

import React, { useState, useEffect } from "react";
import Chessground from "@react-chess/chessground";
import "chessground/assets/chessground.base.css";
import { Chess } from "chess.js";

interface ChessBoardWidgetProps {
  initialFen?: string;
  pgn?: string;
  pieceSet?: "cburnett" | "staunty" | "alpha" | "merida";
  onMove?: (move: string, fen: string) => void;
}

export default function ChessBoardWidget({ initialFen, pgn, pieceSet = "merida", onMove }: ChessBoardWidgetProps) {
  const [chess] = useState(new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [lastMove, setLastMove] = useState<[string, string] | undefined>();
  
  // State for PGN navigation
  const [moveHistory, setMoveHistory] = useState<any[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);

  useEffect(() => {
    if (pgn) {
      // Load the PGN to extract the sequence of moves
      chess.loadPgn(pgn);
      const history = chess.history({ verbose: true });
      setMoveHistory(history);
      
      // Reset to starting position to allow stepping forward
      chess.reset();
      setFen(chess.fen());
      setLastMove(undefined);
      setCurrentMoveIndex(0);
    } else if (initialFen) {
      chess.load(initialFen);
      setFen(chess.fen());
      setMoveHistory([]);
      setCurrentMoveIndex(0);
      setLastMove(undefined);
    }
  }, [initialFen, pgn, chess]);

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        setCurrentMoveIndex((prev) => {
          if (prev < moveHistory.length) {
            const nextMove = moveHistory[prev];
            try {
              chess.move(nextMove.san);
              setFen(chess.fen());
              setLastMove([nextMove.from, nextMove.to]);
              return prev + 1;
            } catch (err) {
              console.error("Move error:", err);
            }
          }
          return prev;
        });
      } else if (e.key === "ArrowLeft") {
        setCurrentMoveIndex((prev) => {
          if (prev > 0) {
            const undone = chess.undo();
            setFen(chess.fen());
            
            // Re-calculate last move based on the move before the undone one
            if (prev > 1) {
              const prevMove = moveHistory[prev - 2];
              setLastMove([prevMove.from, prevMove.to]);
            } else {
              setLastMove(undefined);
            }
            return prev - 1;
          }
          return prev;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveHistory, chess]);

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
