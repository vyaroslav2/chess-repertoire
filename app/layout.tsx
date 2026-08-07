import type { Metadata } from "next";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
