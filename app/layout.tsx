import type { Metadata } from "next";
import { Arimo, Inter, JetBrains_Mono, Roboto } from "next/font/google";
import localFont from "next/font/local";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "./globals.css";
import HotkeyToggle from "../components/HotkeyToggle";
import { defaultBoard, defaultPieceSet, themeScript } from "../components/board-themes";

// Self-hosted at build time, so every visitor gets these fonts without a request to Google.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });
// Stand-in for Arial in the coordinates. Not preloaded: only machines without Arial download it.
const arimo = Arimo({ subsets: ["latin"], variable: "--font-arimo", preload: false });
// Moves in the move list (UI.14).
const roboto = Roboto({ subsets: ["latin"], variable: "--font-roboto" });
// Evals in the move list (UI.26): JetBrains Mono Light with a plain zero, no dot.
// Built by scripts/build_eval_font.py; licence in app/_fonts/OFL.txt.
const evalMono = localFont({ src: "./_fonts/EvalMono-Light.woff2", weight: "300", variable: "--font-eval-mono" });

export const metadata: Metadata = {
  title: "Chess Repertoire Training",
  description: "Custom chess opening repertoire training with SRS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The script in <head> may change the board and pieces before React hydrates (SM.08, SM.09).
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${arimo.variable} ${roboto.variable} ${evalMono.variable}`}
      data-board={defaultBoard}
      data-piece-set={defaultPieceSet}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <HotkeyToggle keys={["KeyC", "KeyU"]} className="coords-large" />
        {children}
      </body>
    </html>
  );
}
