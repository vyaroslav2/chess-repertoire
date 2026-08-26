import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { defaultConfig } from '../core/config';
import { fetchWithRetry } from './retry';

test('Explorer request spacing belongs to the shared request layer', async (t) => {
  const originalFetch = global.fetch;
  const originalSpacing = defaultConfig.api.betweenRequestDelayMs;
  const originalNetworkRetryDelay = defaultConfig.api.networkRetryDelayMs;

  try {
    await t.test('fetchAllDatabases has no high-level spacing dependency', () => {
      const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/api/lichess.ts'), 'utf8');
      assert.doesNotMatch(source, /betweenRequestDelayMs|\bdelay\s*\(/);
    });

    await t.test('concurrent Explorer requests are centrally spaced', async () => {
      const spacingMs = 40;
      defaultConfig.api.betweenRequestDelayMs = spacingMs;
      const requestTimes: number[] = [];
      global.fetch = async () => {
        requestTimes.push(Date.now());
        return new Response(JSON.stringify({ moves: [] }));
      };

      await Promise.all([
        fetchWithRetry('https://explorer.lichess.ovh/masters?fen=one', 1),
        fetchWithRetry('https://explorer.lichess.ovh/masters?fen=two', 1)
      ]);

      assert.strictEqual(requestTimes.length, 2);
      assert.ok(requestTimes[1] - requestTimes[0] >= spacingMs - 2,
        `requests were only ${requestTimes[1] - requestTimes[0]}ms apart`);
    });

    await t.test('retry attempts still occur through the spaced request layer', async () => {
      defaultConfig.api.betweenRequestDelayMs = 10;
      defaultConfig.api.networkRetryDelayMs = 0;
      let attempts = 0;
      global.fetch = async () => {
        attempts++;
        if (attempts === 1) throw new Error('temporary network failure');
        return new Response(JSON.stringify({ moves: [] }));
      };

      const result = await fetchWithRetry('https://explorer.lichess.ovh/masters?fen=retry', 2);
      assert.deepStrictEqual(result, { moves: [] });
      assert.strictEqual(attempts, 2);
    });
  } finally {
    global.fetch = originalFetch;
    defaultConfig.api.betweenRequestDelayMs = originalSpacing;
    defaultConfig.api.networkRetryDelayMs = originalNetworkRetryDelay;
  }
});
