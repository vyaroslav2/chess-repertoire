import test from 'node:test';
import assert from 'node:assert';
import { parseFullFen, positionKeyFromFen } from './fen';
import type { FullFen } from './fen';

test('1. normal valid starting/middlegame FullFen', () => {
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const parsedStart = parseFullFen(startFen);
  assert.strictEqual(parsedStart, startFen);

  const midFen = 'r1bq1rk1/ppp1bppp/2n2n2/3p4/3P4/2PB1N2/PP3PPP/RNBQ1RK1 b - - 4 8';
  const parsedMid = parseFullFen(midFen);
  assert.strictEqual(parsedMid, midFen);
});

test('2. four/five/seven-field and malformed input rejected', () => {
  assert.throws(() => parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'), /Expected exactly 6 fields/);
  assert.throws(() => parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0'), /Expected exactly 6 fields/);
  assert.throws(() => parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 extra'), /Expected exactly 6 fields/);

  // Malformed 6-field chess position (two white kings)
  assert.throws(() => parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKKNR w KQkq - 0 1'), /chess.js rejected it/);
});

test('3. half-move/full-move validation', () => {
  assert.throws(() => parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - -1 1'), /Invalid half-move clock/);
  assert.throws(() => parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 0'), /Invalid full-move number/);
  assert.throws(() => parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - a 1'), /Invalid half-move clock/);
});

test('4. side-to-move validation', () => {
  assert.throws(() => parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1'), /Invalid side to move/);
});

test('5. valid and impossible castling rights', () => {
  // Valid
  assert.doesNotThrow(() => parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));

  // Impossible K (missing h1 rook)
  assert.throws(() => parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w KQkq - 0 1'), /Impossible castling rights \(K\)/);
  // Impossible Q (missing a1 rook)
  assert.throws(() => parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w KQkq - 0 1'), /Impossible castling rights \(Q\)/);
  // Impossible k (missing h8 rook)
  assert.throws(() => parseFullFen('rnbqkbn1/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), /Impossible castling rights \(k\)/);
  // Impossible q (missing a8 rook)
  assert.throws(() => parseFullFen('1nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), /Impossible castling rights \(q\)/);

  // Impossible K (missing white king)
  assert.throws(() => parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR w KQkq - 0 1'), /missing white king/);
});

test('6. same effective position with different counters -> same PositionKey', () => {
  const fen1 = parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const fen2 = parseFullFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 10 20');
  assert.strictEqual(positionKeyFromFen(fen1), positionKeyFromFen(fen2));
});

test('7. nominal unusable EP -> same key as "-"', () => {
  // EP e3 but no pawn can capture on e3 legally
  const fenWithEp = parseFullFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  const fenNoEp = parseFullFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  assert.strictEqual(positionKeyFromFen(fenWithEp), positionKeyFromFen(fenNoEp));
});

test('8. genuinely legal EP -> preserved and different key', () => {
  const fenWithEp = parseFullFen('rnbqkbnr/pppp1ppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  const fenNoEp = parseFullFen('rnbqkbnr/pppp1ppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');

  const keyWithEp = positionKeyFromFen(fenWithEp);
  const keyNoEp = positionKeyFromFen(fenNoEp);

  assert.notStrictEqual(keyWithEp, keyNoEp);
  assert.match(keyWithEp, /e3/);
});

test('9. pseudo-legal but king-illegal/pinned EP -> normalised to "-"', () => {
  // Black king on e8, black pawn on e4, white pawn moved f2-f4, EP on f3.
  // Moving the black e4 pawn to f3 would expose the black king on e8 to a white rook on e1!
  // FEN: 4k3/8/8/8/4pP2/8/8/4R1K1 b - f3 0 1
  const pinnedEpFen = parseFullFen('4k3/8/8/8/4pP2/8/8/4R1K1 b - f3 0 1');
  const noEpFen = parseFullFen('4k3/8/8/8/4pP2/8/8/4R1K1 b - - 0 1');

  assert.strictEqual(positionKeyFromFen(pinnedEpFen), positionKeyFromFen(noEpFen));
});

test('10. strict TypeScript API boundary', () => {
  const rawString = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // @ts-expect-error: a plain string cannot be assigned to FullFen without parsing
  const invalidAssignment: FullFen = rawString;

  const fen = parseFullFen(rawString);
  const key = positionKeyFromFen(fen);

  // @ts-expect-error: PositionKey cannot be passed to positionKeyFromFen()
  positionKeyFromFen(key);

  // Runtime checks
  assert.strictEqual(typeof fen, 'string');
  assert.strictEqual(typeof key, 'string');
});

test('11. harmless textual whitespace is canonicalised to normal six-field FEN', () => {
  const whitespaceFen = '  rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR    w    KQkq    -    0    1  ';
  const canonicalFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  assert.strictEqual(parseFullFen(whitespaceFen), canonicalFen);
});
