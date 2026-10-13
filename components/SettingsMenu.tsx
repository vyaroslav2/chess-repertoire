"use client";

import { useEffect, useRef, useState } from "react";
import SettingsButton from "./SettingsButton";

// The settings button and its menu (SM.01–SM.04). For now the menu holds actions
// on the line on the board; settings come later (SM.05).

interface SettingsMenuProps {
  line: string[]; // the moves in the move list, in SAN, from the start position
  ply: number; // the position on the board: 0 is the start, 1 after the first move
  fen: string; // the position on the board
  orientation: "white" | "black";
}

// "1. d4 d5 2. Bf4": movetext only, no headers or result (SM.03).
function movetext(line: string[]) {
  return line.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(" ");
}

// The whole line on Lichess's analysis board, at the board's ply and orientation (SM.02).
function lichessUrl(line: string[], ply: number, orientation: string) {
  if (line.length === 0) return `https://lichess.org/analysis?color=${orientation}`;
  return `https://lichess.org/analysis/pgn/${encodeURIComponent(movetext(line))}?color=${orientation}#${ply}`;
}

// Lucide icons (ISC licence): "external-link" and "copy".
const externalLink = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);
const copy = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

export default function SettingsMenu({ line, ply, fen, orientation }: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // A click outside or Escape closes the menu.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const items = [
    { label: "Open on Lichess", icon: externalLink, run: () => window.open(lichessUrl(line, ply, orientation), "_blank", "noopener") },
    { label: "Copy PGN", icon: copy, run: () => navigator.clipboard.writeText(movetext(line)) },
    { label: "Copy FEN", icon: copy, run: () => navigator.clipboard.writeText(fen) },
  ];

  return (
    <div ref={rootRef}>
      <SettingsButton open={open} onClick={() => setOpen((prev) => !prev)} />
      {open && (
        <div className="settings-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              className="settings-menu-item"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                item.run();
                setOpen(false);
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
