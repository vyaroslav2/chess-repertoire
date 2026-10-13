"use client";

// Temporary: try the settings button (SM.01) at a larger scale, with a chosen corner
// rounding. Delete this page before deploying (UI.29).
import { useState } from "react";
import SettingsButton from "../../components/SettingsButton";

const muted = { color: "var(--lichess-text-muted)", fontSize: "13px" };
const mono = { fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: "13px" };

export default function SettingsPage() {
  const [radius, setRadius] = useState(4);
  const [scale, setScale] = useState(6);
  const vars = { "--settings-button-radius": `${radius}px` } as React.CSSProperties;
  const inPlace = { position: "static" } as const;

  return (
    <div style={{ ...vars, display: "flex", flexDirection: "column", alignItems: "center", gap: "40px", padding: "44px 16px" }}>
      <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
        <label style={{ ...muted, display: "flex", gap: "8px", alignItems: "center" }}>
          Rounding
          <input type="range" min={0} max={12} step={0.5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
          <span style={mono}>{radius}px</span>
        </label>
        <label style={{ ...muted, display: "flex", gap: "8px", alignItems: "center" }}>
          Scale
          <input type="range" min={1} max={12} step={1} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
          <span style={mono}>{scale}×</span>
        </label>
      </div>

      {/* Scaled up: as it is, and with the hover box forced on */}
      <div style={{ display: "flex", gap: "16px", zoom: scale }}>
        <SettingsButton style={inPlace} />
        <SettingsButton className="hover" style={inPlace} />
      </div>
      <div style={muted}>Left: as it is. Right: on hover. Hover either to check.</div>

      {/* Real size */}
      <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
        <SettingsButton style={inPlace} />
        <SettingsButton className="hover" style={inPlace} />
        <span style={muted}>Real size</span>
      </div>

      {/* And the real one, in its corner */}
      <SettingsButton />
    </div>
  );
}
