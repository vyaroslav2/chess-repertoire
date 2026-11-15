"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { BoardGlyphName } from './BoardGlyph';

// depth: the search behind the eval (DB.11), shown on hover (UI.38); none for a move that ends the game.
// glyph: "!?" after a human-evidence switch (UI.41). With the eval, so it hides with it (UI.34).
// best: Stockfish's top move in the position before this one (UI.41), as SAN; null where that
// position has no search (White's first move).
export type MoveEval = { cp: number | null; mate: number | null; depth?: number | null; glyph?: "!?" | null; best?: string | null };

// UI.41: the board's badge for a move, while it is the current move. "!?" on a switch;
// a star on White's move when it is Stockfish's top move, as named before it was played.
export function moveBadge(san: string, moveEval: MoveEval | null | undefined, ply: number): BoardGlyphName | null {
  if (!moveEval) return null;
  if (moveEval.glyph) return moveEval.glyph;
  if (ply % 2 === 0 && moveEval.best != null && moveEval.best === san) return "star";
  return null;
}

// UI.41: what the move costs against Stockfish's top move, from the mover's side, in whole cp:
// the eval before it (the previous move's) less its own, as the grid shows them. A gain shows
// as one: two searches of two positions needn't agree. None if either eval is a mate.
function lossLine(before: MoveEval | null | undefined, after: MoveEval, ply: number) {
  if (!before || before.cp === null || after.cp === null || before.mate !== null || after.mate !== null) return "";
  const loss = Math.round(ply % 2 === 0 ? before.cp - after.cp : after.cp - before.cp);
  return loss < 0 ? ` · gain ${-loss} cp` : ` · loss ${loss} cp`;
}


interface LichessMoveListProps {
  moves: string[]; // e.g. ['d4', 'd5', 'c4', 'dxc4']
  evals?: (MoveEval | null)[]; // by ply, as moves (DB.11); null shows nothing
  marks?: Record<number, "wrong" | "revealed">; // by ply: tints the move number (GR.07)
  mistakes?: Record<number, string[]>; // by ply: your wrong moves, a row each under the move
  currentPlyIndex: number; // -1 for start, 0 for White's first move, 1 for Black's, etc.
  onMoveClick: (index: number) => void;
}

// UI.26: two decimals with a sign, in White's view; a mate as on Lichess, "#3" or "#-3".
function formatEval({ cp, mate }: MoveEval) {
  if (mate !== null) return `#${mate}`;
  if (cp === null) return "";
  return (cp < 0 ? "-" : "+") + (Math.abs(cp) / 100).toFixed(2);
}

