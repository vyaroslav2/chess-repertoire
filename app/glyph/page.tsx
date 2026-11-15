"use client";

// Temporary: try the "!?" glyph after a human-evidence switch (UI.41), without the database.
// Delete this page before deploying (UI.29).
import { useEffect, useMemo, useState } from "react";
import Chessground from "@react-chess/chessground";
import type { Key } from "chessground/types";
import "chessground/assets/chessground.base.css";
import { Chess } from "chess.js";
import LichessMoveList, { moveBadge, type MoveEval } from "../../components/LichessMoveList";
import BoardGlyph from "../../components/BoardGlyph";

// best: Stockfish's top move before each move; null for White's first. Mock evals and best moves,
// except where dev.db agrees (d4, e5 and Nf3 are its top moves; after 3...c5 it wants Nf3, not dxc5).
const cp = (pawns: number, best: string | null, glyph: "!?" | null = null): MoveEval => ({ cp: Math.round(pawns * 100), mate: null, depth: 40, glyph, best });

// The Caro-Kann Advance, every case: White's first move (depth only), a hardcoded move (c6),
// White's top moves (star), Black's switches ("!?"), White's other moves (SF and loss), a gain (Qxf3).
const line: [string, MoveEval][] = [
  ["e4", cp(0.3, null)],
  ["c6", cp(0.42, "e5")],
  ["d4", cp(0.38, "d4")],
  ["d5", cp(0.4, "d5")],
  ["e5", cp(0.35, "e5")],
  ["c5", cp(0.62, "Bf5", "!?")],
  ["dxc5", cp(0.55, "Nf3")],
  ["Nc6", cp(0.58, "Nc6")],
  ["Nf3", cp(0.5, "Nf3")],
  ["Bg4", cp(0.74, "e6", "!?")],
  ["Bb5", cp(0.7, "Bb5")],
  ["Qa5+", cp(0.95, "e6", "!?")],
  ["Nc3", cp(0.9, "Nc3")],
  ["e6", cp(0.92, "e6")],
  ["Be3", cp(0.88, "Bd2")],
  ["Nge7", cp(0.9, "Nge7")],
  ["O-O", cp(0.85, "Qd2")],
  ["Bxf3", cp(1.1, "Ng6", "!?")],
  ["Qxf3", cp(1.15, "gxf3")],
  ["Nf5", cp(1.08, "Nf5")],
];
const moves = line.map(([san]) => san);
const evals = line.map(([, e]) => e);

// The position after each ply, and that move's squares.
const positions = (() => {
  const chess = new Chess();
  return moves.map((san) => {
    const move = chess.move(san);
    return { fen: chess.fen(), from: move.from, to: move.to };
  });
})();

const caption = { fontFamily: "var(--font-jetbrains-mono)", fontSize: "12px", lineHeight: "20px", color: "#bababa", marginBottom: "8px" } as const;

export default function GlyphPage() {
  const [ply, setPly] = useState(4); // 3. e5, a top move
  const [evalsShown, setEvalsShown] = useState(true);

  // E shows and hides the evals and glyphs, as in the trainer (UI.34).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyE" && !e.ctrlKey && !e.altKey && !e.metaKey) setEvalsShown((shown) => !shown);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = ply >= 0 ? positions[ply] : null;
  const badge = evalsShown && ply >= 0 ? moveBadge(moves[ply], evals[ply], ply) : null;
  const config = useMemo(
    () => ({
      fen: current?.fen ?? new Chess().fen(),
      orientation: "black" as const,
      lastMove: current ? ([current.from, current.to] as Key[]) : undefined,
      highlight: { lastMove: true, check: true },
      coordinates: true,
      movable: { free: false, color: undefined },
      animation: { enabled: true, duration: 250 },
    }),
    [current],
  );

  return (
    <div style={{ padding: "32px 20px" }}>
      <p style={{ ...caption, textAlign: "center" }}>
        &quot;!?&quot; on Black&apos;s switches (c5, Bg4, Qa5+, Bxf3); a star on White&apos;s top moves (d4, e5, Nf3, Bb5, Nc3).
        Hover an eval for SF&apos;s move and the loss. Click a move or use the arrows. E hides them all.
      </p>
      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", justifyContent: "center" }}>
        <div className="board-themed" style={{ width: "var(--board-size)", height: "var(--board-size)", position: "relative" }}>
          <Chessground contained config={config} />
          {badge && current && <BoardGlyph glyph={badge} square={current.to} orientation="black" />}
        </div>
        <div style={{ width: "318.4px", flexShrink: 0, height: "var(--board-size)", backgroundColor: "var(--lichess-panel-bg)" }}>
          <LichessMoveList moves={moves} evals={evalsShown ? evals : undefined} currentPlyIndex={ply} onMoveClick={setPly} />
        </div>
      </div>
    </div>
  );
}
