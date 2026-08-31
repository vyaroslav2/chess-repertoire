"use client";

import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import Chessground from "@react-chess/chessground";
import "chessground/assets/chessground.base.css";
import { Chess } from "chess.js";
import LichessMoveList from "./LichessMoveList";
import { logFlightBox } from "../lib/logger";

interface SrsTrainerProps {
  dueStats: any[];
  demoMode?: boolean;
}

type TestStatus = "idle" | "wrong" | "correct" | "revealed";

export default function SrsTrainer({ dueStats, demoMode = false }: SrsTrainerProps) {
  const [stats, setStats] = useState(dueStats);
  const [graduatedCount, setGraduatedCount] = useState(0);
  const [goodHitsByCard, setGoodHitsByCard] = useState<Record<string, number>>({});
  
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

  // Only true while the opponent's move is actually being revealed — every other
  // position change (new card, browsing, skipping) is a dead instant jump, no glide.
  const [animationEnabled, setAnimationEnabled] = useState(false);

  // Manual board flip, toggled with the 'f' key.
  const [flipped, setFlipped] = useState(false);

  // Sound ref
  const moveSoundRef = useRef<HTMLAudioElement | null>(null);

  const currentStat = stats[0];
  const lineMoves: string[] = currentStat?.lineMoves || [];
  const targetPlyIndex = lineMoves.length; // The ply they are supposed to guess from (after opponent's move)
  const currentOpening = currentStat?.openingByPly?.[Math.max(0, currentPlyIndex)] ?? null;
  const positionOpening = currentPlyIndex <= 0
    ? "" // Starting position has no opening — nothing to show, not even "missing metadata".
    : currentOpening?.openingMetadataStatus === "PRESENT"
      ? [currentOpening.eco, currentOpening.openingName].filter(Boolean).join(" ")
      : currentOpening?.openingMetadataStatus === "VALID_ABSENCE"
        ? "No opening classification (Lichess Masters)"
        : "";
  const hasPositionOpening = positionOpening !== "";

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
      // Browsers block audio autoplay before any user gesture (e.g. the very first
      // card's reveal on page load) — that's expected, not a bug, so stay quiet about it.
      moveSoundRef.current.play().catch(e => {
        if (e instanceof DOMException && e.name === "NotAllowedError") return;
        console.error("Audio play failed:", e);
      });
    }
  };

  // 1. Loading & Animation Sequence
  useLayoutEffect(() => {
    if (!currentStat) return;

    logFlightBox("LOAD_CARD_START", { cardId: currentStat.id, lineMoves });

    if (animTimerRef.current) {
      clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }

    setIsInitializing(true);
    isInitializingRef.current = true;

    // Snap instantly to the position just before the opponent's last move —
    // no per-ply animation, matching a Lichess puzzle's instant setup.
    const priorMoves = lineMoves.slice(0, -1);
    const finalMove = lineMoves[lineMoves.length - 1];

    const tempChess = new Chess();
    for (const san of priorMoves) {
      tempChess.move(san);
    }
    setAnimationEnabled(false);
    setFen(tempChess.fen());
    chess.load(tempChess.fen());
    setLastMove(undefined);
    setTestStatus("idle");
    setCurrentPlyIndex(priorMoves.length);

    if (!finalMove) {
      // First move of the game: no opponent move to animate.
      setIsInitializing(false);
      isInitializingRef.current = false;
      logFlightBox("LOAD_CARD_END_IMMEDIATE", { fen: tempChess.fen(), currentPlyIndex: priorMoves.length });
      return;
    }

    // Only the opponent's final move plays an animation, after a brief pause
    // so it reads as a deliberate reveal rather than part of the snap-in.
    animTimerRef.current = setTimeout(() => {
      const m = tempChess.move(finalMove);
      if (m) {
        setAnimationEnabled(true);
        setFen(tempChess.fen());
        chess.load(tempChess.fen()); // Sync main instance
        setLastMove([m.from, m.to]);
        setCurrentPlyIndex(lineMoves.length);
        playSound();
        logFlightBox("ANIMATE_MOVE", { san: finalMove, fen: tempChess.fen() });
      } else {
        logFlightBox("ANIMATE_MOVE_FAIL", { san: finalMove, fen: tempChess.fen() });
      }
      setIsInitializing(false);
      isInitializingRef.current = false;
      logFlightBox("LOAD_CARD_ANIMATION_COMPLETE", { finalFen: tempChess.fen() });
    }, 500);

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

      // Flip board (doesn't consume/affect any other state)
      if (e.key === "f" || e.key === "F") {
        setFlipped((prev) => !prev);
        logFlightBox("ACTION_FLIP_BOARD", {});
        return;
      }

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
        setAnimationEnabled(false);
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
        <h2 style={{ fontSize: "2rem", color: "var(--lichess-green)" }}>{demoMode ? "Demo complete" : "You're all caught up!"}</h2>
        <p style={{ fontSize: "1.1rem", marginTop: "10px", color: "var(--lichess-text-muted)" }}>
          {demoMode ? `${graduatedCount} cards graduated locally. No database changes were made.` : "No more positions due for review."}
        </p>
      </div>
    );
  }

  const calcTurnColor = () => (chess.turn() === "w" ? "white" : "black");
  const baseOrientation = currentStat.repertoire.color.toLowerCase() === "black" ? "black" : "white";
  const orientation = flipped ? (baseOrientation === "black" ? "white" : "black") : baseOrientation;

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

  const handleRate = (quality: number) => {
    const cardKey = currentStat.demoId ?? currentStat.id;
    const goodHits = goodHitsByCard[cardKey] ?? 0;
    const isGood = quality === 2;
    const isEasy = quality === 3;
    const graduates = isEasy || (isGood && goodHits >= 1);

    logFlightBox("ACTION_DEMO_RATE", { quality, cardId: cardKey, goodHits, graduates });

    if (isGood && !graduates) {
      setGoodHitsByCard((previous) => ({ ...previous, [cardKey]: goodHits + 1 }));
    } else if (quality === 0) {
      setGoodHitsByCard((previous) => ({ ...previous, [cardKey]: 0 }));
    }

    setStats((previous) => {
      const [current, ...remaining] = previous;
      if (!current) return previous;
      return graduates ? remaining : [...remaining, current];
    });
    if (graduates) setGraduatedCount((previous) => previous + 1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", position: "relative" }}>
      
      {testStatus !== "idle" && (
        <div
          style={{
            position: "fixed", bottom: 0, left: 0, width: "250px", height: "25px",
            background: testStatus === "wrong" ? "#c62828" : testStatus === "correct" ? "var(--lichess-green)" : "#f9a825",
            borderTop: "1px solid var(--lichess-border)", borderRight: "1px solid var(--lichess-border)", zIndex: 100,
          }}
        />
      )}

      <div style={{ color: "var(--lichess-text-bright)", textAlign: "center" }}>
        <p className="demo-status-hover" style={{ color: "var(--lichess-text-muted)" }}>
          {demoMode
            ? `Black to move · ${stats.length} cards remaining · ${graduatedCount} graduated · Good ${goodHitsByCard[currentStat.demoId ?? currentStat.id] ?? 0}/2`
            : `Position 1 of ${stats.length}`}
        </p>
      </div>

      <div
        style={{
          width: "748px", maxWidth: "100%", marginBottom: "-14px",
          color: "var(--lichess-text-muted)", fontSize: "14px", lineHeight: "20px",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          // Always render placeholder text and reserve the line's height, even when there's
          // nothing to show (e.g. the starting position) — hiding via display would collapse
          // the row and shift the board down the moment real opening text appears.
          visibility: hasPositionOpening ? "visible" : "hidden",
        }}
        title={hasPositionOpening ? positionOpening : undefined}
      >
        {hasPositionOpening ? positionOpening : "ECO Opening Name"}
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
              animation: { enabled: animationEnabled, duration: 200 },
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
