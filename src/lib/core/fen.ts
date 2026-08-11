/**
 * Normalizes a FEN string by stripping the half-move clock and full-move number.
 * This ensures that cache hits work correctly regardless of how long the game has been going on,
 * while preserving essential evaluation components like en passant targets and castling rights.
 * 
 * E.g. "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" 
 *   -> "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -"
 */
export const normalizeFen = (fen: string): string => {
  const parts = fen.split(' ');
  // Keep the first 4 segments: pieces, active color, castling, en passant
  return parts.slice(0, 4).join(' ');
};
