import test from 'node:test';
import assert from 'node:assert';
import {
    defaultConfig,
    validateConfig,
    computeConfigHash,
    computeRemoteEngineEvaluationProfile,
    computeLocalEngineEvaluationProfile,
    createRuntimeConfig,
    getMoveBand,
    getProbabilityBand,
    computeExplorerRequestProfile
} from './config';

test('1. shipped default config validates', () => {
    assert.doesNotThrow(() => validateConfig(defaultConfig));
});

test('generation-config: every setting has the value in the note', () => {
    assert.strictEqual(defaultConfig.lockfileName, 'lockfile-never-remove-by-yourself-unless-stale');
    assert.strictEqual(defaultConfig.lockfileRetryLimit, 5);
    assert.strictEqual(defaultConfig.probabilityTolerance, 0.000001);
    assert.strictEqual(defaultConfig.tinyThreshold, 0.0000001);
    assert.strictEqual(defaultConfig.nodeTouchCountCap, 500);
    assert.deepStrictEqual(defaultConfig.moveNumberBands, { early: 4, middle: 8 });
    assert.deepStrictEqual(defaultConfig.popularityThresholds, { early: 0.05, middle: 0.10, late: 0.15 });
    assert.deepStrictEqual(defaultConfig.probabilityBands, { deep: 0.02, medium: 0.005 });
    assert.deepStrictEqual(defaultConfig.depthBudget, { deep: 15, medium: 8, shallow: 5 });
    assert.strictEqual(defaultConfig.depthCap, 5);
    assert.deepStrictEqual(defaultConfig.explorerSpeeds, ['classical', 'rapid']);
    assert.deepStrictEqual(defaultConfig.explorerRatings, [1600, 1800, 2000]);
    assert.strictEqual(defaultConfig.apiRetryDelayMs, 120_000);
    assert.strictEqual(defaultConfig.apiRequestGapMs, 2_000);
    assert.strictEqual(defaultConfig.cloudEvalExtraGapMs, 10_000);
    assert.strictEqual(defaultConfig.apiRequestTimeoutMs, 30_000);
    assert.deepStrictEqual(defaultConfig.explorerEliteSpeeds, ['classical', 'rapid']);
    assert.deepStrictEqual(defaultConfig.explorerEliteRatings, [2500]);
    assert.strictEqual(defaultConfig.mastersWeight, 5);
    assert.strictEqual(defaultConfig.minimumWeightedGames, 15);
    assert.strictEqual(defaultConfig.lichessCloudEvalMultiPv, 5);
    assert.deepStrictEqual(defaultConfig.apiToleranceCp, { early: 80, middle: 50, late: 35 });
    assert.deepStrictEqual(defaultConfig.localToleranceCp, { early: 95, middle: 60, late: 40 });
    assert.strictEqual(defaultConfig.chessDbMaxAbsCp, 1000);
    assert.strictEqual(defaultConfig.anchorGames, 50);
    assert.strictEqual(defaultConfig.repertoireSidePrior, 0.48);
    assert.strictEqual(defaultConfig.localStockfishDepth, 24);
    assert.strictEqual(defaultConfig.localStockfishMultiPv, 1);
    assert.deepStrictEqual(defaultConfig.hardcodedBlackResponses, ['1. e4 c6', '1. d4 d5']);
});

test('generation-config probabilityBands: deep >= 2%, medium >= 0.5%, shallow below', () => {
    assert.strictEqual(getProbabilityBand(1, defaultConfig), 'deep');
    assert.strictEqual(getProbabilityBand(0.02, defaultConfig), 'deep');
    assert.strictEqual(getProbabilityBand(0.0199, defaultConfig), 'medium');
    assert.strictEqual(getProbabilityBand(0.005, defaultConfig), 'medium');
    assert.strictEqual(getProbabilityBand(0.0049, defaultConfig), 'shallow');
    assert.strictEqual(getProbabilityBand(0, defaultConfig), 'shallow');
});

