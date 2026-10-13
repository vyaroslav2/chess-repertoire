"use client";

// Temporary: try the settings button (SM.01) and menu (SM.06) at a larger scale,
// with chosen corner rounding. Delete this page before deploying (UI.29).
import { useState } from "react";
import SettingsButton from "../../components/SettingsButton";
import SettingsMenu, { SettingsMenuPanel } from "../../components/SettingsMenu";

const muted = { color: "var(--lichess-text-muted)", fontSize: "13px" };
const mono = { fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: "13px" };
const inPlace = { position: "static" } as const;

function Slider({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (value: number) => void;
  min: number; max: number; step: number; unit: string;
}) {
  return (
    <label style={{ ...muted, display: "flex", gap: "8px", alignItems: "center" }}>
      {label}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span style={{ ...mono, width: "48px" }}>{value}{unit}</span>
    </label>
  );
}

export default function SettingsPage() {
  const [buttonRadius, setButtonRadius] = useState(4);
  const [panelRadius, setPanelRadius] = useState(1);
  const [itemRadius, setItemRadius] = useState(0);
  const [buttonScale, setButtonScale] = useState(6);
  const [menuScale, setMenuScale] = useState(3);
  const vars = {
    "--settings-button-radius": `${buttonRadius}px`,
    "--settings-menu-radius": `${panelRadius}px`,
    "--settings-menu-item-radius": `${itemRadius}px`,
  } as React.CSSProperties;

  return (
    <div style={{ ...vars, display: "flex", flexDirection: "column", alignItems: "center", gap: "40px", padding: "44px 16px" }}>
      {/* Button */}
      <div style={{ display: "flex", gap: "32px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        <Slider label="Button rounding" value={buttonRadius} onChange={setButtonRadius} min={0} max={12} step={0.5} unit="px" />
        <Slider label="Scale" value={buttonScale} onChange={setButtonScale} min={1} max={12} step={1} unit="×" />
      </div>
      <div style={{ display: "flex", gap: "16px", zoom: buttonScale }}>
        <SettingsButton style={inPlace} />
        <SettingsButton className="hover" style={inPlace} />
      </div>
      <div style={muted}>Left: as it is. Right: on hover. Hover either to check.</div>

      {/* Menu, with the second item's hover box on */}
      <div style={{ display: "flex", gap: "32px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        <Slider label="Panel rounding" value={panelRadius} onChange={setPanelRadius} min={0} max={16} step={0.5} unit="px" />
        <Slider label="Hover rounding" value={itemRadius} onChange={setItemRadius} min={0} max={12} step={0.5} unit="px" />
        <Slider label="Scale" value={menuScale} onChange={setMenuScale} min={1} max={6} step={1} unit="×" />
      </div>
      <div style={{ zoom: menuScale }}>
        <SettingsMenuPanel hoverIndex={1} style={inPlace} />
      </div>

      {/* Real size */}
      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        <SettingsButton style={inPlace} />
        <SettingsButton className="hover" style={inPlace} />
        <SettingsMenuPanel hoverIndex={1} style={inPlace} />
        <span style={muted}>Real size</span>
      </div>

      {/* And the real one, in its corner: click it */}
      <SettingsMenu
        line={["d4", "d5"]}
        ply={2}
        fen="rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2"
        orientation="white"
      />
    </div>
  );
}
