import React from "react";
export const dynamic = "force-dynamic";
import SrsTrainer from "../components/SrsTrainer";
import SettingsButton from "../components/SettingsButton";
import { fetchDemoPositions } from "./actions";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function Home() {
  const rep = await prisma.repertoire.findFirst({
    where: { stats: { some: {} } },
    orderBy: { title: "asc" },
  });
  
  if (!rep) {
    return (
      <div style={{ color: "white", textAlign: "center", marginTop: "50px" }}>
        <h2>No Repertoire Found</h2>
        <p>Run the generator script first.</p>
      </div>
    );
  }

  const demoStats = await fetchDemoPositions(rep.id);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "flex-start", alignItems: "center", 
    background: "#161512", 
    gap: "20px",
    // Centre the board down the page (UI.01). The top gap is rounded to whole
    // screen px at 125% (0.8px), so the board stays pixel-exact (UI.18). At least
    // 24px, to leave room for the opening name above the board.
    padding: "max(24px, round(calc((100vh - var(--board-size)) / 2), 0.8px)) 20px 0" }}>
      <SrsTrainer dueStats={demoStats} demoMode />
      <SettingsButton />
    </div>
  );
}
