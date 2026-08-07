"use client";

import React, { useState } from "react";
import ChessBoardWidget from "./ChessBoardWidget";

interface RepertoireTesterProps {
  database: {
    id: string | number;
    opening: string;
    pgn: string;
  }[];
}

export default function RepertoireTester({ database }: RepertoireTesterProps) {
  const [selectedId, setSelectedId] = useState(database[0]?.id || "empty");

  const currentTestPosition = database.find((item) => item.id === selectedId) || database[0];

  if (!currentTestPosition) {
    return <div style={{ color: "white" }}>No repertoires found.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: "800px" }}>
      <div style={{ color: "var(--lichess-text-bright)", textAlign: "center", marginBottom: "10px" }}>
        <h2 style={{ marginBottom: "8px" }}>Testing Mode: {currentTestPosition.opening}</h2>
        <p style={{ color: "var(--lichess-text-muted)", fontSize: "0.9rem", marginBottom: "12px" }}>
          Use your <strong>Left</strong> and <strong>Right</strong> arrow keys to navigate through the moves.
        </p>

        {/* Dropdown to select opening */}
        {database.length > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <label htmlFor="opening-select" style={{ fontSize: "0.9rem", color: "var(--lichess-text-muted)" }}>Select Opening:</label>
            <select
              id="opening-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
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
              {database.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.opening}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Standalone Chess Board */}
      <ChessBoardWidget key={currentTestPosition.id} pgn={currentTestPosition.pgn} pieceSet="merida" />
    </div>
  );
}
