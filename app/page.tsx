"use client";

import React from "react";
import ChessBoardWidget from "../components/ChessBoardWidget";

export default function Home() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#161512" }}>
      <ChessBoardWidget pieceSet="merida" />
    </div>
  );
}
