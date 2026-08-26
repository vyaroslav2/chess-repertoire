import { Chess, Square } from 'chess.js';

/**
 * A distinct string type representing a canonical six-field FEN.
 * It contains: piece placement, side to move, castling rights, en passant square, half-move clock, full-move number.
 */
export type FullFen = string & { readonly __brand: unique symbol };

/**
 * A distinct string type representing a canonical four-field position identity.
 * It contains: piece placement, side to move, castling rights, effective en passant square.
 */
export type PositionKey = string & { readonly __brand: unique symbol };

/**
 * Parses and validates a raw FEN string.
 * Must have exactly 6 fields.
 * Must represent a valid chess position.
 * Returns canonicalized six-field FEN.
 */
export function parseFullFen(raw: string): FullFen {
  const parts = raw.trim().split(/\s+/);
  if (parts.length !== 6) {
    throw new Error(`Invalid FEN: Expected exactly 6 fields, got ${parts.length}`);
  }

  const [pieces, side, castling, ep, halfMoveRaw, fullMoveRaw] = parts;

  // Validate half-move and full-move
  if (!/^\d+$/.test(halfMoveRaw)) {
    throw new Error(`Invalid FEN: Invalid half-move clock`);
  }
  const halfMove = parseInt(halfMoveRaw, 10);

  if (!/^[1-9]\d*$/.test(fullMoveRaw)) {
    throw new Error(`Invalid FEN: Invalid full-move number`);
  }
  const fullMove = parseInt(fullMoveRaw, 10);

  // Validate Side
  if (side !== 'w' && side !== 'b') {
    throw new Error(`Invalid FEN: Invalid side to move`);
  }

  // Validate EP structurally
  if (ep !== '-') {
    if (!/^[a-h][36]$/.test(ep)) {
      throw new Error(`Invalid FEN: Invalid en passant square`);
    }
    if (side === 'w' && ep[1] !== '6') {
      throw new Error(`Invalid FEN: En passant square ${ep} does not match side to move ${side}`);
    }
    if (side === 'b' && ep[1] !== '3') {
      throw new Error(`Invalid FEN: En passant square ${ep} does not match side to move ${side}`);
    }
  }

  // Validate Castling format
  if (castling !== '-') {
    if (!/^[KQkq]+$/.test(castling)) {
      throw new Error(`Invalid FEN: Invalid castling rights format`);
    }
    if (new Set(castling).size !== castling.length) {
      throw new Error(`Invalid FEN: Duplicate castling rights`);
    }
  }

  const normalizedRaw = `${pieces} ${side} ${castling} ${ep} ${halfMove} ${fullMove}`;

  let chess: Chess;
  try {
    chess = new Chess(normalizedRaw);
  } catch (e: any) {
    throw new Error(`Invalid FEN: chess.js rejected it - ${e.message}`);
  }

  // Manual castling rights validation against piece placement
  const getPiece = (sq: Square) => chess.get(sq);

  if (castling.includes('K')) {
    const k = getPiece('e1');
    const r = getPiece('h1');
    if (!k || k.type !== 'k' || k.color !== 'w' || !r || r.type !== 'r' || r.color !== 'w') {
      throw new Error(`Invalid FEN: Impossible castling rights (K)`);
    }
  }
  if (castling.includes('Q')) {
    const k = getPiece('e1');
    const r = getPiece('a1');
    if (!k || k.type !== 'k' || k.color !== 'w' || !r || r.type !== 'r' || r.color !== 'w') {
      throw new Error(`Invalid FEN: Impossible castling rights (Q)`);
    }
  }
  if (castling.includes('k')) {
    const k = getPiece('e8');
    const r = getPiece('h8');
    if (!k || k.type !== 'k' || k.color !== 'b' || !r || r.type !== 'r' || r.color !== 'b') {
      throw new Error(`Invalid FEN: Impossible castling rights (k)`);
    }
  }
  if (castling.includes('q')) {
    const k = getPiece('e8');
    const r = getPiece('a8');
    if (!k || k.type !== 'k' || k.color !== 'b' || !r || r.type !== 'r' || r.color !== 'b') {
      throw new Error(`Invalid FEN: Impossible castling rights (q)`);
    }
  }

  // Canonicalize castling string
  let canonCastling = '';
  if (castling.includes('K')) canonCastling += 'K';
  if (castling.includes('Q')) canonCastling += 'Q';
  if (castling.includes('k')) canonCastling += 'k';
  if (castling.includes('q')) canonCastling += 'q';
  if (canonCastling === '') canonCastling = '-';

  // Extract canonical piece placement from chess.fen()
  const cParts = chess.fen().split(' ');
  const canonPieces = cParts[0];

  const canonicalFen = `${canonPieces} ${side} ${canonCastling} ${ep} ${halfMove} ${fullMove}`;

  return canonicalFen as FullFen;
}

/**
 * Creates a PositionKey from a canonical FullFen.
 * Accepts only an already validated canonical FullFen.
 */
export function positionKeyFromFen(fen: FullFen): PositionKey {
  const parts = fen.split(' ');
  const [pieces, side, castling, ep] = parts;

  let effectiveEp = '-';
  if (ep !== '-') {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    const hasEpCapture = moves.some(m => m.flags.includes('e'));
    if (hasEpCapture) {
      effectiveEp = ep;
    }
  }

  return `${pieces} ${side} ${castling} ${effectiveEp}` as PositionKey;
}
