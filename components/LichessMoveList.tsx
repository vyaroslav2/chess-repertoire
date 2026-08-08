"use client";

import React, { useEffect, useRef, useCallback } from 'react';

interface LichessMoveListProps {
  moves: string[]; // e.g. ['d4', 'd5', 'c4', 'dxc4']
  currentPlyIndex: number; // -1 for start, 0 for White's first move, 1 for Black's, etc.
  onMoveClick: (index: number) => void;
}

export default function LichessMoveList({ moves, currentPlyIndex, onMoveClick }: LichessMoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeMoveRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic matching Lichess behavior
  useEffect(() => {
    if (activeMoveRef.current) {
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
      } else if (e.key === 'Home') {
        e.preventDefault();
        onMoveClick(-1);
      } else if (e.key === 'End') {
        e.preventDefault();
        onMoveClick(moves.length - 1);
      }
    };

    // We attach it to the window to ensure hotkeys work anywhere on the page
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPlyIndex, moves.length, onMoveClick]);

  // Group linear moves into [turnNumber, whiteMove, blackMove]
  const turns = [];
  for (let i = 0; i < moves.length; i += 2) {
    turns.push({
      turnNumber: Math.floor(i / 2) + 1,
      whiteMove: moves[i],
      whiteIndex: i,
      blackMove: moves[i + 1], // Might be undefined if it's currently Black's turn
      blackIndex: i + 1,
    });
  }

  return (
    <div 
      className="lichess-move-list-container" 
      ref={containerRef}
    >
      <div className="lichess-move-grid">
        {turns.map((turn) => (
          <React.Fragment key={turn.turnNumber}>
            {/* Column 1: Move Number */}
            <div className="move-number">{turn.turnNumber}.</div>
            
            {/* Column 2: White's Move */}
            <div 
              ref={currentPlyIndex === turn.whiteIndex ? activeMoveRef : null}
              className={`move-san ${currentPlyIndex === turn.whiteIndex ? 'active' : ''}`}
              onClick={() => onMoveClick(turn.whiteIndex)}
            >
              {turn.whiteMove}
            </div>

            {/* Column 3: Black's Move */}
            {turn.blackMove !== undefined && (
              <div 
                ref={currentPlyIndex === turn.blackIndex ? activeMoveRef : null}
                className={`move-san ${currentPlyIndex === turn.blackIndex ? 'active' : ''}`}
                onClick={() => onMoveClick(turn.blackIndex)}
              >
                {turn.blackMove}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
