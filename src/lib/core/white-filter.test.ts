import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { selectWhiteCandidates, whiteMoveStats } from './evaluator';

function amateurMove(san: string, games: number, white = 0, draws = 0, black = games - white - draws) {
  return { san, games, white, draws, black };
}

test('Slice 6 White opponent coverage uses only Amateur popularity', async (t) => {
  await t.test('HM.03 a move\'s probability is its share of the position\'s games', () => {
    assert.strictEqual(whiteMoveStats('e4', [amateurMove('e4', 5)], 100).probability, 0.05);
    assert.strictEqual(whiteMoveStats('Nf3', [amateurMove('Nf3', 1)], 10_000).probability, 0.0001);
  });

  await t.test('zero total Amateur games gives every move probability 0', () => {
    assert.deepStrictEqual(selectWhiteCandidates([amateurMove('e4', 20)], 0).map(move => move.probability), [0]);
  });

  await t.test('HM.04 every Amateur move is kept, however rare', () => {
    const selected = selectWhiteCandidates([amateurMove('e4', 5, 4), amateurMove('d4', 1, 1), amateurMove('a4', 0)], 10_000);
    assert.deepStrictEqual(selected.map(move => move.san), ['e4', 'd4', 'a4']);
  });

  await t.test('sufficient Amateur popularity needs no Masters or Elite evidence', () => {
    const selected = selectWhiteCandidates([amateurMove('e4', 5, 2, 1)], 100);
    assert.strictEqual(selected.length, 1);
    assert.strictEqual(selected[0].san, 'e4');
    assert.strictEqual(selected[0].probability, 0.05);
  });

  await t.test('filter result and generator carry no trap/threat state', () => {
    const result = whiteMoveStats('e4', [amateurMove('e4', 5)], 100);
    assert.deepStrictEqual(Object.keys(result).sort(), [
      'amateurBlackWins',
      'amateurDraws',
      'amateurGames',
      'amateurWhiteWins',
      'probability'
    ]);

    const generatorSource = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/core/generator.ts'), 'utf8');
    assert.doesNotMatch(generatorSource, /trapDepth|isAmateurTrap|isMasterThreat|Master Threat|Amateur Trap|trap refutation/i);

    const schemaSource = fs.readFileSync(path.resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    assert.doesNotMatch(schemaSource, /isAmateurTrap|isMasterThreat/);
  });
});