const EXPLORER_PROFILE = '224dd402c861ade92ac5bbdfb77d3dbbe7001172b4c53c96a5c380e9d5d602ed';
const LICHESS_PROFILE = '17b7993e405f11ef8b745b8246d1521d0866bd2ee37678cbfeca486ef983537c';
const CHESSDB_PROFILE = '27e328179be6d1f466e1d5658a57ae636f0583b4491a77abd4e31420861500cf';
const LOCAL_PROFILE = '5cc9bfc30926c3b1534d7d75ffc1e965a30bf384aaea98015eeda064728f1710';

test('generation-config: renaming settings keeps existing cache profiles', () => {
    // Hashes of the shipped profiles before the rename; a change would refetch every cache.
    assert.strictEqual(computeExplorerRequestProfile(defaultConfig), EXPLORER_PROFILE);
    assert.strictEqual(computeRemoteEngineEvaluationProfile('LICHESS', defaultConfig), LICHESS_PROFILE);
    assert.strictEqual(computeRemoteEngineEvaluationProfile('CHESSDB', defaultConfig), CHESSDB_PROFILE);
    assert.strictEqual(computeLocalEngineEvaluationProfile(defaultConfig), LOCAL_PROFILE);
});

test('23. Local Deep profile tracks material search settings only', () => {
    const same = JSON.parse(JSON.stringify(defaultConfig));
    assert.strictEqual(computeLocalEngineEvaluationProfile(defaultConfig), computeLocalEngineEvaluationProfile(same));

    const changedDepth = JSON.parse(JSON.stringify(defaultConfig));
    changedDepth.localStockfishDepth += 1;
    assert.notStrictEqual(computeLocalEngineEvaluationProfile(defaultConfig), computeLocalEngineEvaluationProfile(changedDepth));

    const changedMultiPv = JSON.parse(JSON.stringify(defaultConfig));
    changedMultiPv.localStockfishMultiPv = 2;
    assert.notStrictEqual(computeLocalEngineEvaluationProfile(defaultConfig), computeLocalEngineEvaluationProfile(changedMultiPv));

    const changedOperational = JSON.parse(JSON.stringify(defaultConfig));
    changedOperational.apiRetryDelayMs += 1;
    assert.strictEqual(computeLocalEngineEvaluationProfile(defaultConfig), computeLocalEngineEvaluationProfile(changedOperational));
});

test('2. required value missing -> hard error', () => {
    const invalidConfig = { ...defaultConfig, moveNumberBands: undefined as unknown as { early: number; middle: number } };
    assert.throws(() => validateConfig(invalidConfig), /Invalid moveNumberBands/);
});

test('3. invalid probabilities rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.popularityThresholds.early = 1.5;
    assert.throws(() => validateConfig(cfg1), /Invalid popularityThresholds.early/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.popularityThresholds.middle = -0.1;
    assert.throws(() => validateConfig(cfg2), /Invalid popularityThresholds.middle/);

    const cfg3 = JSON.parse(JSON.stringify(defaultConfig));
    cfg3.repertoireSidePrior = 2;
    assert.throws(() => validateConfig(cfg3), /Invalid repertoireSidePrior/);
});

test('4. invalid counts rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.mastersWeight = 0;
    assert.throws(() => validateConfig(cfg1), /Invalid mastersWeight/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.anchorGames = -5;
    assert.throws(() => validateConfig(cfg2), /Invalid anchorGames/);

    // RE.08: depthCap is a positive whole number of full moves.
    for (const depthCap of [0, -1, 2.5]) {
        const cfg = JSON.parse(JSON.stringify(defaultConfig));
        cfg.depthCap = depthCap;
        assert.throws(() => validateConfig(cfg), /Invalid depthCap/);
    }
});

test('5. invalid duration rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.apiRequestGapMs = -100;
    assert.throws(() => validateConfig(cfg1), /Invalid apiRequestGapMs/);
});

test('6. invalid engine depth/MultiPV rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.localStockfishDepth = 0;
    assert.throws(() => validateConfig(cfg1), /Invalid localStockfishDepth/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.localStockfishMultiPv = -1;
    assert.throws(() => validateConfig(cfg2), /Invalid localStockfishMultiPv/);
});

