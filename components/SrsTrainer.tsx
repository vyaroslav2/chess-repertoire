"use client";

import React, { useState, useEffect, useRef } from "react";
import Chessground from "@react-chess/chessground";
import "chessground/assets/chessground.base.css";
import { Chess } from "chess.js";
import { updateSrsStats } from "../app/actions";
import LichessMoveList from "./LichessMoveList";

interface SrsTrainerProps {
  dueStats: any[];
}

type TestStatus = "idle" | "wrong" | "correct" | "revealed";

export default function SrsTrainer({ dueStats }: SrsTrainerProps) {
  const [stats, setStats] = useState(dueStats);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // The state machine
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [chess] = useState(new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [lastMove, setLastMove] = useState<[string, string] | undefined>();

  // Browsing state
  const [currentPlyIndex, setCurrentPlyIndex] = useState(-1);

  // Sound ref
  const moveSoundRef = useRef<HTMLAudioElement | null>(null);

  const currentStat = stats[currentIndex];
  const lineMoves: string[] = currentStat?.lineMoves || [];
  const targetPlyIndex = lineMoves.length; // The ply they are supposed to guess from (after opponent's move)

  // Derived lock state
  const isBrowsing = currentPlyIndex !== targetPlyIndex;
  const isLocked = testStatus !== 'idle' || isBrowsing;

  useEffect(() => {
    // Initialize audio
    moveSoundRef.current = new Audio("https://lichess1.org/assets/sound/standard/Move.mp3");
  }, []);

  const playSound = () => {
    if (moveSoundRef.current) {
      moveSoundRef.current.currentTime = 0;
      moveSoundRef.current.play().catch(e => console.error("Audio play failed:", e));
    }
  };

  // 1. Loading & Animation Sequence
  useEffect(() => {
    if (!currentStat) return;
    
    if (lineMoves.length === 0) {
      // First move of the game, no opponent move to animate
      chess.reset();
      setFen(chess.fen());
      setLastMove(undefined);
      setTestStatus("idle");
      setCurrentPlyIndex(0);
      return;
    }

    // Set board to position before opponent's move
    chess.reset();
    for (let i = 0; i < lineMoves.length - 1; i++) {
      chess.move(lineMoves[i]);
    }
    setFen(chess.fen());
    setLastMove(undefined);
    setTestStatus("idle");
    setCurrentPlyIndex(lineMoves.length - 1); // Before opponent's move

    // Wait 400ms, then animate opponent's move
    const timer = setTimeout(() => {
      const opponentSan = lineMoves[lineMoves.length - 1];
      const move = chess.move(opponentSan);
      if (move) {
        setFen(chess.fen());
        setLastMove([move.from, move.to]);
        setCurrentPlyIndex(lineMoves.length); // At target position
        playSound();
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [currentStat, chess]);

  // Browsing Effect
  useEffect(() => {
    if (!currentStat) return;
    if (currentPlyIndex === targetPlyIndex) return; // Handled by loading/testing logic
    if (currentPlyIndex < 0) return;

    // Rebuild board to currentPlyIndex
    const tempChess = new Chess();
    let lm: [string, string] | undefined = undefined;
    
    // The total available moves include the lineMoves + the user's correct/wrong move if they made one
    const allMoves = [...lineMoves];
    if (testStatus === "correct" || testStatus === "revealed") {
      allMoves.push(currentStat.targetMove.san);
    } else if (testStatus === "wrong" && lastMove) {
      // We don't easily have the SAN of the wrong move, but we can reconstruct it from the FEN history if needed.
      // For simplicity, we just won't let them browse forward into the wrong move.
    }

    for (let i = 0; i < currentPlyIndex; i++) {
      if (allMoves[i]) {
        const m = tempChess.move(allMoves[i]);
        if (m) lm = [m.from, m.to];
      }
    }
    setFen(tempChess.fen());
    setLastMove(lm);
  }, [currentPlyIndex, currentStat, testStatus, targetPlyIndex, lineMoves]);

  // Keyboard Controller
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentStat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Enter (Reveal)
      if (e.key === "Enter") {
        if (testStatus === "idle" || testStatus === "wrong") {
          const move = chess.move(currentStat.targetMove.san);
          if (move) {
            setFen(chess.fen());
            setLastMove([move.from, move.to]);
            setTestStatus("revealed");
            playSound();
          }
        }
      }

      // 1, 2, 3, 4 (Grade)
      if (["1", "2", "3", "4"].includes(e.key)) {
        // Map 1-4 to 0-3 quality
        const quality = parseInt(e.key) - 1;
        handleRate(quality);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStat, testStatus, chess]);

  if (!currentStat) {
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "50px" }}>
        <h2 style={{ fontSize: "2rem", color: "var(--lichess-green)" }}>You're all caught up!</h2>
        <p style={{ fontSize: "1.1rem", marginTop: "10px", color: "var(--lichess-text-muted)" }}>
          No more positions due for review.
        </p>
      </div>
    );
  }

  const calcTurnColor = () => (chess.turn() === "w" ? "white" : "black");
  const orientation = currentStat.repertoire.color.toLowerCase() === "black" ? "black" : "white";

  const calcMovable = () => {
    // Only allow moves if we are idle or wrong (let them try again)
    if (testStatus === "correct" || testStatus === "revealed") {
      return { free: false, color: undefined, dests: new Map() };
    }

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
    if (testStatus === "correct" || testStatus === "revealed") return;

    try {
      const move = chess.move({ from, to, promotion: "q" });
      if (move) {
        playSound();
        
        if (move.san === currentStat.targetMove.san) {
          setFen(chess.fen());
          setLastMove([from, to]);
          setTestStatus("correct");
        } else {
          // Wrong move
          setFen(chess.fen());
          setLastMove([from, to]);
          setTestStatus("wrong");
          
          // Snap back after a short delay
          setTimeout(() => {
            chess.undo();
            setFen(chess.fen());
            
            // Restore opponent's last move highlight
            const lineMoves = currentStat.lineMoves || [];
            if (lineMoves.length > 0) {
              const prevChess = new Chess();
              for (let i = 0; i < lineMoves.length; i++) {
                prevChess.move(lineMoves[i]);
              }
              const history = prevChess.history({ verbose: true });
              const last = history[history.length - 1];
              setLastMove([last.from, last.to]);
            } else {
              setLastMove(undefined);
            }
          }, 500);
        }
      }
    } catch (e) {
      console.warn("Invalid move", e);
    }
  };

  const handleRate = async (quality: number) => {
    setCurrentIndex(prev => prev + 1);
    await updateSrsStats(currentStat.id, quality);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", position: "relative" }}>
      
      {/* Absolute Banners */}
      {testStatus === "wrong" && (
        <div style={{ position: "absolute", top: -60, background: "#c62828", color: "white", padding: "10px 20px", borderRadius: "4px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)", zIndex: 10 }}>
          Incorrect move. Try again, or press Enter to reveal.
        </div>
      )}
      {testStatus === "correct" && (
        <div style={{ position: "absolute", top: -60, background: "var(--lichess-green)", color: "white", padding: "10px 20px", borderRadius: "4px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)", zIndex: 10 }}>
          Correct! Rate how easy it was (1-4).
        </div>
      )}
      {testStatus === "revealed" && (
        <div style={{ position: "absolute", top: -60, background: "#f9a825", color: "black", padding: "10px 20px", borderRadius: "4px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)", zIndex: 10 }}>
          Revealed. Press 1 to rate as 'Again'.
        </div>
      )}

      <div style={{ color: "var(--lichess-text-bright)", textAlign: "center" }}>
        <h2>Reviewing: {currentStat.repertoire.title}</h2>
        <p style={{ color: "var(--lichess-text-muted)" }}>
          Position {currentIndex + 1} of {stats.length}
        </p>
      </div>

      <div style={{ 
        display: "flex", 
        alignItems: "flex-start", 
        justifyContent: "center", 
        width: "max-content",
        height: "560px",
        margin: "0 auto",
      }}>
        <div className={`cg-board-newspaper piece-set-merida ${testStatus !== 'idle' ? 'board-locked' : ''}`} style={{ width: "560px", height: "560px", boxShadow: "var(--glass-shadow)" }}>
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

        {/* Move List Side Panel */}
        <div style={{ 
          width: "188px", 
          height: "560px", 
          overflow: "hidden",
          backgroundColor: "var(--lichess-panel-bg)",
          boxShadow: "-4px 0 0 0 var(--lichess-panel-bg)"
        }}>
          <LichessMoveList 
            moves={(currentStat?.lineMoves || []).concat(testStatus === 'correct' || testStatus === 'revealed' || testStatus === 'wrong' ? [
              testStatus === 'wrong' && lastMove ? chess.history()[chess.history().length-1] : currentStat.targetMove.san
            ] : [])} 
            currentPlyIndex={currentPlyIndex - 1} // LichessMoveList index is 0-based for the first move. Our currentPlyIndex is the number of plies (0 means start, 1 means after white's first move). LichessMoveList currentPlyIndex: -1 means start, 0 means white's first move. So they are off by 1!
            onMoveClick={(index) => setCurrentPlyIndex(index + 1)} 
          />
        </div>
      </div>

      <div style={{ minHeight: "80px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
        {(testStatus === "correct" || testStatus === "revealed") ? (
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn btn-again" onClick={() => handleRate(0)}>Again (1)</button>
            <button className="btn btn-hard" onClick={() => handleRate(1)}>Hard (2)</button>
            <button className="btn btn-good" onClick={() => handleRate(2)}>Good (3)</button>
            <button className="btn btn-easy" onClick={() => handleRate(3)}>Easy (4)</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "10px" }}>
             <button className="btn btn-lichess-secondary" onClick={() => {
                const move = chess.move(currentStat.targetMove.san);
                if (move) {
                  setFen(chess.fen());
                  setLastMove([move.from, move.to]);
                  setTestStatus("revealed");
                  playSound();
                }
             }}>Reveal (Enter)</button>
          </div>
        )}
      </div>
    </div>
  );
}
