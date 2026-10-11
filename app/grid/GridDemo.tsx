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

export default function GridDemo() {
  // Start on the first 7-character move, so the current-move style shows at once.
  const [ply, setPly] = useState(moves.indexOf("Qh3xf1#"));

  return (
    <div style={{ display: "flex", gap: "48px", alignItems: "flex-start", justifyContent: "center", padding: "32px 20px" }}>
      <figure>
        <figcaption style={caption}>As in the app: 220 × board height, scrolls. Click or use the arrow keys.</figcaption>
        <div style={{ ...panel, height: "var(--board-size)" }}>
          <LichessMoveList moves={moves} currentPlyIndex={ply} onMoveClick={setPly} />
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
