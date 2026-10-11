"use client";

// Temporary: the real move list with hard-coded moves, to see move numbers and
// moves together (1. to 200.). Not legal chess; only the text matters.
import { useState } from "react";
import LichessMoveList from "../../components/LichessMoveList";

// A normal opening first, then a repeating mix of common moves and the rare
// 7-character ones (every SAN character appears).
const opening = [
  "e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7",
  "Re1", "b5", "Bb3", "d6", "c3", "O-O", "h3", "Nb8", "d4", "Nbd7",
];
const mix = [
  "Nbd2", "Bb7", "Bc2", "Re8", "Nf1", "Bf8", "Ng3", "g6", "a4", "c5",
  "d5", "c4", "Bg5", "h6", "Be3", "Nc5", "Qd2", "Kh7", "Qh3xf1#", "exd8=Q+",
  "Rxe8+", "Qxe8", "gxh1=N#", "Nb5xd6#", "Bxf7+", "Kxf7", "Ba2xc4+", "Kg8",
  "Rg7xa7+", "cxb8=R+", "fxe1=B#", "O-O-O", "Kxe2+", "Qxd5", "Nxe5", "dxe5",
  "a8=Q", "Rxa8", "Kb1", "Rd8",
];

const moves: string[] = [...opening];
for (let i = 0; moves.length < 400; i++) moves.push(mix[i % mix.length]);

// Mock evals, -9.99 to +9.99 with two decimals. The first two show +0.00 and -0.00;
// every 7-character move gets ±9.99, the widest case beside the widest moves.
const evals = moves.map((san, i) => {
  if (i === 0) return "+0.00";
  if (i === 1) return "-0.00";
  if (san.length === 7) return i % 2 ? "-9.99" : "+9.99";
  const v = ((i * 7919) % 1999 - 999) / 100;
  return (v < 0 ? "-" : "+") + Math.abs(v).toFixed(2);
});

// The move list with an eval in each move's cell, pushed to its right edge, as on
// Lichess (0.8 × the move size, weight 300, #949494), but in JetBrains Mono with two
// decimals. A copy of LichessMoveList's markup and classes; the real one is untouched.
function EvalMoveList({ current, onClick }: { current: number; onClick: (ply: number) => void }) {
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) rows.push(i);
  const cell = (ply: number) => (
    <div
      key={ply}
      className={`move-san ${ply === current ? "active" : ""}`}
      style={{ display: "flex", alignItems: "baseline", padding: "0 0.3em 0 0.5em" /* Lichess */ }}
      onClick={() => onClick(ply)}
    >
      {moves[ply]}
      <span style={{
        marginLeft: "auto", fontFamily: "var(--font-jetbrains-mono)", fontSize: "0.8em", fontWeight: 300,
        color: ply === current ? "inherit" : "#949494",
      }}>
        {evals[ply]}
      </span>
    </div>
  );
  return (
    <div className="lichess-move-list-container">
      <div className="lichess-move-grid">
        {rows.map((i) => [
          <div key={`n${i}`} className="move-number">{i / 2 + 1}</div>,
          cell(i),
          cell(i + 1),
        ])}
      </div>
    </div>
  );
}

export default function GridDemo() {
  // Start on the first 7-character move, so the current-move style shows at once.
  const [ply, setPly] = useState(moves.indexOf("Qh3xf1#"));
  const [evalPly, setEvalPly] = useState(moves.indexOf("Qh3xf1#"));

  return (
    <div style={{ display: "flex", gap: "48px", alignItems: "flex-start", justifyContent: "center", padding: "32px 20px" }}>
      <figure>
        <figcaption style={caption}>As in the app: 220 × board height, scrolls. Click or use the arrow keys.</figcaption>
        <div style={{ ...panel, height: "var(--board-size)" }}>
          <LichessMoveList moves={moves} currentPlyIndex={ply} onMoveClick={setPly} />
        </div>
      </figure>
      <figure>
        <figcaption style={{ ...caption, width: evalPanelWidth }}>With evals: 318.4 × board height (398 screen px at 125%), scrolls. Click a move.</figcaption>
        <div style={{ ...panel, width: evalPanelWidth, height: "var(--board-size)" }}>
          <EvalMoveList current={evalPly} onClick={setEvalPly} />
        </div>
      </figure>
      <figure>
        <figcaption style={caption}>All 200 moves, same width, no scrolling</figcaption>
        <div style={panel}>
          <LichessMoveList moves={moves} currentPlyIndex={-1} onMoveClick={() => {}} />
        </div>
      </figure>
    </div>
  );
}

const caption = { fontFamily: "var(--font-jetbrains-mono)", fontSize: "12px", lineHeight: "20px", color: "#bababa", marginBottom: "8px", width: "220px" } as const;
const panel = { width: "220px", backgroundColor: "var(--lichess-panel-bg)" } as const;
// 220px plus, per move column, "+9.99" (5 × 0.6 × 13.272px = 39.8px), the 0.3em right
// padding (5px) and the left padding grown from 4px to Lichess's 0.5em (8.3px), rounded
// up to whole screen px at 125%: 318.4px = 398 screen px. The move text keeps its room.
const evalPanelWidth = "318.4px";
