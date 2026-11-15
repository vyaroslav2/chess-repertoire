// Lichess's board glyphs, as in its chessground (src/glyph.ts: composeGlyph, glyphToSvg,
// endgameGlyphs), GPL-3.0-or-later. Drawn over the board by us, not as a chessground shape:
// chessground 8 draws shapes only once a piece has slid in, so a sign came after its move.
// That would not match Lichess: its analysis sets the board, then the shapes apart
// (lila ui/analyse/src/ctrl.ts: showGround, then setAutoShapes), which redraws them on the
// next frame, mid-slide. So on Lichess a badge shows as its move starts to slide, and so
// does ours (UI.41).
// Its origin is the square's top-left; 100 is a square. At the top-right corner, as the
// first glyph on a square.
const compose = (fill: string, path: string) =>
  '<defs><filter id="a"><feDropShadow dx="4" dy="7" flood-opacity=".5" stdDeviation="5"/></filter></defs>' +
  `<g transform="matrix(.4 0 0 .4 71 -12)"><circle cx="50" cy="50" r="50" fill="${fill}" filter="url(#a)"/>${path}</g>`;

const glyphs = {
  // The mated king (endgameGlyphs.mate).
  mate: compose("#df5353", '<path fill="none" stroke="#fff" stroke-width="8" d="M38 18 33 82M62 18l-5 64M20 40h60M18 62h60"/>'),
  // UI.41: an interesting move, on a human-evidence switch's square (glyphToSvg["!?"]).
  "!?": compose(
    "#ea45d8",
    '<path fill="#fff" d="M60.823 58.9q0-4.098 1.72-6.883 1.721-2.786 5.9-5.818 3.687-2.622 5.243-4.506 1.64-1.966 1.64-4.588t-1.967-3.933q-1.885-1.393-5.326-1.393t-6.8 1.065q-3.36 1.065-6.883 2.868l-4.343-8.767q4.015-2.212 8.685-3.605 4.67-1.393 10.242-1.393 8.521 0 13.192 4.097 4.752 4.096 4.752 10.405 0 3.36-1.065 5.818-1.066 2.458-3.196 4.588-2.13 2.048-5.326 4.424-2.376 1.72-3.687 2.95-1.31 1.229-1.802 2.376-.41 1.147-.41 2.868v2.376h-10.57zm-1.311 16.632q0-3.77 2.048-5.244 2.049-1.557 4.998-1.557 2.868 0 4.916 1.557 2.049 1.475 2.049 5.244 0 3.605-2.049 5.244-2.048 1.556-4.916 1.556-2.95 0-4.998-1.556-2.048-1.64-2.048-5.244zM36.967 61.849h-9.75l-2.049-39.083h13.847zM25.004 75.532q0-3.77 2.049-5.244 2.048-1.557 4.998-1.557 2.867 0 4.916 1.557 2.048 1.475 2.048 5.244 0 3.605-2.048 5.244-2.049 1.556-4.916 1.556-2.95 0-4.998-1.556-2.049-1.64-2.049-5.244z"/>',
  ),
  // UI.41: ours, not Lichess's: White's move is Stockfish's top move. A white star on
  // Lichess's "good move" green, drawn in the same 100 box as its glyphs.
  star: compose(
    "#22ac38",
    '<path fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round" d="M50 19 58.2 41.7 82.3 42.5 63.3 57.3 70 80.5 50 67 30 80.5 36.7 57.3 17.7 42.5 41.8 41.7z"/>',
  ),
};

export type BoardGlyphName = keyof typeof glyphs;

// A square's place on the board, from its top-left, in eighths.
function squareOffset(square: string, orientation: "white" | "black") {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const column = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;
  return { left: `${column * 12.5}%`, top: `${row * 12.5}%` };
}

// Inside the board's box, which must be position: relative.
export default function BoardGlyph({ glyph, square, orientation }: { glyph: BoardGlyphName; square: string; orientation: "white" | "black" }) {
  return (
    <svg
      viewBox="0 0 100 100"
      style={{
        position: "absolute",
        ...squareOffset(square, orientation),
        width: "12.5%",
        height: "12.5%",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 10,
      }}
      dangerouslySetInnerHTML={{ __html: glyphs[glyph] }}
    />
  );
}
