import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "./globals.css";

// Self-hosted at build time, so every visitor gets these fonts without a request to Google.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

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
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
