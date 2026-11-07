import test from 'node:test';
import assert from 'node:assert';

import {
  cardKey,
  cardMoves,
  compareLines,
  createRunExporter,
  lineFinality,
  planNotes,
  wholeLines,
  type AnkiCall,
  type ReplyLine
} from './anki-export';

const finalEnd = { replyStopReason: "Depth cap reached on Black's move", dealtWith: false, whiteStopReasons: [] };

function line(sans: string, ucis: string, end: ReplyLine['end'] = finalEnd): ReplyLine {
  const fullLine = sans.split(' ');
  const historyUcis = ucis.split(' ');
  const answerUci = historyUcis.pop()!;
  return { fullLine, historyUcis, answerSan: fullLine.at(-1)!, answerUci, openingName: null, end };
}

test('AK.17 a line is final, held back or open', () => {
  assert.equal(lineFinality({ replyStopReason: "Depth cap reached on Black's move", dealtWith: false, whiteStopReasons: [] }), 'final');
  assert.equal(lineFinality({ replyStopReason: "Game over on Black's move", dealtWith: false, whiteStopReasons: [] }), 'final');
  assert.equal(lineFinality({ replyStopReason: 'No opponent moves found', dealtWith: false, whiteStopReasons: [] }), 'final');
  assert.equal(lineFinality({ replyStopReason: null, dealtWith: true, whiteStopReasons: ['Transposition', 'Repetition', 'Game over'] }), 'final',
    'every White move there ended for good');
  assert.equal(lineFinality({ replyStopReason: null, dealtWith: true, whiteStopReasons: ['Transposition', 'Too rare'] }), 'held',
    'a sweep can reopen a too-rare move');
  assert.equal(lineFinality({ replyStopReason: null, dealtWith: false, whiteStopReasons: [] }), 'open', 'the position is still on the queue');
  assert.equal(lineFinality({ replyStopReason: null, dealtWith: true, whiteStopReasons: ['Too rare', null] }), 'open', 'a White move there goes on');
});

test('AK.02 a line ends at a reply no other reply goes on from', () => {
  const short = line('e4 c6', 'e2e4 c7c6');
  const long = line('e4 c6 d4 d5', 'e2e4 c7c6 d2d4 d7d5');
  const other = line('d4 d5', 'd2d4 d7d5');
  assert.deepEqual(wholeLines([short, long, other]), [long, other]);
});

test('AK.02 lines sort move by move', () => {
  const lines = [line('e4 c6 Nf3 d5', 'e2e4 c7c6 g1f3 d7d5'), line('d4 d5', 'd2d4 d7d5'), line('e4 c6 d4 d5', 'e2e4 c7c6 d2d4 d7d5')];
  assert.deepEqual(lines.sort(compareLines).map(l => l.fullLine.join(' ')), ['d4 d5', 'e4 c6 d4 d5', 'e4 c6 Nf3 d5']);
});

test('AK.18 a card\'s whole line comes from its Line and Answer', () => {
  assert.deepEqual(cardMoves('1. e4 c6 2. d4', '2... d5'), ['e4', 'c6', 'd4', 'd5']);
  assert.deepEqual(cardMoves('', '1. e4'), ['e4']);
});

test('AK.04 AK.18 a known key is skipped; a longer line replaces the shorter card', () => {
  const long = line('e4 c6 d4 d5 Nc3 dxe4', 'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4');
  const same = line('d4 d5', 'd2d4 d7d5');
  const existing = [
    { noteId: 1, key: cardKey(['d2d4'], 'd7d5'), moves: ['d4', 'd5'] },
    { noteId: 2, key: 'old', moves: ['e4', 'c6', 'd4', 'd5'] },
    { noteId: 3, key: 'other', moves: ['e4', 'c6', 'Nf3', 'd5'] }
  ];
  const plan = planNotes([long, same], existing);
  assert.deepEqual(plan.add.map(note => note.fields), [{
    Line: '1. e4 c6 2. d4 d5 3. Nc3', Opening: '', Answer: '3... dxe4', Key: cardKey(['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3'], 'd5e4')
  }]);
  assert.deepEqual(plan.replace, [2], 'only the card whose whole line the new line starts with');
});

test('AK.18 a card is never replaced by a line of the same length or one it does not start', () => {
  const plan = planNotes([line('e4 e5', 'e2e4 e7e5')], [{ noteId: 1, key: 'k', moves: ['e4', 'c6'] }, { noteId: 2, key: 'j', moves: ['e4', 'e5', 'Nf3', 'Nc6'] }]);
  assert.equal(plan.add.length, 1);
  assert.deepEqual(plan.replace, []);
});

test('AK.17 the run exporter never switches profile, never throws, and warns once', async () => {
  const logs: string[] = [];
  const calls: string[] = [];
  let profile = 'Yaroslav';
  let running = false;
  const anki: AnkiCall = async <T>(action: string): Promise<T> => {
    calls.push(action);
    if (!running) throw new TypeError('fetch failed');
    if (action === 'getActiveProfile') return profile as T;
    if (action === 'modelNames') return ['Chess Repertoire'] as T;
    if (action === 'findNotes' || action === 'notesInfo') return [] as T;
    return null as T;
  };
  const exportCards = createRunExporter(anki, entry => logs.push(entry));

  await exportCards('final');
  await exportCards('final');
  assert.deepEqual(logs, ['"[WARNING] Anki export skipped: Anki is not running. Retrying after the next position."'], 'said once');

  running = true;
  await exportCards('final');
  assert.equal(logs.length, 2);
  assert.match(logs[1], /profile Yaroslav is open, not User test New/);
  assert.ok(!calls.includes('loadProfile'), 'never switches profile');

  profile = 'User test New';
  calls.length = 0;
  await exportCards('final');
  assert.deepEqual(calls, ['getActiveProfile', 'createDeck', 'modelNames', 'findNotes', 'notesInfo'], 'nothing to add in an empty tree');
  assert.equal(logs.length, 2, 'no line when nothing was added');
});