export default function LichessMoveList({ moves, evals, marks = {}, mistakes = {}, currentPlyIndex, onMoveClick }: LichessMoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeMoveRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic matching Lichess behavior
  useEffect(() => {
    if (currentPlyIndex === -1 && containerRef.current) {
      containerRef.current.scrollTop = 0;
    } else if (activeMoveRef.current) {
      activeMoveRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [currentPlyIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keystrokes if the user is typing in an input or textarea
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onMoveClick(Math.max(-1, currentPlyIndex - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onMoveClick(Math.min(moves.length - 1, currentPlyIndex + 1));
      } else if (e.key === 'Home' || e.key === 'ArrowUp') {
        e.preventDefault();
        onMoveClick(-1);
      } else if (e.key === 'End' || e.key === 'ArrowDown') {
        e.preventDefault();
        onMoveClick(moves.length - 1);
      }
    };

    // We attach it to the window to ensure hotkeys work anywhere on the page
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPlyIndex, moves.length, onMoveClick]);

  // UI.25: past the last listed move (a wrong move, for its 300ms on the board),
  // the last listed move stays current, so the blue doesn't blink off and on.
  const activeIndex = Math.min(currentPlyIndex, moves.length - 1);

  // Only one side is yours, so a row holds at most one marked move.
  const markClass = (...plies: number[]) => {
    const mark = plies.map((ply) => marks[ply]).find(Boolean);
    return mark ? `mark-${mark}` : '';
  };

  // UI.38: the depth only on hover: nice to know, not needed every time. Our own tooltip,
  // not `title`: the browser's shows late, only on a still pointer, and can't be styled.
  // Fixed to the window, so the list's scrolling doesn't clip it above the first row.
  const [hovered, setHovered] = useState<{ ply: number; x: number; y: number } | null>(null);
  // UI.41: under the depth, Stockfish's move and the loss, on a move that isn't Stockfish's.
  const tooltipLines = (() => {
    const moveEval = hovered ? evals?.[hovered.ply] : null;
    if (!hovered || !moveEval) return [];
    const lines: string[] = [];
    if (moveEval.depth != null) lines.push(`Depth ${moveEval.depth}`);
    if (moveEval.best != null && moveEval.best !== moves[hovered.ply]) {
      lines.push(`SF ${moveEval.best}${lossLine(evals?.[hovered.ply - 1], moveEval, hovered.ply)}`);
    }
    return lines;
  })();

  const evalAt = (index: number) => {
    const moveEval = evals?.[index];
    if (!moveEval) return null;
    return (
      <span
        className="move-eval"
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHovered({ ply: index, x: rect.left + rect.width / 2, y: rect.top });
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {formatEval(moveEval)}
      </span>
    );
  };

  // UI.41: the glyph right after the move, as on Lichess.
  const glyphAt = (index: number) => {
    const glyph = evals?.[index]?.glyph;
    return glyph ? <span className="move-glyph">{glyph}</span> : null;
  };

  // A marked move not yet listed (a wrong White move, back at once) still shows its number (GR.07).
  const rowsEnd = Math.max(
    moves.length,
    ...Object.keys(marks).map((ply) => Number(ply) + 1),
    ...Object.keys(mistakes).map((ply) => Number(ply) + 1),
  );

  // UI.37: wrong moves under their move, repeats too: shaded, smaller, no number; the
  // move's own cell stays blank until the right move fills it. In the mover's column.
  const mistakeRows = (ply: number) =>
    (mistakes[ply] ?? []).map((san, index) => (
      <React.Fragment key={`mistake-${ply}-${index}`}>
        <div className="move-number" />
        <div className="move-mistake">{ply % 2 === 0 && san}</div>
        <div className="move-mistake">{ply % 2 === 1 && san}</div>
        {/* Dropped for now, the shade alone is cleaner (UI.37); may come back:
            {san}<span className="mistake-cross">✗</span> */}
      </React.Fragment>
    ));

  // Group linear moves into [turnNumber, whiteMove, blackMove]
  const turns = [];
  for (let i = 0; i < rowsEnd; i += 2) {
    turns.push({
      turnNumber: Math.floor(i / 2) + 1,
      whiteMove: moves[i],
      whiteIndex: i,
      blackMove: moves[i + 1], // Might be undefined if it's currently Black's turn
      blackIndex: i + 1,
    });
  }

  return (
    <>
    <div
      className="lichess-move-list-container"
      ref={containerRef}
      onScroll={() => setHovered(null)} // the eval moves away from its tooltip
    >
      <div className="lichess-move-grid">
        {turns.map((turn) => (
          <React.Fragment key={turn.turnNumber}>
            {/* Column 1: Move Number, no dot (as on Lichess) */}
            {/* Tinted if your move in the row is marked (GR.07) */}
            <div className={`move-number ${markClass(turn.whiteIndex, turn.blackIndex)}`}>{turn.turnNumber}</div>

            {/* Column 2: White's Move; a blank cell keeps the columns when rows follow */}
            {turn.whiteMove === undefined ? <div /> : (
              <div
                ref={activeIndex === turn.whiteIndex ? activeMoveRef : null}
                className={`move-san ${activeIndex === turn.whiteIndex ? 'active' : ''}`}
                onClick={() => onMoveClick(turn.whiteIndex)}
              >
                {turn.whiteMove}
                {glyphAt(turn.whiteIndex)}
                {evalAt(turn.whiteIndex)}
              </div>
            )}

            {/* Column 3: Black's Move */}
            {turn.blackMove === undefined ? <div /> : (
              <div 
                ref={activeIndex === turn.blackIndex ? activeMoveRef : null}
                className={`move-san ${activeIndex === turn.blackIndex ? 'active' : ''}`}
                onClick={() => onMoveClick(turn.blackIndex)}
              >
                {turn.blackMove}
                {glyphAt(turn.blackIndex)}
                {evalAt(turn.blackIndex)}
              </div>
            )}
            {mistakeRows(turn.whiteIndex)}
            {mistakeRows(turn.blackIndex)}
          </React.Fragment>
        ))}
      </div>
    </div>
    {hovered && tooltipLines.length > 0 && (
      <div className="eval-tooltip" style={{ left: hovered.x, top: hovered.y }}>
        {tooltipLines.map((line) => <div key={line}>{line}</div>)}
      </div>
    )}
    </>
  );
}
