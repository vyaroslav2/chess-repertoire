"use client";

import React, { useState } from "react";
import ChessBoardWidget from "../components/ChessBoardWidget";

export default function Home() {
  const [mode, setMode] = useState<"line" | "move">("line");
  const [pieceSet, setPieceSet] = useState<"cburnett" | "staunty" | "alpha" | "merida">("cburnett");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      
      {/* Lichess Top Header */}
      <header className="lichess-header">
        <h1>lichess.org</h1>
        <nav>
          <a href="#" className="active">Study / Trainer</a>
          <a href="#">Analysis</a>
          <a href="#">Tools</a>
        </nav>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: "1200px", margin: "24px auto", padding: "0 16px", width: "100%", flex: 1 }}>
        
        {/* Sub Header / Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <button 
              className={`btn btn-lichess-secondary ${mode === "line" ? "active" : ""}`}
              onClick={() => setMode("line")}
            >
              Whole Line Mode
            </button>
            <button 
              className={`btn btn-lichess-secondary ${mode === "move" ? "active" : ""}`}
              onClick={() => setMode("move")}
            >
              Single Move Mode
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.9rem" }}>
            <label htmlFor="pieceSet" style={{ color: "var(--lichess-text-muted)" }}>Piece Set:</label>
            <select 
              id="pieceSet"
              value={pieceSet} 
              onChange={(e) => setPieceSet(e.target.value as any)}
              style={{
                background: "var(--lichess-panel-secondary)",
                color: "var(--lichess-text-bright)",
                border: "1px solid var(--lichess-border)",
                padding: "6px 12px",
                borderRadius: "3px",
                fontFamily: "inherit"
              }}
            >
              <option value="cburnett">cburnett (Default Lichess)</option>
              <option value="staunty">Staunty</option>
              <option value="alpha">Alpha</option>
              <option value="merida">Merida</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
          
          {/* Left Panel: Chessboard */}
          <div className="lichess-panel" style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <ChessBoardWidget pieceSet={pieceSet} onMove={(san) => console.log("Moved:", san)} />
          </div>

          {/* Right Panel: Study / SRS Controls */}
          <div className="lichess-panel" style={{ flex: "1 1 350px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ borderBottom: "1px solid var(--lichess-border)", paddingBottom: "12px", marginBottom: "16px" }}>
                <h2>Current Repertoire Review</h2>
                <p style={{ color: "var(--lichess-text-muted)", fontSize: "0.9rem" }}>
                  {mode === "line" ? "Recollect and play the complete opening line." : "Calculate and execute the single optimal response."}
                </p>
              </div>

              {/* Move History / Notation Box */}
              <div style={{ background: "var(--lichess-panel-secondary)", border: "1px solid var(--lichess-border)", padding: "14px", borderRadius: "3px", marginBottom: "16px" }}>
                <p style={{ fontSize: "0.85rem", color: "var(--lichess-text-muted)", marginBottom: "4px" }}>Sequence:</p>
                <p style={{ fontWeight: 600, color: "var(--lichess-text-bright)", fontSize: "1.05rem" }}>1. e4 e5 2. Nf3 Nc6</p>
              </div>
              
              {/* AI Explanation Box */}
              <div style={{ background: "var(--lichess-panel-secondary)", border: "1px solid var(--lichess-border)", padding: "14px", borderRadius: "3px" }}>
                <p style={{ fontSize: "0.85rem", color: "var(--lichess-green)", fontWeight: 700, marginBottom: "4px" }}>AI Practical Note (1800+ Human Preference):</p>
                <p style={{ fontSize: "0.92rem", fontStyle: "italic", color: "var(--lichess-text-bright)" }}>
                  "Bc4 is the most practical choice here at the 1800 level, avoiding the complex main lines of the Ruy Lopez."
                </p>
              </div>
            </div>

            {/* Anki Review Buttons */}
            <div style={{ marginTop: "32px", borderTop: "1px solid var(--lichess-border)", paddingTop: "20px" }}>
              <p style={{ textAlign: "center", marginBottom: "12px", fontSize: "0.85rem", color: "var(--lichess-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Rate recall difficulty (Anki SRS):
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                <button className="btn btn-again" style={{ flexDirection: "column", gap: "2px" }}>
                  Again
                  <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>1m</span>
                </button>
                <button className="btn btn-hard" style={{ flexDirection: "column", gap: "2px" }}>
                  Hard
                  <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>5m</span>
                </button>
                <button className="btn btn-good" style={{ flexDirection: "column", gap: "2px" }}>
                  Good
                  <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>1d</span>
                </button>
                <button className="btn btn-easy" style={{ flexDirection: "column", gap: "2px" }}>
                  Easy
                  <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>4d</span>
                </button>
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
