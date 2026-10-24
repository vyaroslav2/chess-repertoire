"use client";

// Temporary: try the depth tooltip on the move list's evals, without the database.
// Delete this page before deploying (UI.29).
import { useState } from "react";
import LichessMoveList, { type MoveEval } from "../../components/LichessMoveList";

const cp = (pawns: number, depth: number): MoveEval => ({ cp: Math.round(pawns * 100), mate: null, depth });
const mate = (moves: number, depth: number | null): MoveEval => ({ cp: null, mate: moves, depth });

// The Blackburne Shilling trap: Black mates on move 7. The mates found by search have
// a depth; the checkmate on the board has none, so no tooltip (as the evaluator stores it).
const line: [string, MoveEval][] = [
  ["e4", cp(0.3, 38)],
  ["e5", cp(0.32, 41)],
  ["Nf3", cp(0.28, 40)],
  ["Nc6", cp(0.3, 39)],
  ["Bc4", cp(0.25, 37)],
  ["Nd4", cp(1.12, 35)],
  ["Nxe5", cp(-0.85, 33)],
  ["Qg5", cp(-0.6, 34)],
  ["Nxf7", cp(-8.6, 29)],
  ["Qxg2", cp(-9.4, 31)],
  ["Rf1", mate(-2, 42)],
  ["Qxe4+", mate(-1, 64)],
  ["Be2", mate(-1, 64)],
  ["Nf3#", mate(-1, null)],
];
const moves = line.map(([san]) => san);
const evals = line.map(([, e]) => e);

export default function DepthPage() {
  const [ply, setPly] = useState(moves.length - 1);

  return (
    <div style={{ display: "flex", gap: "48px", alignItems: "flex-start", justifyContent: "center", padding: "32px 20px" }}>
      <figure>
        <figcaption style={caption}>
          Hover an eval to see its depth. The last move, a checkmate on the board, has none.        </figcaption>
        <div style={{ width: "318.4px", height: "var(--board-size)" }}>
          <LichessMoveList moves={moves} evals={evals} currentPlyIndex={ply} onMoveClick={setPly} />
        </div>
      </figure>
    </div>
  );
}

const caption = { fontFamily: "var(--font-jetbrains-mono)", fontSize: "12px", lineHeight: "20px", color: "#bababa", marginBottom: "8px", width: "318.4px" } as const;
