import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { selectWhiteCandidates, shouldIncludeWhiteMove } from './evaluator';

function amateurMove(san: string, games: number, white = 0, draws = 0, black = games - white - draws) {
  return { san, games, white, draws, black };
}

test('Slice 6 White opponent coverage uses only Amateur popularity', async (t) => {
  await t.test('moves 1-4 use the configured 5% threshold inclusively', () => {
    assert.strictEqual(shouldIncludeWhiteMove('e4', 1, [amateurMove('e4', 5)], 100).include, true);
    assert.strictEqual(shouldIncludeWhiteMove('e4', 4, [amateurMove('e4', 499)], 10_000).include, false);
  });

  await t.test('moves 5-8 use the configured 10% threshold inclusively', () => {
    assert.strictEqual(shouldIncludeWhiteMove('Nf3', 5, [amateurMove('Nf3', 10)], 100).include, true);
    assert.strictEqual(shouldIncludeWhiteMove('Nf3', 8, [amateurMove('Nf3', 999)], 10_000).include, false);
  });

  await t.test('moves 9+ use the configured 15% threshold inclusively', () => {
    assert.strictEqual(shouldIncludeWhiteMove('O-O', 9, [amateurMove('O-O', 15)], 100).include, true);
    assert.strictEqual(shouldIncludeWhiteMove('O-O', 20, [amateurMove('O-O', 1_499)], 10_000).include, false);
  });

  await t.test('zero total Amateur games includes no move', () => {
    assert.deepStrictEqual(selectWhiteCandidates(1, [], [], [amateurMove('e4', 20)], 0), []);
  });

  await t.test('Masters evidence cannot rescue a move below the Amateur threshold', () => {
    const selected = selectWhiteCandidates(
      1,
      [amateurMove('e4', 10_000, 10_000)],
      [],
      [amateurMove('e4', 4, 4)],
      100
    );
    assert.deepStrictEqual(selected, []);
  });

  await t.test('Elite evidence cannot rescue a move below the Amateur threshold', () => {
    const selected = selectWhiteCandidates(
      1,
      [],
      [amateurMove('e4', 10_000, 10_000)],
      [amateurMove('e4', 4, 4)],
      100
    );
    assert.deepStrictEqual(selected, []);
  });

  await t.test('strong Amateur White win rate cannot rescue low popularity', () => {
    assert.strictEqual(shouldIncludeWhiteMove('e4', 1, [amateurMove('e4', 4, 4)], 100).include, false);
  });

  await t.test('sufficient Amateur popularity needs no Masters or Elite evidence', () => {
    const selected = selectWhiteCandidates(1, [], [], [amateurMove('e4', 5, 2, 1)], 100);
    assert.strictEqual(selected.length, 1);
    assert.strictEqual(selected[0].san, 'e4');
    assert.strictEqual(selected[0].probability, 0.05);
  });

  await t.test('filter result and generator carry no trap/threat state', () => {
    const result = shouldIncludeWhiteMove('e4', 1, [amateurMove('e4', 5)], 100);
    assert.deepStrictEqual(Object.keys(result).sort(), [
      'amateurBlackWins',
      'amateurDraws',
      'amateurGames',
      'amateurWhiteWins',
      'include',
      'probability',
      'reason'
    ]);

    const generatorSource = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/core/generator.ts'), 'utf8');
    assert.doesNotMatch(generatorSource, /trapDepth|isAmateurTrap|isMasterThreat|Master Threat|Amateur Trap|trap refutation/i);

    const schemaSource = fs.readFileSync(path.resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    assert.doesNotMatch(schemaSource, /isAmateurTrap|isMasterThreat/);
  });
});
