"use client";

import { useEffect, useRef, useState } from "react";
import SettingsButton from "./SettingsButton";
import {
  applyBoard,
  applyPieceSet,
  boardKey,
  boards,
  pieceSetKey,
  pieceSets,
  pieceUrl,
  thumbnailUrl,
} from "./board-themes";

// The settings button and its menu (SM.01–SM.04, SM.06–SM.09): actions on the line on the
// board, then the board and the piece set.

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

// Lucide icons (ISC licence): "external-link", "copy", "grid-3x3", "crown",
// "chevron-right" and "chevron-left".
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
const grid = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
    <path d="M3 15h18" />
    <path d="M9 3v18" />
    <path d="M15 3v18" />
  </svg>
);
const crown = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
    <path d="M5 21h14" />
  </svg>
);
const chevronRight = (
  <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);
const chevronLeft = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

type Picker = "board" | "pieces";

const items = [
  { label: "Open on Lichess", icon: externalLink },
  { label: "Copy PGN", icon: copy },
  { label: "Copy FEN", icon: copy },
];
const pickers: { label: string; icon: React.ReactNode; picker: Picker }[] = [
  { label: "Board", icon: grid, picker: "board" },
  { label: "Piece set", icon: crown, picker: "pieces" },
];

// Never takes focus, so Enter still goes to the trainer.
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

function MenuItem({ hover, onClick, children }: { hover?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button className={`settings-menu-item${hover ? " hover" : ""}`} role="menuitem" onMouseDown={keepFocus} onClick={onClick}>
      {children}
    </button>
  );
}

interface SettingsMenuPanelProps {
  onSelect?: (index: number) => void;
  onOpenPicker?: (picker: Picker) => void;
  hoverIndex?: number; // shows that item's hover box, for the test page
  style?: React.CSSProperties;
}

// The panel alone, so the test page can show it open (UI.29).
export function SettingsMenuPanel({ onSelect, onOpenPicker, hoverIndex, style }: SettingsMenuPanelProps) {
  return (
    <div className="settings-menu" role="menu" style={style}>
      {items.map((item, index) => (
        <MenuItem key={item.label} hover={index === hoverIndex} onClick={() => onSelect?.(index)}>
          {item.icon}
          {item.label}
        </MenuItem>
      ))}
      <div className="settings-menu-separator" role="separator" />
      {pickers.map((item) => (
        <MenuItem key={item.label} onClick={() => onOpenPicker?.(item.picker)}>
          {item.icon}
          {item.label}
          {chevronRight}
        </MenuItem>
      ))}
    </div>
  );
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// The boards or the piece sets, in the menu's place (SM.08, SM.09). A choice shows on the
// board at once and is kept; the list stays open, to compare.
function PickerPanel({ picker, onBack }: { picker: Picker; onBack: () => void }) {
  const [board, setBoard] = useState(() => document.documentElement.dataset.board);
  const [pieceSet, setPieceSet] = useState(() => document.documentElement.dataset.pieceSet);

  return (
    <div className="settings-menu picker" role="menu">
      <MenuItem onClick={onBack}>
        {chevronLeft}
        {picker === "board" ? "Board" : "Piece set"}
      </MenuItem>
      <div className="settings-menu-separator" role="separator" />
      {picker === "board" ? (
        <div className="settings-picker boards">
          {Object.keys(boards).map((name) => (
            <button
              key={name}
              className={name === board ? "active" : undefined}
              title={name}
              onMouseDown={keepFocus}
              onClick={() => {
                applyBoard(name);
                save(boardKey, name);
                setBoard(name);
              }}
            >
              <span
                className={boards[name] === "svg" ? "svg" : undefined}
                style={{ backgroundImage: `url(${thumbnailUrl(name)})` }}
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="settings-picker pieces">
          {Object.keys(pieceSets).map((name) => (
            <button
              key={name}
              className={name === pieceSet ? "active" : undefined}
              title={name}
              style={{ backgroundImage: `url(${pieceUrl(name, "wN")})` }}
              onMouseDown={keepFocus}
              onClick={() => {
                applyPieceSet(name);
                save(pieceSetKey, name);
                setPieceSet(name);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsMenu({ line, ply, fen, orientation }: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null); // a list in the menu's place
  const rootRef = useRef<HTMLDivElement>(null);

  // "PGN copied", shown where the menu was, once it has closed (SM.07).
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const noticeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showNotice = (text: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice({ text, id: Date.now() }); // a new id restarts the fade
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2450);
  };
  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
  }, []);

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

  const run = [
    () => window.open(lichessUrl(line, ply, orientation), "_blank", "noopener"),
    () => navigator.clipboard.writeText(movetext(line)).then(() => showNotice("PGN copied")),
    () => navigator.clipboard.writeText(fen).then(() => showNotice("FEN copied")),
  ];

  return (
    <div ref={rootRef}>
      <SettingsButton
        open={open}
        onClick={() => {
          setNotice(null);
          setPicker(null);
          setOpen((prev) => !prev);
        }}
      />
      {open && !picker && (
        <SettingsMenuPanel
          onSelect={(index) => {
            run[index]();
            setOpen(false);
          }}
          onOpenPicker={setPicker}
        />
      )}
      {open && picker && <PickerPanel picker={picker} onBack={() => setPicker(null)} />}
      {notice && !open && (
        <div key={notice.id} className="settings-notice" role="status">
          {notice.text}
        </div>
      )}
    </div>
  );
}
