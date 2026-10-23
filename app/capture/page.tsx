import React from "react";
import SrsTrainer from "../../components/SrsTrainer";

// Temporary: /demo with hand-made one-move cards, to try the capture sound,
// the king in check and the mate sign. No database. Delete before deploying (UI.29).
const lines = [
  // White's dxc6 is a capture. Right: Nxc6. Wrong: bxc6, also a capture.
  { color: "BLACK", line: ["e4", "d5", "exd5", "Nf6", "c4", "c6", "dxc6"], answer: "Nxc6" },
  // Your king is in check. Right: Bd2. Wrong: Nc3, Nbd2 or Kf1.
  { color: "WHITE", line: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d4", "exd4", "cxd4", "Bb4+"], answer: "Bd2" },
  // Right: Qxf7#, a capture and mate. Wrong: Bxf7+ or Qxe5+, captures with check.
  { color: "WHITE", line: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6"], answer: "Qxf7#" },
  // Right: Qh4#, mate with no capture.
  { color: "BLACK", line: ["f3", "e5", "g4"], answer: "Qh4#" },
];

const cards = lines.map(({ color, line, answer }, index) => ({
  id: `capture-${index}`,
  repertoire: { color },
  lineMoves: line,
  targetMove: { san: answer, cp: null, mate: null },
  openingByPly: [],
  evalByPly: [],
}));

export default function Capture() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "flex-start", alignItems: "center",
    background: "#161512",
    gap: "20px",
    // As /demo (UI.01, UI.18).
    padding: "max(24px, round(calc((100vh - var(--board-size)) / 2), 0.8px)) 20px 0" }}>
      <SrsTrainer dueStats={cards} demoMode />
    </div>
  );
}
