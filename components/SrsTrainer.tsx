"use client";

import React, { useState, useEffect, useRef } from "react";
import Chessground from "@react-chess/chessground";
import "chessground/assets/chessground.base.css";
import { Chess } from "chess.js";
import { updateSrsStats } from "../app/actions";
import LichessMoveList from "./LichessMoveList";
import { logFlightBox } from "../lib/logger";

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
  const [isInitializing, setIsInitializing] = useState(true);
  const isInitializingRef = useRef(true);
  const animTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sound ref
  const moveSoundRef = useRef<HTMLAudioElement | null>(null);

  const currentStat = stats[currentIndex];
  const lineMoves: string[] = currentStat?.lineMoves || [];
  const targetPlyIndex = lineMoves.length; // The ply they are supposed to guess from (after opponent's move)

  // Derived lock state
  const expectedPlyIndex = (testStatus === 'idle' || testStatus === 'wrong') ? targetPlyIndex : targetPlyIndex + 1;
  const isBrowsing = currentPlyIndex !== expectedPlyIndex;
  const isLocked = testStatus !== 'idle' || isBrowsing || isInitializing;

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

    logFlightBox("LOAD_CARD_START", { cardId: currentStat.id, lineMoves });

    if (animTimerRef.current) {
      clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }

    setIsInitializing(true);
    isInitializingRef.current = true;
    
    if (lineMoves.length === 0) {
      // First move of the game, no opponent move to animate
      chess.reset();
      setFen(chess.fen());
      setLastMove(undefined);
      setTestStatus("idle");
      setCurrentPlyIndex(0);
      setIsInitializing(false);
      isInitializingRef.current = false;
      logFlightBox("LOAD_CARD_END_IMMEDIATE", { fen: chess.fen(), currentPlyIndex: 0 });
      return;
    }

    // Start from the beginning to play out the full line as requested
    const tempChess = new Chess();
    setFen(tempChess.fen());
    chess.load(tempChess.fen());
    setLastMove(undefined);
    setTestStatus("idle");
    setCurrentPlyIndex(0);

    let step = 0;

    const playNextMove = () => {
      const startTime = performance.now();
      if (step < lineMoves.length) {
        const m = tempChess.move(lineMoves[step]);
        if (m) {
          setFen(tempChess.fen());
          chess.load(tempChess.fen()); // Sync main instance
          setLastMove([m.from, m.to]);
          setCurrentPlyIndex(step + 1);
          playSound();
          logFlightBox("ANIMATE_MOVE", { step, san: lineMoves[step], fen: tempChess.fen(), timeToExecute: performance.now() - startTime });
        } else {
          logFlightBox("ANIMATE_MOVE_FAIL", { step, san: lineMoves[step], fen: tempChess.fen() });
        }
        step++;
        animTimerRef.current = setTimeout(playNextMove, 400); // 400ms per ply animation
      } else {
        setIsInitializing(false); // Done playing out
        isInitializingRef.current = false;
        logFlightBox("LOAD_CARD_ANIMATION_COMPLETE", { finalFen: tempChess.fen() });
      }
    };

    animTimerRef.current = setTimeout(playNextMove, 800); // 800ms initial pause so they can orient themselves before the first ply animates

    return () => {
      if (animTimerRef.current) {
        clearTimeout(animTimerRef.current);
      }
    };
  }, [currentStat, chess]);

  // Browsing Effect
  useEffect(() => {
    if (!currentStat) return;
    if (currentPlyIndex < 0) return;
    if (isInitializingRef.current) return; // Prevent interference during the opening animation

    // Rebuild board to currentPlyIndex
    const startTime = performance.now();
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
    
    // Play sound if we browsed (visual check)
    if (fen !== tempChess.fen()) {
      playSound();
    }

    setFen(tempChess.fen());
    chess.load(tempChess.fen()); // Important: sync main chess instance so handleMove works correctly!
    setLastMove(lm);

    logFlightBox("BROWSING_EFFECT", { currentPlyIndex, newFen: tempChess.fen(), timeToExecute: performance.now() - startTime });
  }, [currentPlyIndex, currentStat, testStatus, targetPlyIndex, lineMoves]);

  // Keyboard Controller
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentStat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      logFlightBox("KEY_PRESS", { key: e.key, isInitializing: isInitializingRef.current, isBrowsing, testStatus });

      // Skip animation on any key press
      if (isInitializingRef.current) {
        if (animTimerRef.current) {
          clearTimeout(animTimerRef.current);
          animTimerRef.current = null;
        }
        setIsInitializing(false);
        isInitializingRef.current = false;
        
        logFlightBox("ANIMATION_SKIPPED", { keyTrigger: e.key });
        
        // Fast forward to the target position
        const tempChess = new Chess();
        let lm: [string, string] | undefined = undefined;
        for (let i = 0; i < lineMoves.length; i++) {
          const m = tempChess.move(lineMoves[i]);
          if (m) lm = [m.from, m.to];
        }
        setFen(tempChess.fen());
        chess.load(tempChess.fen());
        setLastMove(lm);
        setCurrentPlyIndex(lineMoves.length);
        return; // Consume the keypress so it doesn't trigger rating/reveal accidentally
      }

      // Enter (Reveal or Good)
      if (e.key === "Enter") {
        if (testStatus === "idle" || testStatus === "wrong") {
          // Reconstruct the safe target state before revealing, in case they were browsing
          const tempChess = new Chess();
          for (let i = 0; i < lineMoves.length; i++) {
            tempChess.move(lineMoves[i]);
          }
          try {
            const move = tempChess.move(currentStat.targetMove.san);
            if (move) {
              setFen(tempChess.fen());
              chess.load(tempChess.fen());
              setLastMove([move.from, move.to]);
              setTestStatus("revealed");
              setCurrentPlyIndex(targetPlyIndex + 1);
              playSound();
              logFlightBox("ACTION_REVEAL", { success: true, san: currentStat.targetMove.san });
            }
          } catch (err) {
            console.error("Reveal error:", err);
            logFlightBox("ACTION_REVEAL_ERROR", { san: currentStat.targetMove.san, error: String(err) });
          }
        } else if (testStatus === "correct" || testStatus === "revealed") {
          // Default Enter to "Good" (rating 2)
          logFlightBox("ACTION_RATE_DEFAULT_ENTER", { quality: 2 });
          handleRate(2);
        }
      }

      // 1, 2, 3, 4 (Grade)
      if (["1", "2", "3", "4"].includes(e.key) && testStatus !== "idle") {
        // Map 1-4 to 0-3 quality
        const quality = parseInt(e.key) - 1;
        logFlightBox("ACTION_RATE_KEY", { key: e.key, quality });
        handleRate(quality);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStat, testStatus, chess, isBrowsing, targetPlyIndex]);

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
    // Completely lock the board during browsing or initialization
    if (testStatus === "correct" || testStatus === "revealed" || isBrowsing || isInitializing) {
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
        logFlightBox("ACTION_USER_MOVE", { from, to, san: move.san, isCorrect: move.san === currentStat.targetMove.san });
        
        if (move.san === currentStat.targetMove.san) {
          setFen(chess.fen());
          setLastMove([from, to]);
          setTestStatus("correct");
          setCurrentPlyIndex(targetPlyIndex + 1);
        } else {
          // Wrong move
          setFen(chess.fen());
          setLastMove([from, to]);
          setTestStatus("wrong");
          setCurrentPlyIndex(targetPlyIndex + 1);
          
          // Snap back after a very short delay
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
            setCurrentPlyIndex(targetPlyIndex);
            logFlightBox("ACTION_USER_MOVE_SNAPBACK", {});
          }, 250);
        }
      }
    } catch (e) {
      logFlightBox("ACTION_USER_MOVE_ERROR", { from, to, error: String(e) });
      // Invalid move, ignore
      const fen = chess.fen();
      chess.load(fen);
      setFen(fen);
    }
  };

  const handleRate = async (quality: number) => {
    logFlightBox("ACTION_RATE_SUBMIT", { quality, cardId: currentStat.id });
    
    // Optimistic UI update: instantly jump to the next card (or caught up screen)
    if (currentIndex < stats.length) {
      setCurrentIndex((prev) => prev + 1);
    }
    
    if (currentIndex === stats.length - 1) {
      logFlightBox("TRAINING_COMPLETE", {});
    }

    try {
      // Async update in the background
      await updateSrsStats(currentStat.id, quality);
    } catch (e) {
      console.error("Failed to update stat", e);
      logFlightBox("ACTION_RATE_SUBMIT_ERROR", { quality, cardId: currentStat.id, error: String(e) });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", position: "relative" }}>
      
      {/* Fixed Toast Banners */}
      {testStatus === "wrong" && (
        <div style={{ position: "fixed", bottom: "20px", left: "20px", background: "#c62828", color: "white", padding: "12px 24px", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)", zIndex: 100, fontSize: "1.1rem" }}>
          Incorrect move. Try again, or press <strong style={{ color: "black", background: "white", padding: "2px 6px", borderRadius: "4px", fontSize: "0.9rem" }}>Enter</strong> to reveal.
        </div>
      )}
      {testStatus === "correct" && (
        <div style={{ position: "fixed", bottom: "20px", left: "20px", background: "var(--lichess-green)", color: "white", padding: "12px 24px", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)", zIndex: 100, fontSize: "1.1rem" }}>
          Correct! Press <strong style={{ color: "black", background: "white", padding: "2px 6px", borderRadius: "4px", fontSize: "0.9rem" }}>Enter</strong> for Good (3), or use 1-4.
        </div>
      )}
      {testStatus === "revealed" && (
        <div style={{ position: "fixed", bottom: "20px", left: "20px", background: "#f9a825", color: "black", padding: "12px 24px", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)", zIndex: 100, fontSize: "1.1rem" }}>
          Revealed. Press <strong style={{ color: "white", background: "black", padding: "2px 6px", borderRadius: "4px", fontSize: "0.9rem" }}>Enter</strong> to proceed (defaults to Good).
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
            currentPlyIndex={currentPlyIndex - 1}
            onMoveClick={(index) => {
              logFlightBox("ACTION_CLICK_MOVE_LIST", { targetIndex: index + 1 });
              setCurrentPlyIndex(index + 1);
            }} 
          />
        </div>
      </div>
    </div>
  );
}
