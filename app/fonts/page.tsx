// Compare candidate fonts for the opening name above the board, at its real size and colour.
// Kept as a reference; Inter with default spacing was chosen (2026-10-11).
import { DM_Sans, Geist, IBM_Plex_Sans, Inter, Noto_Sans, Roboto, Source_Sans_3 } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });
// With the optical-size axis, so the large-text design can be forced at 14px.
const interOpsz = Inter({ subsets: ["latin"], axes: ["opsz"] });
const notoSans = Noto_Sans({ subsets: ["latin"] });
const roboto = Roboto({ subsets: ["latin"] });
const sourceSans = Source_Sans_3({ subsets: ["latin"] });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"] });
const geist = Geist({ subsets: ["latin"] });
const dmSans = DM_Sans({ subsets: ["latin"] });

const fonts: { name: string; note: string; fontFamily: string; variation?: string }[] = [
  { name: "Inter", note: "current", fontFamily: inter.style.fontFamily },
  { name: "Inter opsz 24", note: "between text and display", fontFamily: interOpsz.style.fontFamily, variation: "'opsz' 24" },
  { name: "Inter opsz 32", note: "display design, as Obsidian draws it at 30px", fontFamily: interOpsz.style.fontFamily, variation: "'opsz' 32" },
  { name: "Segoe UI", note: "before Inter; system font, Windows only", fontFamily: "'Segoe UI'" },
  { name: "Arial", note: "before Inter, for coordinates and move numbers; system font", fontFamily: "Arial" },
  { name: "Noto Sans", note: "Lichess uses it", fontFamily: notoSans.style.fontFamily },
  { name: "Roboto", note: "", fontFamily: roboto.style.fontFamily },
  { name: "Source Sans 3", note: "narrow", fontFamily: sourceSans.style.fontFamily },
  { name: "IBM Plex Sans", note: "", fontFamily: plexSans.style.fontFamily },
  { name: "Geist", note: "", fontFamily: geist.style.fontFamily },
  { name: "DM Sans", note: "", fontFamily: dmSans.style.fontFamily },
];

// Real names from the database, short to long, then one made long on purpose to show the ellipsis.
const samples = [
  "A00 Mieses Opening",
  "A40 Queen's Pawn Game",
  "B10 Caro-Kann Defense: Accelerated Panov Attack",
  "D00 Queen's Pawn Game: Accelerated London System, Steinitz Countergambit",
  "D00 Queen's Pawn Game: Accelerated London System, Steinitz Countergambit, Caro-Kann Defense: Accelerated Panov Attack",
];

export default function FontsPage() {
  return (
    <div style={{ width: "var(--board-size)", margin: "0 auto", padding: "32px 0" }}>
      {fonts.map((font) => (
        <section key={font.name} style={{ marginBottom: "28px" }}>
          <div style={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: "12px", lineHeight: "20px", color: "#bababa" }}>
            {font.name}
            {font.note && <span style={{ color: "#555" }}> · {font.note}</span>}
          </div>
          {/* Same style as the opening name above the board (UI.08) */}
          {samples.map((text) => (
            <div
              key={text}
              title={text}
              style={{
                fontFamily: font.fontFamily, fontVariationSettings: font.variation, fontSize: "14px", lineHeight: "20px",
                color: "var(--opening-text)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {text}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
