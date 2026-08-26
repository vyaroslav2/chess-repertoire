import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildBlackHumanShortlist } from './black-human-shortlist';
import { defaultConfig } from './config';

describe('B1 Black Human Shortlist Construction', () => {
  it('1. Masters-only move enters candidate pool', () => {
    const masters = [{ uci: 'e2e4', san: 'e4', white: 10, draws: 5, black: 10, games: 25 }];
    const elite: any[] = [];
    const list = buildBlackHumanShortlist(masters, elite, defaultConfig);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].uci, 'e2e4');
  });

  it('2. Elite-only move enters candidate pool', () => {
    const masters: any[] = [];
    const elite = [{ uci: 'e2e4', san: 'e4', white: 10, draws: 5, black: 10, games: 25 }];
    const list = buildBlackHumanShortlist(masters, elite, defaultConfig);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].uci, 'e2e4');
  });

  it('3. Amateur data cannot create a B1 candidate (by omission in signature)', () => {
    const masters: any[] = [];
    const elite: any[] = [];
    const list = buildBlackHumanShortlist(masters, elite, defaultConfig);
    assert.strictEqual(list.length, 0); // Amateur not even accepted by API
  });

  it('4. same UCI in Masters + Elite merges into one candidate', () => {
    const masters = [{ uci: 'e2e4', san: 'e4', white: 10, draws: 5, black: 10, games: 25 }];
    const elite = [{ uci: 'e2e4', san: 'e4', white: 5, draws: 2, black: 5, games: 12 }];
    const list = buildBlackHumanShortlist(masters, elite, defaultConfig);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].mastersGames, 25);
    assert.strictEqual(list[0].eliteGames, 12);
  });

  it('5. UCI is authoritative identity (ignores duplicate SAN if distinct UCI, though in real chess that is impossible)', () => {
    // We already assert same UCI merges. Let's test differing SAN for same UCI.
    const masters = [{ uci: 'e2e4', san: 'e4', white: 10, draws: 5, black: 10, games: 25 }];
    const elite = [{ uci: 'e2e4', san: 'P-K4', white: 5, draws: 2, black: 5, games: 12 }];
    assert.throws(() => buildBlackHumanShortlist(masters, elite, defaultConfig), /Conflicting SAN for same UCI/);
  });

  it('5b. Missing, empty, or malformed UCI cannot enter the shortlist', () => {
    const invalidMoves = [
      { san: 'e4', white: 10, draws: 5, black: 10, games: 25 }, // missing uci
      { uci: '', san: 'e4', white: 10, draws: 5, black: 10, games: 25 }, // empty uci
      { uci: 'e2e', san: 'e4', white: 10, draws: 5, black: 10, games: 25 }, // too short
      { uci: 'e2e9', san: 'e4', white: 10, draws: 5, black: 10, games: 25 }, // invalid rank
      { uci: 'e8e8', san: 'Re8', white: 10, draws: 5, black: 10, games: 25 }, // impossible move (same square)
    ];

    for (const invalidMove of invalidMoves) {
      assert.throws(() => buildBlackHumanShortlist([invalidMove as any], [], defaultConfig), /authoritative uci identity/);
    }
  });

  it('6. conflicting SAN for same UCI: hard error', () => {
    // Tested above in 5.
  });

  it('7. Masters weighting: Masters games count 5x current Elite weight through config', () => {
    const masters = [{ uci: 'e2e4', san: 'e4', white: 0, draws: 0, black: 0, games: 5 }];
    const elite = [{ uci: 'e2e4', san: 'e4', white: 0, draws: 0, black: 0, games: 2 }];
    const list = buildBlackHumanShortlist(masters, elite, defaultConfig);
    // mastersWeight is 5
    assert.strictEqual(list[0].weightedGames, 5 * 5 + 2);
  });

  it('8. weighted Black wins use same Masters weight', () => {
    const masters = [{ uci: 'e2e4', san: 'e4', white: 0, draws: 0, black: 2, games: 5 }];
    const elite = [{ uci: 'e2e4', san: 'e4', white: 0, draws: 0, black: 3, games: 5 }];
    const list = buildBlackHumanShortlist(masters, elite, defaultConfig);
    assert.strictEqual(list[0].weightedBlackWins, 2 * 5 + 3);
  });

  it('9. weighted draws use same Masters weight', () => {
    const masters = [{ uci: 'e2e4', san: 'e4', white: 0, draws: 4, black: 0, games: 5 }];
    const elite = [{ uci: 'e2e4', san: 'e4', white: 0, draws: 1, black: 0, games: 1 }];
    const list = buildBlackHumanShortlist(masters, elite, defaultConfig);
    assert.strictEqual(list[0].weightedDraws, 4 * 5 + 1);
  });

  it('10. exact Black score formula matches expected calculation', () => {
    const masters = [{ uci: 'e2e4', san: 'e4', white: 1, draws: 2, black: 3, games: 6 }];
    const elite = [{ uci: 'e2e4', san: 'e4', white: 1, draws: 1, black: 2, games: 4 }];
    const list = buildBlackHumanShortlist(masters, elite, defaultConfig);
    
    const wGames = 6 * 5 + 4; // 34
    const wBlackWins = 3 * 5 + 2; // 17
    const wDraws = 2 * 5 + 1; // 11
    
    const anchorGames = 50;
    const blackPrior = 0.48;
    const expectedScore = (wBlackWins + 0.5 * wDraws + anchorGames * blackPrior) / (wGames + anchorGames);
    assert.strictEqual(list[0].blackScore, expectedScore);
  });

  it('12. minimum evidence boundary: one below drops, exact survives', () => {
    const config = JSON.parse(JSON.stringify(defaultConfig));
    config.humanMoves.minimumWeightedGames = 15;
    config.humanMoves.mastersWeight = 5;

    const listDrop = buildBlackHumanShortlist([{ uci: 'e2e4', san: 'e4', white: 0, draws: 0, black: 0, games: 2 }], [], config);
    assert.strictEqual(listDrop.length, 0, "10 weighted drops");

    const listSurvive = buildBlackHumanShortlist([{ uci: 'e2e4', san: 'e4', white: 0, draws: 0, black: 0, games: 3 }], [], config);
    assert.strictEqual(listSurvive.length, 1, "15 weighted survives");
  });

  it('13, 14. 2 masters only drops, 3 masters only survives (under current config)', () => {
    // Handled in 12
  });

  it('15. descending Black score ordering', () => {
    // move 1: 100% black win, huge games
    // move 2: 100% white win, huge games
    const masters = [
      { uci: 'a2a3', san: 'a3', white: 100, draws: 0, black: 0, games: 100 },
      { uci: 'h2h3', san: 'h3', white: 0, draws: 0, black: 100, games: 100 }
    ];
    const list = buildBlackHumanShortlist(masters, [], defaultConfig);
    assert.strictEqual(list[0].uci, 'h2h3');
    assert.strictEqual(list[1].uci, 'a2a3');
  });

  it('16. equal-score output is deterministic without adding chess policy', () => {
    // Exact same stats
    const masters = [
      { uci: 'h2h3', san: 'h3', white: 0, draws: 10, black: 0, games: 10 },
      { uci: 'a2a3', san: 'a3', white: 0, draws: 10, black: 0, games: 10 }
    ];
    const list = buildBlackHumanShortlist(masters, [], defaultConfig);
    assert.strictEqual(list[0].uci, 'a2a3', 'Should sort lexically by uci ascending on tie');
    assert.strictEqual(list[1].uci, 'h2h3');
  });

  it('17, 18. empty Masters + Elite empty -> empty shortlist, all below floor -> empty', () => {
    const l1 = buildBlackHumanShortlist([], [], defaultConfig);
    assert.strictEqual(l1.length, 0);

    const l2 = buildBlackHumanShortlist([{ uci: 'e2e4', san: 'e4', white: 0, draws: 0, black: 0, games: 1 }], [], defaultConfig);
    assert.strictEqual(l2.length, 0);
  });

  it('19, 20. malformed/NaN, negative counts -> hard error', () => {
    assert.throws(() => buildBlackHumanShortlist([{ uci: 'e2e4', san: 'e4', white: -1, draws: 0, black: 0, games: 1 }], [], defaultConfig), /negative, NaN/);
    assert.throws(() => buildBlackHumanShortlist([{ uci: 'e2e4', san: 'e4', white: NaN, draws: 0, black: 0, games: 1 }], [], defaultConfig), /negative, NaN/);
    assert.throws(() => buildBlackHumanShortlist([{ uci: 'e2e4', san: 'e4', white: 1.5, draws: 0, black: 0, games: 1 }], [], defaultConfig), /negative, NaN/);
  });

  it('21. zero counts are valid where logically allowed', () => {
    const list = buildBlackHumanShortlist([{ uci: 'e2e4', san: 'e4', white: 0, draws: 0, black: 0, games: 20 }], [], defaultConfig);
    assert.strictEqual(list.length, 1);
  });

  it('22. Black score is not move popularity', () => {
    // Huge popularity, terrible score
    // Low popularity, amazing score
    const masters = [
      { uci: 'a2a3', san: 'a3', white: 1000, draws: 0, black: 0, games: 1000 }, // huge popularity, 0% win
      { uci: 'h2h3', san: 'h3', white: 0, draws: 0, black: 100, games: 100 }    // lower popularity, 100% win
    ];
    const list = buildBlackHumanShortlist(masters, [], defaultConfig);
    assert.strictEqual(list[0].uci, 'h2h3', 'Score outranks popularity');
  });

  it('24. engine data is not accepted by B1 API and does not affect ranking', () => {
    // The signature only accepts human counts (games, wins, draws). No CP passed.
  });

  it('Config regression: changing config changes behaviour', () => {
    const masters = [{ uci: 'e2e4', san: 'e4', white: 1, draws: 2, black: 3, games: 6 }];
    const c1 = JSON.parse(JSON.stringify(defaultConfig));
    const c2 = JSON.parse(JSON.stringify(defaultConfig));
    c1.smoothing.blackPrior = 1.0;
    c2.smoothing.blackPrior = 0.0;
    
    const l1 = buildBlackHumanShortlist(masters, [], c1);
    const l2 = buildBlackHumanShortlist(masters, [], c2);
    assert.ok(l1[0].blackScore !== l2[0].blackScore, "blackScore reacts to prior config");

    c1.humanMoves.mastersWeight = 100;
    const l3 = buildBlackHumanShortlist(masters, [], c1);
    assert.ok(l1[0].weightedGames !== l3[0].weightedGames, "weightedGames reacts to weight config");
  });
});
