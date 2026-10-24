import test from 'node:test';
import assert from 'node:assert';
import {
    defaultConfig,
    validateConfig,
    computeConfigHash,
    computeLocalEngineEvaluationProfile,
    createRuntimeConfig,
    computeExplorerCacheProfile
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
    assert.strictEqual(defaultConfig.minCumProb, 0.001);
    assert.strictEqual(defaultConfig.depthCap, 15);
    assert.deepStrictEqual(defaultConfig.explorerSpeeds, ['classical', 'rapid']);
    assert.deepStrictEqual(defaultConfig.explorerRatings, [1600, 1800, 2000]);
    assert.strictEqual(defaultConfig.apiRetryDelayMs, 120_000);
    assert.strictEqual(defaultConfig.apiRequestGapMs, 2_000);
    assert.strictEqual(defaultConfig.apiRequestTimeoutMs, 30_000);
    assert.strictEqual(defaultConfig.localStockfishVersion, 19);
    assert.strictEqual(defaultConfig.localStockfishNodes, 200_000_000);
    assert.strictEqual(defaultConfig.localStockfishThreads, 1);
    assert.strictEqual(defaultConfig.localStockfishHashMb, 1024);
    assert.strictEqual(defaultConfig.localStockfishMultiPv, 1);
    assert.deepStrictEqual(defaultConfig.hardcodedBlackResponses, ['1. e4 c6', '1. d4 d5']);
});

const AMATEUR_PROFILE = '315b7b6ed7ee94ad8b15ea57cfa4324700f8c14a4c489d1d0357e14f0faa2ead';
const LOCAL_PROFILE = 'da64ab3eb7bd609561a3badddeaa1244572475dac4a12df71e5cabb23f05e8ae';

test('DB.31, DB.32: the shipped cache profiles', () => {
    // The Amateur profile is the one used before the Masters and Elite datasets were dropped,
    // so the Explorer cache is reused. A change would refetch every position.
    assert.strictEqual(computeExplorerCacheProfile(defaultConfig), AMATEUR_PROFILE);
    assert.strictEqual(computeLocalEngineEvaluationProfile(defaultConfig), LOCAL_PROFILE);
});

test('DB.32: the Stockfish version is part of the local profile', () => {
    const changedVersion = JSON.parse(JSON.stringify(defaultConfig));
    changedVersion.localStockfishVersion = 18;
    assert.notStrictEqual(computeLocalEngineEvaluationProfile(defaultConfig), computeLocalEngineEvaluationProfile(changedVersion));
});

test('23. Local Deep profile tracks material search settings only', () => {
    const same = JSON.parse(JSON.stringify(defaultConfig));
    assert.strictEqual(computeLocalEngineEvaluationProfile(defaultConfig), computeLocalEngineEvaluationProfile(same));

    for (const setting of ['localStockfishNodes', 'localStockfishThreads', 'localStockfishHashMb']) {
        const changed = JSON.parse(JSON.stringify(defaultConfig));
        changed[setting] += 1;
        assert.notStrictEqual(computeLocalEngineEvaluationProfile(defaultConfig), computeLocalEngineEvaluationProfile(changed), `DB.32 ${setting}`);
    }

    const changedMultiPv = JSON.parse(JSON.stringify(defaultConfig));
    changedMultiPv.localStockfishMultiPv = 2;
    assert.notStrictEqual(computeLocalEngineEvaluationProfile(defaultConfig), computeLocalEngineEvaluationProfile(changedMultiPv));

    const changedOperational = JSON.parse(JSON.stringify(defaultConfig));
    changedOperational.apiRetryDelayMs += 1;
    assert.strictEqual(computeLocalEngineEvaluationProfile(defaultConfig), computeLocalEngineEvaluationProfile(changedOperational));
});

test('2. required value missing -> hard error', () => {
    const invalidConfig = { ...defaultConfig, minCumProb: undefined as unknown as number };
    assert.throws(() => validateConfig(invalidConfig), /Invalid minCumProb/);
});

test('3. invalid probabilities rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.minCumProb = 1.5;
    assert.throws(() => validateConfig(cfg1), /Invalid minCumProb/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.minCumProb = -0.1;
    assert.throws(() => validateConfig(cfg2), /Invalid minCumProb/);
});

test('4. invalid counts rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.nodeTouchCountCap = 0;
    assert.throws(() => validateConfig(cfg1), /Invalid nodeTouchCountCap/);

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

test('6. invalid engine nodes/threads/hash/MultiPV rejected', () => {
    for (const setting of ['localStockfishNodes', 'localStockfishThreads', 'localStockfishHashMb']) {
        const cfg = JSON.parse(JSON.stringify(defaultConfig));
        cfg[setting] = 0;
        assert.throws(() => validateConfig(cfg), new RegExp(`Invalid ${setting}`));
    }

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.localStockfishMultiPv = -1;
    assert.throws(() => validateConfig(cfg2), /Invalid localStockfishMultiPv/);

    const cfg3 = JSON.parse(JSON.stringify(defaultConfig));
    cfg3.localStockfishVersion = 0;
    assert.throws(() => validateConfig(cfg3), /Invalid localStockfishVersion/);
});

test('6a. finite numbers validated', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.minCumProb = NaN;
    assert.throws(() => validateConfig(cfg1), /Invalid minCumProb/);

    assert.throws(() => validateConfig({ ...defaultConfig, apiRequestGapMs: Infinity }), /Invalid apiRequestGapMs/);
});

