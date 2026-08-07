"use client";

import React, { useState } from "react";
import ChessBoardWidget from "../components/ChessBoardWidget";

export default function Home() {
  // Mock database simulating what we would fetch from the backend
  const mockDatabase = [
    {
      id: 1,
      opening: "Caro-Kann Defense",
      pgn: "1. e4 c6 2. d4 d5",
    },
    {
      id: 2,
      opening: "Ruy Lopez",
      pgn: "1. e4 e5 2. Nf3 Nc6 3. Bb5",
    },
    {
      id: 3,
      opening: "Sicilian Defense",
      pgn: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3",
    }
  ];

  const [selectedId, setSelectedId] = useState(1);

  // We are currently testing with the selected entry in our database
  const currentTestPosition = mockDatabase.find((item) => item.id === selectedId) || mockDatabase[0];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: "#161512", gap: "20px", padding: "20px" }}>
      
      <div style={{ color: "var(--lichess-text-bright)", textAlign: "center", marginBottom: "10px" }}>
        <h2 style={{ marginBottom: "8px" }}>Testing Mode: {currentTestPosition.opening}</h2>
        <p style={{ color: "var(--lichess-text-muted)", fontSize: "0.9rem", marginBottom: "12px" }}>
          Use your <strong>Left</strong> and <strong>Right</strong> arrow keys to navigate through the moves.
        </p>

        {/* Dropdown to select opening */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "10px" }}>
          <label htmlFor="opening-select" style={{ fontSize: "0.9rem", color: "var(--lichess-text-muted)" }}>Select Opening:</label>
          <select
            id="opening-select"
            value={selectedId}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            style={{
              background: "#262421",
              color: "#ffffff",
              border: "1px solid #363431",
              padding: "6px 12px",
              borderRadius: "4px",
              fontSize: "0.9rem",
              cursor: "pointer"
            }}
          >
            {mockDatabase.map((item) => (
              <option key={item.id} value={item.id}>
                {item.opening}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Standalone Chess Board */}
      <ChessBoardWidget key={currentTestPosition.id} pgn={currentTestPosition.pgn} pieceSet="merida" />
    </div>
  );
}