test('6a. finite numbers validated', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.apiToleranceCp.early = Infinity;
    assert.throws(() => validateConfig(cfg1), /Invalid apiToleranceCp.early/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.apiToleranceCp.middle = NaN;
    assert.throws(() => validateConfig(cfg2), /Invalid apiToleranceCp.middle/);

    const cfg3 = JSON.parse(JSON.stringify(defaultConfig));
    cfg3.cloudEvalExtraGapMs = Infinity;
    assert.throws(() => validateConfig(cfg3), /Invalid cloudEvalExtraGapMs/);
});

test('6b. AR.03: zero request timeout rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.apiRequestTimeoutMs = 0;
    assert.throws(() => validateConfig(cfg1), /Invalid apiRequestTimeoutMs/);
});

test('6c. AR: retry settings not in generation-config are gone', () => {
    assert.deepStrictEqual(Object.keys(defaultConfig.api).sort(), ['chessDb', 'wikibooks']);
    assert.deepStrictEqual(Object.keys(defaultConfig.api.chessDb), ['queryMode']);
    assert.deepStrictEqual(Object.keys(defaultConfig.api.wikibooks).sort(), ['maxLagSeconds', 'userAgent']);
});

test('7. shared move bands: 1/4 early, 5/8 middle, 9+ late', () => {
    assert.strictEqual(getMoveBand(1, defaultConfig), 'early');
    assert.strictEqual(getMoveBand(4, defaultConfig), 'early');
    assert.strictEqual(getMoveBand(5, defaultConfig), 'middle');
    assert.strictEqual(getMoveBand(8, defaultConfig), 'middle');
    assert.strictEqual(getMoveBand(9, defaultConfig), 'late');
    assert.strictEqual(getMoveBand(20, defaultConfig), 'late');
});

test('8. White popularity lookup -> .05/.10/.15', () => {
    assert.strictEqual(defaultConfig.popularityThresholds[getMoveBand(4, defaultConfig)], 0.05);
    assert.strictEqual(defaultConfig.popularityThresholds[getMoveBand(5, defaultConfig)], 0.10);
    assert.strictEqual(defaultConfig.popularityThresholds[getMoveBand(9, defaultConfig)], 0.15);
});

test('9. API tolerance lookup -> 80/50/35', () => {
    assert.strictEqual(defaultConfig.apiToleranceCp[getMoveBand(4, defaultConfig)], 80);
    assert.strictEqual(defaultConfig.apiToleranceCp[getMoveBand(5, defaultConfig)], 50);
    assert.strictEqual(defaultConfig.apiToleranceCp[getMoveBand(9, defaultConfig)], 35);
});

test('10. Local tolerance lookup -> 95/60/40', () => {
    assert.strictEqual(defaultConfig.localToleranceCp[getMoveBand(4, defaultConfig)], 95);
    assert.strictEqual(defaultConfig.localToleranceCp[getMoveBand(5, defaultConfig)], 60);
    assert.strictEqual(defaultConfig.localToleranceCp[getMoveBand(9, defaultConfig)], 40);
});

test('11. semantically identical objects with different property order -> same configHash', () => {
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    // Scramble order of keys
    cfgB.depthBudget = {
        shallow: cfgB.depthBudget.shallow,
        medium: cfgB.depthBudget.medium,
        deep: cfgB.depthBudget.deep
    };

    const hashA = computeConfigHash(cfgA);
    const hashB = computeConfigHash(cfgB);
    assert.strictEqual(hashA, hashB);
});

test('12. changing one effective value -> different configHash', () => {
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    cfgB.mastersWeight = 6; // effective change

    const hashA = computeConfigHash(cfgA);
    const hashB = computeConfigHash(cfgB);
    assert.notStrictEqual(hashA, hashB);
});

test('13. runtime config is deeply immutable', () => {
    const { config } = createRuntimeConfig(defaultConfig);

    assert.throws(() => {
        (config as unknown as { mastersWeight: number }).mastersWeight = 10;
    }, TypeError);

    assert.throws(() => {
        (config as unknown as { moveNumberBands: { early: number } }).moveNumberBands.early = 5;
    }, TypeError);
});

