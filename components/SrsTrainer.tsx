"use client";

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import Chessground from "@react-chess/chessground";
import "chessground/assets/chessground.base.css";
import { Chess } from "chess.js";
import LichessMoveList from "./LichessMoveList";
import EvalGauge from "./EvalGauge";
import SettingsMenu from "./SettingsMenu";
import { toggleStatusLine } from "./status-line";

// UI.34: whether the evals and gauge show.
const evalsKey = "evals";
import { logFlightBox } from "../lib/logger";
import {
  ankiGrade,
  ankiUndo,
  type AnkiCounts,
  type AnkiSession,
} from "../app/anki";

interface SrsTrainerProps {
  dueStats: any[];
  demoMode?: boolean;
  // AK.07: Anki runs the session; set on / only.
  anki?: AnkiSession;
}

type TestStatus = "idle" | "wrong" | "correct" | "revealed";

// A moving piece slides over 250ms, Lichess's default (UI.35).
const slideMs = 250;

// Lichess's mate sign, as it is in Lichess's chessground (glyph.ts: endgameGlyphs.mate,
// composeGlyph), GPL-3.0-or-later. Its origin is the square's top-left; 100 is a square.
// Drawn over the board by us, not as a chessground shape: chessground 8 draws
// shapes only once a piece has slid in, so the sign came after the red king.
const mateSign =
  '<defs><filter id="a"><feDropShadow dx="4" dy="7" flood-opacity=".5" stdDeviation="5"/></filter></defs>' +
  '<g transform="matrix(.4 0 0 .4 71 -12)"><circle cx="50" cy="50" r="50" fill="#df5353" filter="url(#a)"/>' +
  '<path fill="none" stroke="#fff" stroke-width="8" d="M38 18 33 82M62 18l-5 64M20 40h60M18 62h60"/></g>';

// A square's place on the board, from its top-left, in eighths.
function squareOffset(square: string, orientation: "white" | "black") {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const column = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;
  return { left: `${column * 12.5}%`, top: `${row * 12.5}%` };
}

// Anki's counts (AK.12, UI.22): lighter than their labels, units lined up.
const ankiCountStyle = { fontWeight: 350, textAlign: "right" } as const;

// A card that is a whole line (AK.02, AK.15) is played one of your moves at a
// time. Your first move's ply in the line, and the step of your last move.
const firstOwnPly = (card: any) => (card.repertoire.color.toLowerCase() === "black" ? 1 : 0);
const lastLineStep = (card: any) => (card.fullLine.length - 1 - firstOwnPly(card)) / 2;

// The card for your move number `step` in the line: the moves before it as the
// line, that move as the answer. Any other card as it is.
function lineStepCard(card: any, step: number) {
  if (!card?.fullLine) return card;
  const ply = firstOwnPly(card) + 2 * step;
  const answerEval = card.lineEvalByPly[ply];
  return {
    ...card,
    lineMoves: card.fullLine.slice(0, ply),
    targetMove: { ...card.targetMove, san: card.fullLine[ply], cp: answerEval?.cp ?? null, mate: answerEval?.mate ?? null },
    evalByPly: card.lineEvalByPly.slice(0, ply),
  };
}

// The session as it was just before a grade: all a grade changes (UN.01).
interface UndoStep {
  stats: any[];
  goodHitsByCard: Record<string, number>;
  graduatedCount: number;
}

