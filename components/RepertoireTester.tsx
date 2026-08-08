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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: "1000px" }}>
      {/* Standalone Chess Board */}
      <ChessBoardWidget key={currentTestPosition.id} pgn={currentTestPosition.pgn} pieceSet="merida" />
    </div>
  );
}