test('14. mutating a source object after snapshot creation cannot alter snapshot', () => {
    const source = JSON.parse(JSON.stringify(defaultConfig));
    const { config, configHash } = createRuntimeConfig(source);

    // Mutate source
    source.mastersWeight = 100;

    // Snapshot should remain unchanged
    assert.strictEqual(config.mastersWeight, 5);

    // Hash should remain unchanged
    assert.strictEqual(computeConfigHash(config), configHash);
});

test('15. central config carries no trap/threat policy', () => {
    const keys = JSON.stringify(defaultConfig).toLowerCase();
    assert.strictEqual(keys.includes('trap'), false);
    assert.strictEqual(keys.includes('threat'), false);
});

test('16. general config changes such as engine tolerance do not change the human explorer profile', () => {
    
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    cfgB.apiToleranceCp.early = 1000;

    const profileA = computeExplorerRequestProfile(cfgA);
    const profileB = computeExplorerRequestProfile(cfgB);
    assert.strictEqual(profileA, profileB);
});

test('17. operational request settings such as delays do not change the human explorer profile', () => {
    
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    cfgB.apiRetryDelayMs = 999_999;
    cfgB.apiRequestGapMs = 5000;

    const profileA = computeExplorerRequestProfile(cfgA);
    const profileB = computeExplorerRequestProfile(cfgB);
    assert.strictEqual(profileA, profileB);
});

test('18. request-shaping changes such as ratings/speeds do change the profile', () => {
    
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    cfgB.explorerRatings.push(2200);

    const profileA = computeExplorerRequestProfile(cfgA);
    const profileB = computeExplorerRequestProfile(cfgB);
    assert.notStrictEqual(profileA, profileB);

    const cfgC = JSON.parse(JSON.stringify(defaultConfig));
    cfgC.explorerEliteSpeeds = ["blitz"];
    const profileC = computeExplorerRequestProfile(cfgC);
    assert.notStrictEqual(profileA, profileC);
});

test('19. Explorer speeds and ratings: invalid values rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.explorerEliteSpeeds = ["   "];
    assert.throws(() => validateConfig(cfg1), /Invalid explorerEliteSpeeds/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.explorerRatings = [0];
    assert.throws(() => validateConfig(cfg2), /Invalid explorerRatings/);

    const cfg3 = JSON.parse(JSON.stringify(defaultConfig));
    cfg3.explorerEliteRatings = [2500.5];
    assert.throws(() => validateConfig(cfg3), /Invalid explorerEliteRatings/);
});

test('20. remote evaluation profile is stable for equal effective request settings', () => {
    const copy = JSON.parse(JSON.stringify(defaultConfig));
    assert.strictEqual(computeRemoteEngineEvaluationProfile('LICHESS', defaultConfig), computeRemoteEngineEvaluationProfile('LICHESS', copy));
    assert.strictEqual(computeRemoteEngineEvaluationProfile('CHESSDB', defaultConfig), computeRemoteEngineEvaluationProfile('CHESSDB', copy));
});

test('21. remote evaluation profile changes with material request shape', () => {
    const changed = JSON.parse(JSON.stringify(defaultConfig));
    changed.lichessCloudEvalMultiPv += 1;
    assert.notStrictEqual(computeRemoteEngineEvaluationProfile('LICHESS', defaultConfig), computeRemoteEngineEvaluationProfile('LICHESS', changed));
});

test('22. remote evaluation profile ignores retry and delay settings', () => {
    const changed = JSON.parse(JSON.stringify(defaultConfig));
    changed.cloudEvalExtraGapMs += 1;
    changed.apiRequestTimeoutMs += 123;
    changed.apiRetryDelayMs += 456;
    changed.apiRequestGapMs += 789;
    assert.strictEqual(computeRemoteEngineEvaluationProfile('LICHESS', defaultConfig), computeRemoteEngineEvaluationProfile('LICHESS', changed));
    assert.strictEqual(computeRemoteEngineEvaluationProfile('CHESSDB', defaultConfig), computeRemoteEngineEvaluationProfile('CHESSDB', changed));
});