test('6b. AR.03: zero request timeout rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.apiRequestTimeoutMs = 0;
    assert.throws(() => validateConfig(cfg1), /Invalid apiRequestTimeoutMs/);
});

test('6c. AR: retry settings not in generation-config are gone', () => {
    assert.deepStrictEqual(Object.keys(defaultConfig.api), ['wikibooks']);
    assert.deepStrictEqual(Object.keys(defaultConfig.api.wikibooks).sort(), ['maxLagSeconds', 'userAgent']);
});

test('11. semantically identical objects with different property order -> same configHash', () => {
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    // Scramble order of keys
    cfgB.api.wikibooks = {
        userAgent: cfgB.api.wikibooks.userAgent,
        maxLagSeconds: cfgB.api.wikibooks.maxLagSeconds
    };

    const hashA = computeConfigHash(cfgA);
    const hashB = computeConfigHash(cfgB);
    assert.strictEqual(hashA, hashB);
});

test('12. changing one effective value -> different configHash', () => {
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    cfgB.depthCap = 6; // effective change

    const hashA = computeConfigHash(cfgA);
    const hashB = computeConfigHash(cfgB);
    assert.notStrictEqual(hashA, hashB);
});

test('13. runtime config is deeply immutable', () => {
    const { config } = createRuntimeConfig(defaultConfig);

    assert.throws(() => {
        (config as unknown as { depthCap: number }).depthCap = 10;
    }, TypeError);

    assert.throws(() => {
        (config as unknown as { api: { wikibooks: { maxLagSeconds: number } } }).api.wikibooks.maxLagSeconds = 6;
    }, TypeError);
});

test('14. mutating a source object after snapshot creation cannot alter snapshot', () => {
    const source = JSON.parse(JSON.stringify(defaultConfig));
    const { config, configHash } = createRuntimeConfig(source);

    // Mutate source
    source.depthCap = 100;

    // Snapshot should remain unchanged
    assert.strictEqual(config.depthCap, 15);

    // Hash should remain unchanged
    assert.strictEqual(computeConfigHash(config), configHash);
});

test('15. central config carries no trap/threat policy', () => {
    const keys = JSON.stringify(defaultConfig).toLowerCase();
    assert.strictEqual(keys.includes('trap'), false);
    assert.strictEqual(keys.includes('threat'), false);
});

test('16. general config changes such as engine nodes do not change the human explorer profile', () => {
    
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    cfgB.localStockfishNodes = 30;

    const profileA = computeExplorerCacheProfile(cfgA);
    const profileB = computeExplorerCacheProfile(cfgB);
    assert.strictEqual(profileA, profileB);
});

test('17. operational request settings such as delays do not change the human explorer profile', () => {
    
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    cfgB.apiRetryDelayMs = 999_999;
    cfgB.apiRequestGapMs = 5000;

    const profileA = computeExplorerCacheProfile(cfgA);
    const profileB = computeExplorerCacheProfile(cfgB);
    assert.strictEqual(profileA, profileB);
});

test('18. request-shaping changes such as ratings/speeds do change the profile', () => {
    
    const cfgA = JSON.parse(JSON.stringify(defaultConfig));
    const cfgB = JSON.parse(JSON.stringify(defaultConfig));

    cfgB.explorerRatings.push(2200);

    const profileA = computeExplorerCacheProfile(cfgA);
    const profileB = computeExplorerCacheProfile(cfgB);
    assert.notStrictEqual(profileA, profileB);

    const cfgC = JSON.parse(JSON.stringify(defaultConfig));
    cfgC.explorerSpeeds = ["blitz"];
    const profileC = computeExplorerCacheProfile(cfgC);
    assert.notStrictEqual(profileA, profileC);
});

test('19. Explorer speeds and ratings: invalid values rejected', () => {
    const cfg1 = JSON.parse(JSON.stringify(defaultConfig));
    cfg1.explorerSpeeds = ["   "];
    assert.throws(() => validateConfig(cfg1), /Invalid explorerSpeeds/);

    const cfg2 = JSON.parse(JSON.stringify(defaultConfig));
    cfg2.explorerRatings = [0];
    assert.throws(() => validateConfig(cfg2), /Invalid explorerRatings/);

    const cfg3 = JSON.parse(JSON.stringify(defaultConfig));
    cfg3.explorerRatings = [1600.5];
    assert.throws(() => validateConfig(cfg3), /Invalid explorerRatings/);
});
