"use client";

import React, { useState } from "react";
import type { MoveEval } from "./LichessMoveList";

// UI.31: Lichess's winning-chances curve (lila, ui/lib/src/ceval/winningChances.ts).
// -1 is Black winning, +1 White winning.
const rawWinningChances = (cp: number) => 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;

export function winningChances({ cp, mate }: MoveEval): number | null {
  if (mate !== null) {
    // A mate counts as a large cp: mate in 1 is 2000, mate in 10 or more is 1100.
    const mateCp = (21 - Math.min(10, Math.abs(mate))) * 100;
    return rawWinningChances(mate > 0 ? mateCp : -mateCp);
  }
  if (cp === null) return null;
  return rawWinningChances(Math.min(Math.max(-1000, cp), 1000));
}

const ticks = Array.from({ length: 7 }, (_, i) => (
  <div key={i} className={`eval-gauge-tick${i === 3 ? " zero" : ""}`} style={{ height: `${(i + 1) * 12.5}%` }} />
));

interface EvalGaugeProps {
  evaluation: MoveEval | null; // the shown position's eval, in White's view
  orientation: "white" | "black";
}

export default function EvalGauge({ evaluation, orientation }: EvalGaugeProps) {
  // As on Lichess, a position without an eval keeps the last one, dimmed.
  const [last, setLast] = useState(0);
  const chances = evaluation ? winningChances(evaluation) : null;
  if (chances !== null && chances !== last) setLast(chances);
  const shown = chances ?? last;

  return (
    <div
      className={`eval-gauge${chances === null ? " empty" : ""}${orientation === "black" ? " reverse" : ""}`}
      style={{ "--eval-percent": `${100 - (shown + 1) * 50}%` } as React.CSSProperties}
    >
      {ticks}
    </div>
  );
}
