"use client";

import React, { useState, useEffect } from "react";
import Chessground from "@react-chess/chessground";
import "chessground/assets/chessground.base.css";
import { Chess } from "chess.js";
import LichessMoveList from "./LichessMoveList";

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

  const handleMoveClick = (index: number) => {
    if (index === -1) {
       chess.reset();
       setFen(chess.fen());
       setLastMove(undefined);
       setCurrentMoveIndex(0);
       return;
    }
    
    // Replay moves up to the desired index
    chess.reset();
    let lastM: [string, string] | undefined = undefined;
    for (let i = 0; i <= index; i++) {
       const m = moveHistory[i];
       if (m) {
         chess.move(m.san);
         lastM = [m.from, m.to];
       }
    }
    setFen(chess.fen());
    setLastMove(lastM);
    setCurrentMoveIndex(index + 1);
  };

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
    <div style={{ display: "flex", gap: "0px", alignItems: "flex-start", justifyContent: "center", width: "100%" }}>
      <div className={`cg-board-newspaper piece-set-${pieceSet}`} style={{ width: "560px", height: "560px" }}>
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

      {pgn && (
        <div style={{ 
          width: "188px", 
          height: "560px", 
          overflow: "hidden", 
          borderRadius: "0px", 
          /*border: "1px solid var(--lichess-border)",*/ 
          borderLeft: "none"
        }}>
          <LichessMoveList 
            moves={moveHistory.map(m => m.san)} 
            currentPlyIndex={currentMoveIndex - 1} 
            onMoveClick={handleMoveClick} 
          />
        </div>
      )}
    </div>
  );
}
