import React from "react";
export const dynamic = "force-dynamic";
import SrsTrainer from "../components/SrsTrainer";
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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", 
    background: "#161512", 
    gap: "20px", padding: "20px" }}>
      <SrsTrainer dueStats={demoStats} demoMode />
    </div>
  );
}
