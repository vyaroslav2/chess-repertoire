"use client";

import React, { useState, useEffect } from "react";
import Chessground from "@react-chess/chessground";
import "chessground/assets/chessground.base.css";
import { Chess } from "chess.js";
import { updateSrsStats } from "../app/actions";

interface SrsTrainerProps {
  dueStats: any[];
}

export default function SrsTrainer({ dueStats }: SrsTrainerProps) {
  const [stats, setStats] = useState(dueStats);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chess] = useState(new Chess());
  const [fen, setFen] = useState("");
  const [lastMove, setLastMove] = useState<[string, string] | undefined>();
  
  // State machine: 'waiting', 'success', 'failed'
  const [state, setState] = useState<'waiting' | 'success' | 'failed'>('waiting');

  const currentStat = stats[currentIndex];

  useEffect(() => {
    if (currentStat) {
      chess.load(currentStat.position.fen);
      setFen(chess.fen());
      
      // We don't have the last move that led to this position easily available
      // from just the FEN, so we clear it. The user will see the position as-is.
      setLastMove(undefined); 
      setState('waiting');
    }
  }, [currentStat, chess]);

  if (!currentStat) {
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "50px" }}>
        <h2 style={{ fontSize: "2rem", color: "var(--lichess-green)" }}>You're all caught up!</h2>
        <p style={{ fontSize: "1.1rem", marginTop: "10px", color: "var(--lichess-text-muted)" }}>
          No more positions due for review. Check back later!
        </p>
      </div>
    );
  }

  const calcTurnColor = () => (chess.turn() === "w" ? "white" : "black");
  
  const calcMovable = () => {
    if (state !== 'waiting') return { free: false, color: undefined, dests: new Map() };

    const dests = new Map();
    chess.moves({ verbose: true }).forEach((m) => {
      dests.set(m.from, dests.get(m.from) ? dests.get(m.from).concat(m.to) : [m.to]);
    });
    return {
      free: false,
      color: calcTurnColor(),
      dests,
      showDests: true,
    };
  };

  const handleMove = (from: string, to: string) => {
    if (state !== 'waiting') return;

    try {
      const move = chess.move({ from, to, promotion: "q" });
      if (move) {
        setFen(chess.fen());
        setLastMove([from, to]);
        
        // Validate against target move
        if (move.san === currentStat.targetMove.san) {
          setState('success');
        } else {
          // Failed! Snap back and play correct move automatically
          setState('failed');
          setTimeout(() => {
            chess.load(currentStat.position.fen);
            const correctMove = chess.move(currentStat.targetMove.san);
            if (correctMove) {
              setFen(chess.fen());
              setLastMove([correctMove.from, correctMove.to]);
            }
          }, 500); // Half second delay to let them register their mistake
        }
      }
    } catch (e) {
      console.warn("Invalid move", e);
    }
  };

  const handleRate = async (quality: number) => {
    // Optimistically move to next
    setCurrentIndex(prev => prev + 1);
    
    // Update DB in background
    await updateSrsStats(currentStat.id, quality);
  };

  // If the repertoire is for black, we flip the board so Black is on the bottom.
  const orientation = currentStat.repertoire.color.toLowerCase() === "black" ? "black" : "white"; 

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
      <div style={{ color: "var(--lichess-text-bright)", textAlign: "center" }}>
        <h2>Reviewing: {currentStat.repertoire.title}</h2>
        <p style={{ color: "var(--lichess-text-muted)" }}>
          Position {currentIndex + 1} of {stats.length}
        </p>
      </div>

      <div className="cg-board-newspaper piece-set-merida" style={{ width: "560px", height: "560px", boxShadow: "var(--glass-shadow)" }}>
        <Chessground
          width="100%"
          height="100%"
          config={{
            fen: fen,
            orientation: orientation,
            turnColor: calcTurnColor(),
            lastMove: lastMove,
            highlight: { lastMove: true, check: true },
            drawable: { enabled: true, visible: true },
            coordinates: true,
            animation: { enabled: true, duration: 200 },
            movable: {
              ...calcMovable(),
              events: {
                after: handleMove,
              },
            },
          }}
        />
      </div>

      <div style={{ minHeight: "80px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
        {state === 'waiting' && (
          <h3 style={{ color: "var(--lichess-text-bright)" }}>What is the best move?</h3>
        )}

        {state === 'failed' && (
          <>
            <h3 style={{ color: "#e57373" }}>Incorrect! The right move was {currentStat.targetMove.san}.</h3>
            <div style={{ display: "flex", gap: "10px" }}>
              <button className="btn btn-again" onClick={() => handleRate(0)}>Again</button>
            </div>
          </>
        )}

        {state === 'success' && (
          <>
            <h3 style={{ color: "var(--lichess-green)" }}>Correct! ({currentStat.targetMove.san})</h3>
            <div style={{ display: "flex", gap: "10px" }}>
              <button className="btn btn-again" onClick={() => handleRate(0)}>Again (0d)</button>
              <button className="btn btn-hard" onClick={() => handleRate(1)}>Hard</button>
              <button className="btn btn-good" onClick={() => handleRate(2)}>Good</button>
              <button className="btn btn-easy" onClick={() => handleRate(3)}>Easy</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
