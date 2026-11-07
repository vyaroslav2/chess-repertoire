"use client";

// Temporary: try the eval gauge (UI.31) at chosen evals, without the database.
// Delete this page before deploying (UI.29).
import { useState } from "react";
import EvalGauge, { winningChances } from "../../components/EvalGauge";
import type { MoveEval } from "../../components/LichessMoveList";

const cp = (pawns: number): MoveEval => ({ cp: Math.round(pawns * 100), mate: null });
const mate = (moves: number): MoveEval => ({ cp: null, mate: moves });

const steps = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10];
const presets: MoveEval[] = [
  mate(-1), mate(-5),
  ...[...steps].reverse().map((p) => cp(-p)),
  cp(0),
  ...steps.map((p) => cp(p)),
  mate(5), mate(1),
];

// As in the move list (UI.26).
function label({ cp, mate }: MoveEval) {
  if (mate !== null) return `#${mate}`;
  return ((cp ?? 0) < 0 ? "-" : "+") + (Math.abs(cp ?? 0) / 100).toFixed(2);
}

// "-0.25" is pawns, "#-3" a mate.
function parse(text: string): MoveEval | null {
  const m = /^#(-?\d+)$/.exec(text.trim());
  if (m) return Number(m[1]) === 0 ? null : mate(Number(m[1]));
  const pawns = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(pawns) ? cp(pawns) : null;
}

const whiteShare = (e: MoveEval) => (50 + (winningChances(e) ?? 0) * 50).toFixed(1);

const muted = { color: "var(--lichess-text-muted)", fontSize: "13px" };
const mono = { fontFamily: "var(--font-eval-mono), var(--font-jetbrains-mono), monospace", fontWeight: 300 };

export default function GaugePage() {
  const [current, setCurrent] = useState<MoveEval>(cp(0));
  const [text, setText] = useState("");
  const [flipped, setFlipped] = useState(false);
  const orientation = flipped ? "black" : "white";

  return (
    <div style={{ display: "flex", gap: "48px", justifyContent: "center", padding: "44px 16px" }}>
      {/* One gauge you drive: it slides as in the trainer */}
      <div style={{ display: "flex", gap: "16px" }}>
        <div style={{ height: "var(--board-size)" }}>
          <EvalGauge evaluation={current} orientation={orientation} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "200px" }}>
          <div style={{ ...mono, fontSize: "28px", color: "var(--lichess-text-bright)" }}>{label(current)}</div>
          <div style={muted}>White {whiteShare(current)}% · Black {(100 - Number(whiteShare(current))).toFixed(1)}%</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = parse(text);
              if (parsed) setCurrent(parsed);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="-0.25 or #-3, then Enter"
              style={{
                ...mono, width: "100%", padding: "6px 8px", fontSize: "14px",
                background: "var(--lichess-panel-bg)", color: "var(--lichess-text-primary)",
                border: "1px solid var(--lichess-border)",
              }}
            />
          </form>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px" }}>
            {presets.map((e) => (
              <button
                key={label(e)}
                onClick={() => setCurrent(e)}
                style={{ ...mono, fontSize: "13px", padding: "4px 0", background: "var(--lichess-panel-bg)", border: "1px solid var(--lichess-border)" }}
              >
                {label(e)}
              </button>
            ))}
          </div>
          <label style={{ ...muted, display: "flex", gap: "6px", alignItems: "center" }}>
            <input type="checkbox" checked={flipped} onChange={(e) => setFlipped(e.target.checked)} />
            From Black&apos;s side
          </label>
        </div>
      </div>

      {/* Every preset side by side */}
      <div style={{ display: "flex" }}>
        {presets.map((e) => (
          <div key={label(e)} style={{ width: "44px", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
            <div style={{ height: "var(--board-size)" }}>
              <EvalGauge evaluation={e} orientation={orientation} />
            </div>
            <div style={{ ...mono, fontSize: "11px", color: "var(--lichess-text-primary)" }}>{label(e)}</div>
            <div style={{ ...muted, fontSize: "10px" }}>{whiteShare(e)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
