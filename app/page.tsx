import React from "react";
export const dynamic = "force-dynamic";
import SrsTrainer from "../components/SrsTrainer";
import { ankiNext } from "./anki";

// AK.07: trains from Anki. Asks Anki afresh on each load.
export default async function Home() {
  const anki = await ankiNext();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "flex-start", alignItems: "center",
    background: "#161512",
    gap: "20px",
    // Centre the board down the page (UI.01). The top gap is rounded to whole
    // screen px at 125% (0.8px), so the board stays pixel-exact (UI.18). At least
    // 24px, to leave room for the opening name above the board.
    padding: "max(24px, round(calc((100vh - var(--board-size)) / 2), 0.8px)) 20px 0" }}>
      <SrsTrainer dueStats={anki.status === "card" ? [anki.card] : []} anki={anki} />
    </div>
  );
}
