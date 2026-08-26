import test from 'node:test';
import assert from 'node:assert';
import {
    defaultConfig,
    validateConfig,
    computeConfigHash,
    createRuntimeConfig,
    getMoveBand
} from './config';

test('1. shipped default config validates', () => {
    assert.doesNotThrow(() => validateConfig(defaultConfig));
});

test('2. required value missing -> hard error', () => {
    const invalidConfig = { ...defaultConfig, moveBands: undefined as unknown as { earlyThrough: number; middleThrough: number } };
    assert.throws(() => validateConfig(invalidConfig), /Invalid moveBands/);
});

test('3. invalid probabilities rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.whiteMoveFiltering.mainlinePopularity.early = 1.5;
    assert.throws(() => validateConfig(cfg1), /Invalid probability for mainlinePopularity.early/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.whiteMoveFiltering.mainlinePopularity.middle = -0.1;
    assert.throws(() => validateConfig(cfg2), /Invalid probability for mainlinePopularity.middle/);

    const cfg3 = JSON.parse(JSON.stringify(defaultConfig));
    cfg3.smoothing.blackPrior = 2;
    assert.throws(() => validateConfig(cfg3), /Invalid probability for smoothing.blackPrior/);
});

test('4. invalid counts rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.humanMoves.mastersWeight = 0;
    assert.throws(() => validateConfig(cfg1), /Invalid humanMoves.mastersWeight/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.smoothing.anchorGames = -5;
    assert.throws(() => validateConfig(cfg2), /Invalid smoothing.anchorGames/);
});

test('5. invalid duration rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.api.networkRetryDelayMs = -100;
    assert.throws(() => validateConfig(cfg1), /Invalid api.networkRetryDelayMs/);
});

test('6. invalid engine depth/MultiPV rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.engine.localVerification.depth = 0;
    assert.throws(() => validateConfig(cfg1), /Invalid engine.localVerification.depth/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.engine.deepVerification.multiPv = -1;
    assert.throws(() => validateConfig(cfg2), /Invalid engine.deepVerification.multiPv/);
});

test('6a. finite numbers validated', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.engineVerification.apiToleranceCp.early = Infinity;
    assert.throws(() => validateConfig(cfg1), /Invalid apiToleranceCp.early/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.engineVerification.apiToleranceCp.middle = NaN;
    assert.throws(() => validateConfig(cfg2), /Invalid apiToleranceCp.middle/);

    const cfg3 = JSON.parse(JSON.stringify(defaultConfig));
    cfg3.api.networkRetryDelayMs = Infinity;
    assert.throws(() => validateConfig(cfg3), /Invalid api.networkRetryDelayMs/);
});

test('6b. zero retry attempts rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.api.lichessCloudEval.retryAttempts = 0;
    assert.throws(() => validateConfig(cfg1), /Invalid api.lichessCloudEval.retryAttempts/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.api.lichessExplorer.retryAttempts = 0;
    assert.throws(() => validateConfig(cfg2), /Invalid api.lichessExplorer.retryAttempts/);
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
    assert.strictEqual(defaultConfig.whiteMoveFiltering.mainlinePopularity[getMoveBand(4, defaultConfig)], 0.05);
    assert.strictEqual(defaultConfig.whiteMoveFiltering.mainlinePopularity[getMoveBand(5, defaultConfig)], 0.10);
    assert.strictEqual(defaultConfig.whiteMoveFiltering.mainlinePopularity[getMoveBand(9, defaultConfig)], 0.15);
});

test('9. API tolerance lookup -> 80/50/35', () => {
    assert.strictEqual(defaultConfig.engineVerification.apiToleranceCp[getMoveBand(4, defaultConfig)], 80);
    assert.strictEqual(defaultConfig.engineVerification.apiToleranceCp[getMoveBand(5, defaultConfig)], 50);
    assert.strictEqual(defaultConfig.engineVerification.apiToleranceCp[getMoveBand(9, defaultConfig)], 35);
});

test('10. Local tolerance lookup -> 95/60/40', () => {
    assert.strictEqual(defaultConfig.engineVerification.localToleranceCp[getMoveBand(4, defaultConfig)], 95);
    assert.strictEqual(defaultConfig.engineVerification.localToleranceCp[getMoveBand(5, defaultConfig)], 60);
    assert.strictEqual(defaultConfig.engineVerification.localToleranceCp[getMoveBand(9, defaultConfig)], 40);
});

