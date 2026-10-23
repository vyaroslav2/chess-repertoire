"use client";

// Temporary: try the status line's counts (UI.22, AK.12) beside a real board:
// size, weight, spacing, place and colours. Always shown, no hover.
// Delete this page before deploying (UI.29).
import { useState } from "react";
import Chessground from "@react-chess/chessground";
import "chessground/assets/chessground.base.css";

const muted = { color: "var(--lichess-text-muted)", fontSize: "13px" };
const mono = { fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: "13px" };

// Anki's own colours, from its deckbrowser.css: --state-new,
// --state-learn, --state-review, and --fg-faint for a zero count. Only the
// deck list fades a zero; the deck's overview keeps its colour, in bold.
// Done is ours, not Anki's: violet from the same palette (Tailwind 400 / 600).
const palettes = {
  muted: { label: "Muted", new: "#787674", learn: "#787674", review: "#787674", done: "#787674", zero: "#787674" },
  night: { label: "Anki, night", new: "#93c5fd", learn: "#f87171", review: "#22c55e", done: "#a78bfa", zero: "#545454" },
  day: { label: "Anki, day", new: "#3b82f6", learn: "#dc2626", review: "#16a34a", done: "#7c3aed", zero: "#545454" },
};
type PaletteName = keyof typeof palettes;

// Real names from the repertoire: its longest, a long one, and UI.20's example.
const openings = [
  "D00 Queen's Pawn Game: Accelerated London System, Steinitz Countergambit, Morris Countergambit",
  "B11 Caro-Kann Defense: Two Knights Attack, Mindeno Variation, Exchange Line",
  "A40 Queen's Pawn Game",
];

// Inter's recommended tracking, in em (UI.20).
const interTracking = (px: number) => -0.0223 + 0.185 * Math.exp(-0.1745 * px);

// The opening's grey, #979490, is hsl(34 3.3% 57.8%). The lightness slider
// keeps its warm tint and moves along that line.
const openingGrey = { hue: 34, saturation: 0.033, lightness: 57.8 };

function greyHex(lightness: number) {
  const { hue, saturation } = openingGrey;
  const l = lightness / 100;
  const a = saturation * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return "#" + [0, 8, 4].map((n) => channel(n).toString(16).padStart(2, "0")).join("");
}

// WCAG contrast against the page background, #161512.
function contrast(hex: string) {
  const luminance = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  return (luminance(hex) + 0.05) / (luminance("#161512") + 0.05);
}

const isHex = (text: string) => /^#[0-9a-f]{6}$/i.test(text);

