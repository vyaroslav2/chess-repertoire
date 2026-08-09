import React from "react";
import SrsTrainer from "../components/SrsTrainer";
import { fetchDuePositions } from "./actions";

export default async function Home() {
  const dueStats = await fetchDuePositions("some-repertoire-id");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", 
    /*background: "yellow",*/ 
    background: "#161512", 
    gap: "20px", padding: "20px" }}>
      <SrsTrainer dueStats={dueStats} />
    </div>
  );
}
