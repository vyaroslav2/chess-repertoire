// Temporary: compare candidate fonts for the board coordinates, at their real size,
// weight and colour (UI.11). Delete this page once a font is chosen.
import { Arimo, DM_Sans, Geist, IBM_Plex_Sans, Inter, JetBrains_Mono, Noto_Sans, Roboto, Source_Sans_3 } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });
const arimo = Arimo({ subsets: ["latin"] });
const notoSans = Noto_Sans({ subsets: ["latin"] });
const roboto = Roboto({ subsets: ["latin"] });
const sourceSans = Source_Sans_3({ subsets: ["latin"] });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"] });
const geist = Geist({ subsets: ["latin"] });
const dmSans = DM_Sans({ subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"] });

const fonts: { name: string; fontFamily: string }[] = [
  { name: "Inter (before Arial)", fontFamily: inter.style.fontFamily },
  { name: "Arial (chosen)", fontFamily: "Arial" },
  { name: "Arimo (stand-in for Arial)", fontFamily: arimo.style.fontFamily },
  { name: "Segoe UI", fontFamily: "'Segoe UI'" },
  { name: "Noto Sans", fontFamily: notoSans.style.fontFamily },
  { name: "Roboto", fontFamily: roboto.style.fontFamily },
  { name: "Source Sans 3", fontFamily: sourceSans.style.fontFamily },
  { name: "IBM Plex Sans", fontFamily: plexSans.style.fontFamily },
  { name: "Geist", fontFamily: geist.style.fontFamily },
  { name: "DM Sans", fontFamily: dmSans.style.fontFamily },
  { name: "JetBrains Mono", fontFamily: jetbrainsMono.style.fontFamily },
];

export default function CoordsPage() {
  return (
    <div style={{ width: "max-content", margin: "0 auto", padding: "32px 0" }}>
      {fonts.map((font) => (
        <div key={font.name} style={{ display: "flex", alignItems: "baseline", gap: "24px", lineHeight: "32px" }}>
          {/* Same style as the coordinates (UI.11) */}
          <span style={{
            fontFamily: font.fontFamily, fontSize: "13px", fontWeight: 400,
            color: "var(--lichess-text-muted)", textTransform: "lowercase",
          }}>
            1a2b3c4d5e6f7g8h
          </span>
          <span style={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: "12px", color: "#555" }}>
            {font.name}
          </span>
        </div>
      ))}
    </div>
  );
}