test('11. semantically identical objects with different property order -> same configHash', () => {
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    // Scramble order of keys
    const newEngine = {
        deepVerification: cfgB.engine.deepVerification,
        localFallback: cfgB.engine.localFallback,
        localVerification: cfgB.engine.localVerification
    };
    cfgB.engine = newEngine;

    const hashA = computeConfigHash(cfgA);
    const hashB = computeConfigHash(cfgB);
    assert.strictEqual(hashA, hashB);
});

test('12. changing one effective value -> different configHash', () => {
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    cfgB.humanMoves.mastersWeight = 6; // effective change

    const hashA = computeConfigHash(cfgA);
    const hashB = computeConfigHash(cfgB);
    assert.notStrictEqual(hashA, hashB);
});

test('13. runtime config is deeply immutable', () => {
    const { config } = createRuntimeConfig(defaultConfig);

    assert.throws(() => {
        (config as unknown as { humanMoves: { mastersWeight: number } }).humanMoves.mastersWeight = 10;
    }, TypeError);

    assert.throws(() => {
        (config as unknown as { moveBands: { earlyThrough: number } }).moveBands.earlyThrough = 5;
    }, TypeError);
});

test('14. mutating a source object after snapshot creation cannot alter snapshot', () => {
    const source = JSON.parse(JSON.stringify(defaultConfig));
    const { config, configHash } = createRuntimeConfig(source);

    // Mutate source
    source.humanMoves.mastersWeight = 100;

    // Snapshot should remain unchanged
    assert.strictEqual(config.humanMoves.mastersWeight, 5);

    // Hash should remain unchanged
    assert.strictEqual(computeConfigHash(config), configHash);
});

test('15. central config carries no trap/threat policy', () => {
    const keys = JSON.stringify(defaultConfig).toLowerCase();
    assert.strictEqual(keys.includes('trap'), false);
    assert.strictEqual(keys.includes('threat'), false);
});

test('16. general config changes such as engine tolerance do not change the human explorer profile', () => {
    const { computeExplorerRequestProfile } = require('./config');
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    cfgB.engineVerification.apiToleranceCp.early = 1000;

    const profileA = computeExplorerRequestProfile(cfgA);
    const profileB = computeExplorerRequestProfile(cfgB);
    assert.strictEqual(profileA, profileB);
});

test('17. operational request settings such as retryAttempts/delays do not change the human explorer profile', () => {
    const { computeExplorerRequestProfile } = require('./config');
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    cfgB.api.lichessExplorer.retryAttempts = 99;
    cfgB.api.betweenRequestDelayMs = 5000;

    const profileA = computeExplorerRequestProfile(cfgA);
    const profileB = computeExplorerRequestProfile(cfgB);
    assert.strictEqual(profileA, profileB);
});

test('18. request-shaping changes such as ratings/speeds do change the profile', () => {
    const { computeExplorerRequestProfile } = require('./config');
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    cfgB.humanExplorerRequest.amateur.ratings.push(2200);

    const profileA = computeExplorerRequestProfile(cfgA);
    const profileB = computeExplorerRequestProfile(cfgB);
    assert.notStrictEqual(profileA, profileB);

    const cfgC = JSON.parse(JSON.stringify(defaultConfig));
    cfgC.humanExplorerRequest.elite.speeds = ["blitz"];
    const profileC = computeExplorerRequestProfile(cfgC);
    assert.notStrictEqual(profileA, profileC);
});

test('19. humanExplorerRequest invalid values rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.humanExplorerRequest.elite.speeds = ["   "];
    assert.throws(() => validateConfig(cfg1), /Invalid humanExplorerRequest.elite.speeds/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.humanExplorerRequest.amateur.ratings = [0];
    assert.throws(() => validateConfig(cfg2), /Invalid humanExplorerRequest.amateur.ratings/);

    const cfg3 = JSON.parse(JSON.stringify(defaultConfig));
    cfg3.humanExplorerRequest.elite.ratings = [2500.5];
    assert.throws(() => validateConfig(cfg3), /Invalid humanExplorerRequest.elite.ratings/);
});
