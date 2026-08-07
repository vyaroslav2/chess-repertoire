"use client";

import React from "react";
import ChessBoardWidget from "../components/ChessBoardWidget";

export default function Home() {
  // Mock database simulating what we would fetch from the backend
  const mockDatabase = [
    {
      id: 1,
      opening: "Caro-Kann Defense",
      pgn: "1. e4 c6 2. d4 d5",
    }
  ];

  // We are currently testing with the first entry in our database
  const currentTestPosition = mockDatabase[0];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: "#161512", gap: "20px", padding: "20px" }}>
      
      <div style={{ color: "var(--lichess-text-bright)", textAlign: "center", marginBottom: "10px" }}>
        <h2 style={{ marginBottom: "8px" }}>Testing Mode: {currentTestPosition.opening}</h2>
        <p style={{ color: "var(--lichess-text-muted)", fontSize: "0.9rem" }}>
          Use your <strong>Left</strong> and <strong>Right</strong> arrow keys to navigate through the moves.
        </p>
      </div>

      {/* Standalone Chess Board */}
      <ChessBoardWidget pgn={currentTestPosition.pgn} pieceSet="merida" />
    </div>
  );
}