export default function SrsTrainer({
  dueStats,
  demoMode = false,
  anki,
}: SrsTrainerProps) {
  const [stats, setStats] = useState(dueStats);
  const [graduatedCount, setGraduatedCount] = useState(0);
  const [goodHitsByCard, setGoodHitsByCard] = useState<Record<string, number>>(
    {},
  );

  // One step per grade, empty at page load; Ctrl + Z takes the last one back (UN.01, UN.02).
  const undoStepsRef = useRef<UndoStep[]>([]);
  // Anki mode (AK.07): Anki's counts (AK.12), or why there is no card (AK.14).
  const ankiMode = anki !== undefined;
  const [ankiCounts, setAnkiCounts] = useState<AnkiCounts | null>(
    anki?.status === "card" ? anki.counts : null,
  );
  const [ankiError, setAnkiError] = useState(
    anki?.status === "error" ? anki.message : null,
  );
  // A request to Anki is on its way: further grades and undos wait for it.
  const ankiBusyRef = useRef(false);
  // Anki's message after an undo, bottom left: "Answer undone" (MS.01) or
  // Anki's own text (MS.04). It goes after its 3s and fade; a new id restarts it.
  const [undoMessage, setUndoMessage] = useState<{ text: string; id: number } | null>(null);
  const undoMessageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showUndoMessage = (text: string | null) => {
    if (undoMessageTimerRef.current) clearTimeout(undoMessageTimerRef.current);
    setUndoMessage(text === null ? null : { text, id: Date.now() });
    if (text !== null) {
      undoMessageTimerRef.current = setTimeout(() => setUndoMessage(null), 3450);
    }
  };

  // Counts the cards shown, so a card starts afresh even when the same card
  // comes round again (graded Again as the only card left, or undone to itself).
  const [showing, setShowing] = useState(0);

  // The state machine
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [chess] = useState(new Chess());
  const [fen, setFen] = useState(chess.fen());
  // The king in check is marked red, as on Lichess. A mated king also gets
  // Lichess's red # at its square's top-right corner.
  const position = useMemo(() => new Chess(fen), [fen]);
  const inCheck = position.inCheck();
  const mateSquare = useMemo(
    () => (position.isCheckmate() ? position.findPiece({ type: "k", color: position.turn() })[0] : undefined),
    [position],
  );
  const [lastMove, setLastMove] = useState<[string, string] | undefined>();

  // Browsing state
  const [currentPlyIndex, setCurrentPlyIndex] = useState(-1);
  const [isInitializing, setIsInitializing] = useState(true);
  const isInitializingRef = useRef(true);
  // The opponent's move has started to slide in (the wait before it is over).
  const slideStartedRef = useRef(false);
  // A wrong move stays on the board, its check shown, until it goes back (GR.02), as on
  // Lichess; the redraw it sets off is skipped, so no second sound either.
  const wrongMoveShownRef = useRef(false);
  // The ply last shown: stepping back through the moves is silent, as on Lichess.
  const shownPlyRef = useRef(-1);
  const animTimerRef = useRef<NodeJS.Timeout | null>(null);
  const snapBackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Only true while the opponent's move is actually being revealed — every other
  // position change (new card, browsing, skipping) is a dead instant jump, no glide.
  const [animationEnabled, setAnimationEnabled] = useState(false);

  // Manual board flip, toggled with the 'f' key.
  const [flipped, setFlipped] = useState(false);

  // Evals and gauge, shown with the 'e' key; the choice is kept across cards and reloads (UI.34).
  const [evalsShown, setEvalsShown] = useState(false);
  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(evalsKey) === "1") setEvalsShown(true);
    } catch {}
  }, []);

  // Lichess's sounds: Capture.mp3 for a capture, right or wrong, Move.mp3 for any other move.
  const soundsRef = useRef<{ move: HTMLAudioElement; capture: HTMLAudioElement } | null>(null);

  // Which of your moves in a whole-line card is asked; 0 at each new card.
  const [lineStep, setLineStep] = useState(0);
  // The status light (GR.06): how the line has gone so far. Red or amber is
  // never turned back to green; null until your first move, and at each new card.
  const [lineStatus, setLineStatus] = useState<Exclude<TestStatus, "idle"> | null>(null);
  const currentStat = useMemo(() => lineStepCard(stats[0], lineStep), [stats[0], lineStep]);
  // Grades wait for the line's end: your last move, with no White move after it.
  const isLastStep = !currentStat?.fullLine || lineStep >= lastLineStep(currentStat);
  // Mid-line, a move played or revealed goes straight on to White's reply.
  const goOnInLine = () => {
    if (!isLastStep) setLineStep((previous) => previous + 1);
  };
  const lineMoves: string[] = currentStat?.lineMoves || [];
  const targetPlyIndex = lineMoves.length; // The ply they are supposed to guess from (after opponent's move)
  const currentOpening =
    currentStat?.openingByPly?.[Math.max(0, currentPlyIndex)] ?? null;
  const positionOpening =
    currentPlyIndex <= 0
      ? "" // Starting position has no opening — nothing to show, not even "missing metadata".
      : currentOpening?.openingMetadataStatus === "PRESENT"
        ? [currentOpening.eco, currentOpening.openingName]
            .filter(Boolean)
            .join(" ")
        : currentOpening?.openingMetadataStatus === "VALID_ABSENCE"
          ? "No opening classification (Lichess Masters)"
          : "";
  const hasPositionOpening = positionOpening !== "";

  // Derived lock state
  const expectedPlyIndex =
    testStatus === "idle" || testStatus === "wrong"
      ? targetPlyIndex
      : targetPlyIndex + 1;
  const isBrowsing = currentPlyIndex !== expectedPlyIndex;
  const isLocked = testStatus !== "idle" || isBrowsing || isInitializing;

  useEffect(() => {
    // Initialize audio
    soundsRef.current = {
      move: new Audio("https://lichess1.org/assets/sound/standard/Move.mp3"),
      capture: new Audio("https://lichess1.org/assets/sound/standard/Capture.mp3"),
    };
  }, []);

  const playSound = (san?: string) => {
    const sound = san?.includes("x") ? soundsRef.current?.capture : soundsRef.current?.move;
    if (sound) {
      sound.currentTime = 0;
      // Browsers block audio autoplay before any user gesture (e.g. the very first
      // card's reveal on page load) — that's expected, not a bug, so stay quiet about it.
      sound.play().catch((e) => {
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
    // A wrong move's snap-back belongs to the card before; it must not touch this one.
    if (snapBackTimerRef.current) {
      clearTimeout(snapBackTimerRef.current);
      snapBackTimerRef.current = null;
    }

    setIsInitializing(true);
    isInitializingRef.current = true;
    slideStartedRef.current = false;

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
    // Mid-line, your move just played stays marked until White's reply.
    const playedMove = lineStep > 0 ? tempChess.history({ verbose: true }).at(-1) : undefined;
    setLastMove(playedMove ? [playedMove.from, playedMove.to] : undefined);
    setTestStatus("idle");
    if (lineStep === 0) setLineStatus(null);
    setCurrentPlyIndex(priorMoves.length);

    if (!finalMove) {
      // First move of the game: no opponent move to animate.
      setIsInitializing(false);
      isInitializingRef.current = false;
      logFlightBox("LOAD_CARD_END_IMMEDIATE", {
        fen: tempChess.fen(),
        currentPlyIndex: priorMoves.length,
      });
      return;
    }

    // Only the opponent's final move plays an animation, after a brief pause
    // so it reads as a deliberate reveal rather than part of the snap-in.
    animTimerRef.current = setTimeout(() => {
      const m = tempChess.move(finalMove);
      if (m) {
        setAnimationEnabled(true);
        slideStartedRef.current = true;
        setFen(tempChess.fen());
        chess.load(tempChess.fen()); // Sync main instance
        setLastMove([m.from, m.to]);
        setCurrentPlyIndex(lineMoves.length);
        playSound(m.san);
        logFlightBox("ANIMATE_MOVE", { san: finalMove, fen: tempChess.fen() });
      } else {
        logFlightBox("ANIMATE_MOVE_FAIL", {
          san: finalMove,
          fen: tempChess.fen(),
        });
      }
      // The intro ends once the move has slid in (UI.35); until then only Enter acts (GR.01).
      animTimerRef.current = setTimeout(
        () => {
          animTimerRef.current = null;
          setIsInitializing(false);
          isInitializingRef.current = false;
          logFlightBox("LOAD_CARD_ANIMATION_COMPLETE", {
            finalFen: tempChess.fen(),
          });
        },
        m ? slideMs : 0,
      );
    }, 500);

    return () => {
      if (animTimerRef.current) {
        clearTimeout(animTimerRef.current);
      }
    };
  }, [currentStat, chess, showing]);

  // Browsing Effect
  useEffect(() => {
    const forward = currentPlyIndex > shownPlyRef.current;
    shownPlyRef.current = currentPlyIndex;
    if (!currentStat) return;
    if (currentPlyIndex < 0) return;
    if (isInitializingRef.current) return; // Prevent interference during the opening animation
    if (wrongMoveShownRef.current) {
      wrongMoveShownRef.current = false;
      return;
    }

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
    if (fen !== tempChess.fen() && forward) {
      playSound(tempChess.history().at(-1));
    }

    setFen(tempChess.fen());
    chess.load(tempChess.fen()); // Important: sync main chess instance so handleMove works correctly!
    setLastMove(lm);

    logFlightBox("BROWSING_EFFECT", {
      currentPlyIndex,
      newFen: tempChess.fen(),
      timeToExecute: performance.now() - startTime,
    });
  }, [currentPlyIndex, currentStat, testStatus, targetPlyIndex, lineMoves]);

  // Keyboard Controller
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      // Ctrl + Z: back to the previous card (UN.02). Checked first, so the
      // animation skip below can't swallow it, and before the end screen's
      // early return, so it works from there too. By position, on any layout (UN.05).
      if (
        e.code === "KeyZ" &&
        e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        if (ankiMode) {
          logFlightBox("ACTION_ANKI_UNDO", {});
          if (ankiBusyRef.current) return;
          showUndoMessage(null);
          // AD.13: Anki's own undo, whatever its next step is. No message if
          // Anki gave none: nothing to undo, or no add-on (AD.14, AD.17).
          sendToAnki(
            ankiUndo().then((result) => {
              logFlightBox("ANKI_UNDO_MESSAGE", { message: result.message });
              if (result.message) showUndoMessage(result.message);
              return result.session;
            }),
          );
          return;
        }
        const step = undoStepsRef.current.pop();
        logFlightBox("ACTION_UNDO", {
          undone: !!step,
          stepsLeft: undoStepsRef.current.length,
        });
        if (!step) return; // The first card: nothing to go back to.
        setStats(step.stats);
        setGoodHitsByCard(step.goodHitsByCard);
        setGraduatedCount(step.graduatedCount);
        setLineStep(0);
        setShowing((previous) => previous + 1);
        return;
      }

      // S: the status line on or off, kept across reloads (UI.22). Not with
      // Ctrl, Alt or Meta, so Ctrl + S stays the browser's.
      if ((e.key === "s" || e.key === "S") && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (!e.repeat) toggleStatusLine();
        return;
      }

      if (!currentStat) return;

      logFlightBox("KEY_PRESS", {
        key: e.key,
        isInitializing: isInitializingRef.current,
        isBrowsing,
        testStatus,
      });

      // Not with Ctrl, Alt or Meta, so Ctrl + F and Ctrl + E stay the browser's.
      const plainKey = !e.ctrlKey && !e.altKey && !e.metaKey;

      // Flip board (doesn't consume/affect any other state)
      if ((e.key === "f" || e.key === "F") && plainKey) {
        setFlipped((prev) => !prev);
        logFlightBox("ACTION_FLIP_BOARD", {});
        return;
      }

      // Show or hide the evals and gauge, kept in localStorage (UI.34)
      if ((e.key === "e" || e.key === "E") && plainKey) {
        if (e.repeat) return;
        const shown = !evalsShown;
        setEvalsShown(shown);
        try {
          localStorage.setItem(evalsKey, shown ? "1" : "0");
        } catch {}
        return;
      }

      // During the intro (the wait, then the opponent's slide), only Enter acts:
      // it ends the intro and reveals the answer below. Other keys leave the slide alone (GR.01).
      if (isInitializingRef.current) {
        if (e.key !== "Enter") return;
        if (animTimerRef.current) {
          clearTimeout(animTimerRef.current);
          animTimerRef.current = null;
        }
        setIsInitializing(false);
        isInitializingRef.current = false;
        // Mid-slide, animating to the answer replaces the slide: the opponent's piece
        // lands at once and the answer slides in. In the wait, nothing moves yet,
        // so the answer just appears. (Turning animation off doesn't stop a slide.)
        if (!slideStartedRef.current) setAnimationEnabled(false);
        logFlightBox("ANIMATION_SKIPPED", {
          keyTrigger: e.key,
          midSlide: slideStartedRef.current,
        });
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
              setLineStatus("revealed");
              setCurrentPlyIndex(targetPlyIndex + 1);
              goOnInLine();
              playSound(move.san);
              logFlightBox("ACTION_REVEAL", {
                success: true,
                san: currentStat.targetMove.san,
              });
            }
          } catch (err) {
            console.error("Reveal error:", err);
            logFlightBox("ACTION_REVEAL_ERROR", {
              san: currentStat.targetMove.san,
              error: String(err),
            });
          }
        } else if ((testStatus === "correct" || testStatus === "revealed") && isLastStep) {
          // Default Enter to "Good" (rating 2)
          logFlightBox("ACTION_RATE_DEFAULT_ENTER", { quality: 2 });
          handleRate(2);
        }
      }

      // 1, 2, 3, 4 (Grade)
      if (["1", "2", "3", "4"].includes(e.key) && testStatus !== "idle" && isLastStep) {
        // Map 1-4 to 0-3 quality
        const quality = parseInt(e.key) - 1;
        logFlightBox("ACTION_RATE_KEY", { key: e.key, quality });
        handleRate(quality);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStat, testStatus, chess, isBrowsing, targetPlyIndex, evalsShown]);

  if (!currentStat && ankiMode) {
    // AK.14
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "50px" }}>
        <h2
          style={{
            fontSize: "2rem",
            color: ankiError ? "#c62828" : "var(--lichess-green)",
          }}
        >
          {ankiError ? "No connection to Anki" : "You're all caught up!"}
        </h2>
        <p
          style={{
            fontSize: "1.1rem",
            marginTop: "10px",
            color: "var(--lichess-text-muted)",
          }}
        >
          {ankiError ?? "No more cards due in Anki."}
        </p>
      </div>
    );
  }

  if (!currentStat) {
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "50px" }}>
        <h2 style={{ fontSize: "2rem", color: "var(--lichess-green)" }}>
          {demoMode ? "Demo complete" : "You're all caught up!"}
        </h2>
        <p
          style={{
            fontSize: "1.1rem",
            marginTop: "10px",
            color: "var(--lichess-text-muted)",
          }}
        >
          {demoMode
            ? `${graduatedCount} cards graduated locally. No database changes were made.`
            : "No more positions due for review."}
        </p>
      </div>
    );
  }

  const calcTurnColor = () => (chess.turn() === "w" ? "white" : "black");
  const baseOrientation =
    currentStat.repertoire.color.toLowerCase() === "black" ? "black" : "white";
  const orientation = flipped
    ? baseOrientation === "black"
      ? "white"
      : "black"
    : baseOrientation;

  // By ply, as the moves. The answer's eval shows with the answer; a wrong move has none.
  const moveEvals = (currentStat.evalByPly || []).concat(
    testStatus === "correct" || testStatus === "revealed"
      ? [currentStat.targetMove]
      : [],
  );

  // The line for the settings menu: the move list without a wrong move (SM.02, SM.03).
  const line = lineMoves.concat(
    testStatus === "correct" || testStatus === "revealed"
      ? [currentStat.targetMove.san]
      : [],
  );

  const calcMovable = () => {
    // Only allow moves if we are idle or wrong (let them try again)
    // Completely lock the board during browsing or initialization
    if (
      testStatus === "correct" ||
      testStatus === "revealed" ||
      isBrowsing ||
      isInitializing
    ) {
      return { free: false, color: undefined, dests: new Map() };
    }

    const dests = new Map();
    chess.moves({ verbose: true }).forEach((m) => {
      dests.set(
        m.from,
        dests.get(m.from) ? dests.get(m.from).concat(m.to) : [m.to],
      );
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
        playSound(move.san);
        logFlightBox("ACTION_USER_MOVE", {
          from,
          to,
          san: move.san,
          isCorrect: move.san === currentStat.targetMove.san,
        });

        if (move.san === currentStat.targetMove.san) {
          setFen(chess.fen());
          setLastMove([from, to]);
          setTestStatus("correct");
          setLineStatus((previous) => previous ?? "correct");
          setCurrentPlyIndex(targetPlyIndex + 1);
          goOnInLine();
        } else {
          // Wrong move
          wrongMoveShownRef.current = true;
          setFen(chess.fen());
          setLastMove([from, to]);
          setTestStatus("wrong");
          setLineStatus("wrong");
          setCurrentPlyIndex(targetPlyIndex + 1);

          // Back after 300ms, as on Lichess (GR.02)
          snapBackTimerRef.current = setTimeout(() => {
            snapBackTimerRef.current = null;
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
          }, 300);
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

  // Shows what Anki sends back: its current card, the end, or an error.
  function sendToAnki(request: Promise<AnkiSession | null>) {
    if (ankiBusyRef.current) return;
    ankiBusyRef.current = true;
    request
      .then((session) => {
        logFlightBox("ANKI_SESSION", {
          status: session?.status ?? "unchanged",
        });
        if (!session) return;
        setStats(session.status === "card" ? [session.card] : []);
        setAnkiCounts(session.status === "card" ? session.counts : null);
        setAnkiError(session.status === "error" ? session.message : null);
        setLineStep(0);
        setShowing((previous) => previous + 1);
      })
      .finally(() => {
        ankiBusyRef.current = false;
      });
  }

  const handleRate = (quality: number) => {
    if (ankiMode) {
      if (ankiBusyRef.current) return;
      logFlightBox("ACTION_ANKI_RATE", {
        quality,
        ankiCardId: currentStat.ankiCardId,
      });
      showUndoMessage(null);
      sendToAnki(ankiGrade(currentStat.ankiCardId, quality + 1));
      return;
    }
    const cardKey = currentStat.demoId ?? currentStat.id;
    const goodHits = goodHitsByCard[cardKey] ?? 0;
    const isGood = quality === 2;
    const isEasy = quality === 3;
    const graduates = isEasy || (isGood && goodHits >= 1);

    logFlightBox("ACTION_DEMO_RATE", {
      quality,
      cardId: cardKey,
      goodHits,
      graduates,
    });

    undoStepsRef.current.push({ stats, goodHitsByCard, graduatedCount });
    setLineStep(0);
    setShowing((previous) => previous + 1);

    if (isGood && !graduates) {
      setGoodHitsByCard((previous) => ({
        ...previous,
        [cardKey]: goodHits + 1,
      }));
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        position: "relative",
      }}
    >
      <SettingsMenu
        line={line}
        ply={Math.min(Math.max(currentPlyIndex, 0), line.length)}
        fen={fen}
        orientation={orientation}
      />

      {undoMessage && (
        <div
          key={undoMessage.id}
          className="undo-notice"
          role="status"
        >
          {undoMessage.text}
        </div>
      )}

      {lineStatus && (
        <div
          style={{
            position: "fixed",
            bottom: "16px",
            left: "16px",
            width: "clamp(12px, 0.9vw, 18px)",
            height: "clamp(12px, 0.9vw, 18px)",
            borderRadius: "50%",
            background:
              lineStatus === "wrong"
                ? "#c62828"
                : lineStatus === "correct"
                  ? "var(--lichess-green)"
                  : "#f9a825",
            border: `1px solid ${lineStatus === "wrong" ? "#8e1b1b" : lineStatus === "correct" ? "#456b19" : "#b87a14"}`,
            zIndex: 100,
          }}
          aria-label={`Status: ${lineStatus}`}
        />
      )}

      {/* Board row: only the board is in the flow, so only the board is centred,
          across and down (UI.01). Everything else hangs off it. */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          width: "max-content",
          height: "var(--board-size)",
          margin: "0 auto",
          position: "relative",
        }}
      >
        {/* Status line, in the free space left of the board (temporary) */}
        {ankiMode && ankiCounts ? (
          // AK.12: Anki's counts for the deck, as on its overview screen.
          <div
            className="demo-status-hover"
            style={{
              position: "absolute",
              right: "calc(100% + 40px)",
              top: 0,
              display: "grid",
              gridTemplateColumns: "auto auto",
              columnGap: "16px",
              // Set, not inherited: a browser's default size may be larger than 16px.
              fontSize: "16px",
              lineHeight: "24px",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              // Inter's recommended tracking at 16px (UI.20's formula): -0.175px
              letterSpacing: "-0.011em",
              color: "var(--lichess-text-muted)",
            }}
          >
            <span>New</span><span style={{ ...ankiCountStyle, color: "var(--anki-new)" }}>{ankiCounts.newCount}</span>
            <span>Learning</span><span style={{ ...ankiCountStyle, color: "var(--anki-learn)" }}>{ankiCounts.learnCount}</span>
            <span>To Review</span><span style={{ ...ankiCountStyle, color: "var(--anki-review)" }}>{ankiCounts.reviewCount}</span>
            <span>Done</span><span style={{ ...ankiCountStyle, color: "var(--anki-done)" }}>{ankiCounts.doneCount}</span>
          </div>
        ) : (
          <p
            className="demo-status-hover"
            style={{
              position: "absolute",
              right: "calc(100% + 40px)",
              top: 0,
              width: "280px",
              textAlign: "right",
              fontSize: "16px",
              lineHeight: "24px",
              letterSpacing: "-0.011em",
              color: "var(--lichess-text-muted)",
            }}
          >
            {demoMode
              ? `Black to move · ${stats.length} cards remaining · ${graduatedCount} graduated · Good ${goodHitsByCard[currentStat.demoId ?? currentStat.id] ?? 0}/2`
              : `Position 1 of ${stats.length}`}
          </p>
        )}

        {/* Opening name, 4px above the board (UI.04) */}
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: "calc(100% + 4px)",
            width: "var(--board-size)",
            maxWidth: "100%",
            color: "var(--opening-text)",
            fontSize: "14px",
            fontWeight: 375,
            lineHeight: "20px",
            // Inter's recommended tracking at 14px (rsms.me/inter "dynamic metrics"): -0.087px
            letterSpacing: "-0.0062em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            visibility: hasPositionOpening ? "visible" : "hidden",
          }}
          title={hasPositionOpening ? positionOpening : undefined}
        >
          {hasPositionOpening ? positionOpening : "ECO Opening Name"}
        </div>

        <div
          className={`board-themed ${testStatus !== "idle" ? "board-locked" : ""}`}
          style={{
            width: "var(--board-size)",
            height: "var(--board-size)",
            boxShadow: "var(--glass-shadow)",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Chessground
            width="100%"
            height="100%"
            config={{
              fen: fen,
              orientation: orientation,
              turnColor: calcTurnColor(),
              lastMove: lastMove,
              check: inCheck,
              highlight: { lastMove: true, check: true },
              drawable: { enabled: true, visible: true },
              coordinates: true,
              animation: { enabled: animationEnabled, duration: slideMs },
              movable: {
                ...calcMovable(),
                events: {
                  after: handleMove,
                },
              },
            }}
          />
          {mateSquare && (
            <svg
              viewBox="0 0 100 100"
              style={{
                position: "absolute",
                ...squareOffset(mateSquare, orientation),
                width: "12.5%",
                height: "12.5%",
                overflow: "visible",
                pointerEvents: "none",
                zIndex: 10,
              }}
              dangerouslySetInnerHTML={{ __html: mateSign }}
            />
          )}
        </div>

        {/* Eval gauge between the board and the move list, 4px from each (UI.31); hidden until 'e' (UI.34) */}
        <div
          className="trainer-gauge"
          style={{ visibility: evalsShown ? "visible" : "hidden" }}
        >
          <EvalGauge
            evaluation={moveEvals[currentPlyIndex - 1] ?? null}
            orientation={orientation}
          />
        </div>

        {/* Move List Side Panel — out of the flow so only the board is centred (UI.01, UI.02) */}
        <div
          className="trainer-move-list"
          style={{
            position: "absolute",
            top: 0,
            width: "318.4px", // UI.26: 220px plus room for the evals (398 screen px)
            height: "var(--board-size)",
            overflow: "hidden",
            backgroundColor: "var(--lichess-panel-bg)",
          }}
        >
          <LichessMoveList
            // The answer once played or revealed. A wrong move goes back at once and
            // is not listed: listing it showed the answer after browsing back to the start.
            moves={(currentStat?.lineMoves || []).concat(
              testStatus === "correct" || testStatus === "revealed"
                ? [currentStat.targetMove.san]
                : [],
            )}
            evals={evalsShown ? moveEvals : undefined}
            currentPlyIndex={currentPlyIndex - 1}
            onMoveClick={(index) => {
              logFlightBox("ACTION_CLICK_MOVE_LIST", {
                targetIndex: index + 1,
              });
              setCurrentPlyIndex(index + 1);
            }}
          />
        </div>
      </div>
    </div>
  );
}