function Slider({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (value: number) => void;
  min: number; max: number; step: number; unit: string;
}) {
  return (
    <label style={{ ...muted, display: "flex", gap: "8px", alignItems: "center" }}>
      <span style={{ width: "120px" }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span style={{ ...mono, width: "56px" }}>{value}{unit}</span>
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label style={{ ...muted, display: "flex", gap: "6px", alignItems: "center" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const buttonStyle = {
  ...mono, padding: "4px 8px", color: "var(--lichess-text-primary)",
  background: "var(--lichess-panel-bg)", border: "1px solid var(--lichess-border)",
};

export default function StatusPage() {
  const [size, setSize] = useState(16);
  const [weight, setWeight] = useState(400);
  const [lineHeight, setLineHeight] = useState(24);
  const [columnGap, setColumnGap] = useState(16);
  const [gapToBoard, setGapToBoard] = useState(60);
  const [top, setTop] = useState(0);
  const [numbersRight, setNumbersRight] = useState(true);
  const [palette, setPalette] = useState<PaletteName>("night");
  const [labelsColoured, setLabelsColoured] = useState(false);
  const [fadeZeros, setFadeZeros] = useState(false);
  const [numberWeight, setNumberWeight] = useState(350);
  const [counts, setCounts] = useState([9999, 9999, 9999, 9999]);
  const [openingSize, setOpeningSize] = useState(14);
  const [openingWeight, setOpeningWeight] = useState(375);
  const [openingGap, setOpeningGap] = useState(4);
  const [opening, setOpening] = useState(openings[0]);
  const [openingColour, setOpeningColour] = useState("#979490");
  const [openingColourText, setOpeningColourText] = useState("#979490");
  const [openingLightness, setOpeningLightness] = useState(openingGrey.lightness);
  const chooseOpeningColour = (hex: string) => {
    setOpeningColour(hex.toLowerCase());
    setOpeningColourText(hex.toLowerCase());
  };
  const openingTracking = interTracking(openingSize);

  const colours = palettes[palette];
  const tracking = interTracking(size);
  const rows = [
    { label: "New", count: counts[0], colour: colours.new },
    { label: "Learning", count: counts[1], colour: colours.learn },
    { label: "To Review", count: counts[2], colour: colours.review },
    { label: "Done", count: counts[3], colour: colours.done },
  ];
  const countColour = (count: number, colour: string) => (fadeZeros && count === 0 ? colours.zero : colour);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", padding: "44px 16px" }}>
      {/* Board row, as in the trainer: the counts hang off the board's left edge */}
      <div style={{ position: "relative", width: "var(--board-size)", height: "var(--board-size)" }}>
        <div
          style={{
            position: "absolute",
            right: `calc(100% + ${gapToBoard}px)`,
            top: `${top}px`,
            display: "grid",
            gridTemplateColumns: "auto auto",
            columnGap: `${columnGap}px`,
            fontSize: `${size}px`,
            fontWeight: weight,
            lineHeight: `${lineHeight}px`,
            letterSpacing: `${tracking.toFixed(4)}em`,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            color: "var(--lichess-text-muted)",
          }}
        >
          {rows.map((row) => (
            <div key={row.label} style={{ display: "contents" }}>
              <span style={labelsColoured ? { color: countColour(row.count, row.colour) } : undefined}>{row.label}</span>
              <span style={{ color: countColour(row.count, row.colour), textAlign: numbersRight ? "right" : "left", fontWeight: numberWeight }}>{row.count}</span>
            </div>
          ))}
        </div>
        {/* Opening name above the board, as in the trainer (UI.20, UI.28) */}
        <div
          title={opening}
          style={{
            position: "absolute",
            left: 0,
            bottom: `calc(100% + ${openingGap}px)`,
            width: "100%",
            color: openingColour,
            fontSize: `${openingSize}px`,
            fontWeight: openingWeight,
            // 20px at 14px, as UI.20
            lineHeight: `${Math.round((openingSize * 20) / 14)}px`,
            letterSpacing: `${openingTracking.toFixed(4)}em`,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {opening}
        </div>
        <div className="board-themed" style={{ width: "100%", height: "100%", boxShadow: "var(--glass-shadow)" }}>
          <Chessground width="100%" height="100%" config={{ coordinates: true, viewOnly: true }} />
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: "40px", flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Slider label="Size" value={size} onChange={setSize} min={11} max={28} step={0.5} unit="px" />
          <Slider label="Label weight" value={weight} onChange={setWeight} min={100} max={900} step={25} unit="" />
          <Slider label="Number weight" value={numberWeight} onChange={setNumberWeight} min={100} max={900} step={25} unit="" />
          <Slider label="Line height" value={lineHeight} onChange={setLineHeight} min={12} max={48} step={1} unit="px" />
          <Slider label="Column gap" value={columnGap} onChange={setColumnGap} min={0} max={64} step={1} unit="px" />
          <div style={muted}>Letter spacing follows the size: <span style={mono}>{tracking.toFixed(4)}em</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Slider label="Gap to board" value={gapToBoard} onChange={setGapToBoard} min={0} max={200} step={1} unit="px" />
          <Slider label="From top" value={top} onChange={setTop} min={0} max={640} step={1} unit="px" />
          <Check label="Numbers right-aligned" checked={numbersRight} onChange={setNumbersRight} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {(Object.keys(palettes) as PaletteName[]).map((name) => (
              <button
                key={name}
                onClick={() => setPalette(name)}
                style={{ ...buttonStyle, borderColor: palette === name ? "var(--lichess-text-muted)" : "var(--lichess-border)" }}
              >
                {palettes[name].label}
              </button>
            ))}
          </div>
          <Check label="Labels in colour too" checked={labelsColoured} onChange={setLabelsColoured} />
          <Check label="Zeros faint, as Anki's deck list" checked={fadeZeros} onChange={setFadeZeros} />
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            {rows.map((row, i) => (
              <input
                key={row.label}
                type="number"
                min={0}
                value={row.count}
                aria-label={row.label}
                onChange={(e) => setCounts(counts.map((c, j) => (j === i ? Math.max(0, Number(e.target.value)) : c)))}
                style={{ ...buttonStyle, width: "72px" }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            <button style={buttonStyle} onClick={() => setCounts([9999, 9999, 9999, 9999])}>9999 each</button>
            <button style={buttonStyle} onClick={() => setCounts([54, 5, 0, 6])}>54 · 5 · 0 · 6</button>
            <button style={buttonStyle} onClick={() => setCounts([0, 0, 0, 0])}>0 · 0 · 0 · 0</button>
          </div>
        </div>
      </div>

      {/* Opening name */}
      <div style={{ display: "flex", gap: "40px", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Slider label="Opening size" value={openingSize} onChange={setOpeningSize} min={10} max={24} step={0.5} unit="px" />
          <Slider label="Opening weight" value={openingWeight} onChange={setOpeningWeight} min={100} max={900} step={25} unit="" />
          <Slider label="Gap above board" value={openingGap} onChange={setOpeningGap} min={0} max={24} step={1} unit="px" />
          <Slider
            label="Opening grey"
            value={openingLightness}
            onChange={(lightness) => {
              setOpeningLightness(lightness);
              chooseOpeningColour(greyHex(lightness));
            }}
            min={30}
            max={95}
            step={0.2}
            unit="%"
          />
          <label style={{ ...muted, display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ width: "120px" }}>Opening colour</span>
            <input type="color" value={openingColour} onChange={(e) => chooseOpeningColour(e.target.value)} />
            <input
              value={openingColourText}
              onChange={(e) => {
                setOpeningColourText(e.target.value);
                if (isHex(e.target.value)) setOpeningColour(e.target.value.toLowerCase());
              }}
              placeholder="#979490"
              style={{ ...buttonStyle, width: "88px" }}
            />
            <span style={{ ...mono, width: "64px" }}>{contrast(openingColour).toFixed(2)} : 1</span>
          </label>
          <div style={{ display: "flex", gap: "4px" }}>
            <button style={buttonStyle} onClick={() => { setOpeningLightness(openingGrey.lightness); chooseOpeningColour("#979490"); }}>#979490 (now)</button>
            <button style={buttonStyle} onClick={() => chooseOpeningColour("#a3a09c")}>#a3a09c</button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {openings.map((name) => (
            <button
              key={name}
              onClick={() => setOpening(name)}
              style={{ ...buttonStyle, textAlign: "left", borderColor: opening === name ? "var(--lichess-text-muted)" : "var(--lichess-border)" }}
            >
              {name.length} chars: {name.length > 40 ? name.slice(0, 40) + "…" : name}
            </button>
          ))}
        </div>
      </div>

      {/* The current choice, to copy into UI.20 and UI.22 */}
      <div style={{ ...mono, color: "var(--lichess-text-muted)" }}>
        Opening: Inter {openingSize}px, weight {openingWeight}, line height {Math.round((openingSize * 20) / 14)}px, letter spacing {openingTracking.toFixed(4)}em, {openingColour} ({contrast(openingColour).toFixed(2)} : 1), {openingGap}px above the board
      </div>
      <div style={{ ...mono, color: "var(--lichess-text-muted)" }}>
        Counts:
        Inter {size}px, labels weight {weight}, numbers weight {numberWeight}, line height {lineHeight}px, letter spacing {tracking.toFixed(4)}em ·
        column gap {columnGap}px, numbers {numbersRight ? "right" : "left"}-aligned · {gapToBoard}px left of the board, {top}px from its top ·
        {" "}{colours.label}{labelsColoured ? ", labels too" : ""}{fadeZeros ? ", zeros faint" : ""}
      </div>
    </div>
  );
}
