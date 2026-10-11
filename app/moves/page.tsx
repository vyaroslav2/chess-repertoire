// Temporary: compare candidate fonts for the moves in the move list, at their real
// size, weight and colour (UI.14). Delete this page once a font is chosen.
import {
  DM_Mono, Fira_Code, Geist_Mono, IBM_Plex_Mono, Inter, JetBrains_Mono,
  Noto_Sans, Noto_Sans_Mono, Roboto, Roboto_Mono, Source_Code_Pro,
} from "next/font/google";

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"] });
const firaCode = Fira_Code({ subsets: ["latin"] });
const robotoMono = Roboto_Mono({ subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600"] });
const sourceCodePro = Source_Code_Pro({ subsets: ["latin"] });
const geistMono = Geist_Mono({ subsets: ["latin"] });
const notoSansMono = Noto_Sans_Mono({ subsets: ["latin"] });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"] });
const inter = Inter({ subsets: ["latin"] });
const notoSans = Noto_Sans({ subsets: ["latin"] });
const roboto = Roboto({ subsets: ["latin"] });

const fonts: { name: string; note: string; fontFamily: string }[] = [
  { name: "JetBrains Mono", note: "current", fontFamily: jetbrainsMono.style.fontFamily },
  { name: "Fira Code", note: "", fontFamily: firaCode.style.fontFamily },
  { name: "Roboto Mono", note: "", fontFamily: robotoMono.style.fontFamily },
  { name: "IBM Plex Mono", note: "", fontFamily: plexMono.style.fontFamily },
  { name: "Source Code Pro", note: "", fontFamily: sourceCodePro.style.fontFamily },
  { name: "Geist Mono", note: "", fontFamily: geistMono.style.fontFamily },
  { name: "Noto Sans Mono", note: "", fontFamily: notoSansMono.style.fontFamily },
  { name: "DM Mono", note: "no 600 weight: current move is 500", fontFamily: dmMono.style.fontFamily },
  { name: "Inter", note: "not monospace", fontFamily: inter.style.fontFamily },
  { name: "Noto Sans", note: "not monospace; Lichess's font", fontFamily: notoSans.style.fontFamily },
  { name: "Roboto", note: "not monospace", fontFamily: roboto.style.fontFamily },
  { name: "Arial", note: "not monospace; system font", fontFamily: "Arial" },
  { name: "Segoe UI", note: "not monospace; system font, Windows only", fontFamily: "'Segoe UI'" },
];

// Every character SAN uses, then the longest real moves (7 characters).
const sample = "KQRBN abcdefgh 12345678 x+#=- O-O-O Qh3xf1# exd8=Q+";
// Moves as they sit in the list: short and long, to judge column width.
const moves = ["e4", "Nf3", "Bxe6", "O-O", "O-O-O#", "Qh3xf1#", "exd8=Q+"];

// Finalists, compared move by move.
const finalists: { name: string; fontFamily: string }[] = [
  { name: "Arial", fontFamily: "Arial" },
  { name: "Roboto", fontFamily: roboto.style.fontFamily },
  { name: "Inter", fontFamily: inter.style.fontFamily },
];
// The longest SAN moves (7 characters), between them covering every piece letter,
// file, rank and symbol; then castling and a king move, the only places O, - and K occur.
const longMoves = [
  "Qh3xf1#", "Ba2xc4+", "Nb5xd6#", "Rg7xa7+",
  "exd8=Q+", "gxh1=N#", "cxb8=R+", "fxe1=B#",
  "O-O-O#", "Kxe2+",
];

const cell = { padding: "0 6px", fontSize: "14.5px", lineHeight: "26px" } as const;

export default function MovesPage() {
  return (
    <div style={{ width: "max-content", margin: "0 auto", padding: "32px 0" }}>
      {/* Finalists side by side: each row is one move, as plain and as the current move (UI.14) */}
      <table style={{ borderCollapse: "separate", borderSpacing: "8px 2px", marginBottom: "40px" }}>
        <thead>
          <tr>
            {finalists.flatMap((font) => [font.name, `${font.name} · current`]).map((label) => (
              <th key={label} style={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: "12px", fontWeight: 400, color: "#bababa", textAlign: "left" }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {longMoves.map((san) => (
            <tr key={san}>
              {finalists.flatMap((font) => [
                <td key={font.name} style={{ ...cell, fontFamily: font.fontFamily, background: "var(--lichess-panel-bg)", color: "var(--lichess-text-primary)" }}>
                  {san}
                </td>,
                <td key={`${font.name}-current`} style={{ ...cell, fontFamily: font.fontFamily, background: "var(--lichess-accent)", color: "var(--lichess-text-bright)", fontWeight: 600 }}>
                  {san}
                </td>,
              ])}
            </tr>
          ))}
        </tbody>
      </table>

      {fonts.map((font) => (
        <section key={font.name} style={{ marginBottom: "20px" }}>
          <div style={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: "12px", lineHeight: "20px", color: "#bababa" }}>
            {font.name}
            {font.note && <span style={{ color: "#555" }}> · {font.note}</span>}
          </div>
          {/* Same style as a move in the list (UI.14) */}
          <div style={{ fontFamily: font.fontFamily, fontSize: "14.5px", lineHeight: "26px", color: "var(--lichess-text-primary)" }}>
            {sample}
          </div>
          <div style={{ display: "flex", gap: "4px", fontFamily: font.fontFamily, fontSize: "14.5px", lineHeight: "26px" }}>
            {moves.map((san, i) => (
              <span
                key={san}
                style={i === moves.length - 1
                  // The current move (UI.14)
                  ? { padding: "0 4px", background: "var(--lichess-accent)", color: "var(--lichess-text-bright)", fontWeight: 600 }
                  : { padding: "0 4px", background: "var(--lichess-panel-bg)", color: "var(--lichess-text-primary)" }}
              >
                {san}
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
