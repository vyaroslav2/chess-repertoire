import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { defaultConfig } from '../core/config';
import { EventEmitter } from 'node:events';
import { fetchWithRetry, forwardCtrlCToRun, LichessRateLimitError, UserRequestedStopError } from './retry';

test('Explorer request spacing belongs to the shared request layer', async (t) => {
  const originalFetch = global.fetch;
  const originalSpacing = defaultConfig.apiRequestGapMs;
  const originalNetworkRetryDelay = defaultConfig.api.networkRetryDelayMs;
  const originalRateLimitRetryDelay = defaultConfig.apiRetryDelayMs;

  try {
    await t.test('fetchAllDatabases has no high-level spacing dependency', () => {
      const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/api/lichess.ts'), 'utf8');
      assert.doesNotMatch(source, /apiRequestGapMs|\bdelay\s*\(/);
    });

    await t.test('concurrent Explorer requests are centrally spaced', async () => {
      const spacingMs = 40;
      defaultConfig.apiRequestGapMs = spacingMs;
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
      defaultConfig.apiRequestGapMs = 10;
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

    await t.test('a 429 imposes one shared cooldown before retrying', async () => {
      const cooldownMs = 40;
      defaultConfig.apiRequestGapMs = 0;
      defaultConfig.apiRetryDelayMs = cooldownMs;
      const requestTimes: number[] = [];
      global.fetch = async () => {
        requestTimes.push(Date.now());
        return requestTimes.length === 1
          ? new Response('limited', { status: 429 })
          : new Response(JSON.stringify({ moves: [] }));
      };

      await fetchWithRetry('https://explorer.lichess.ovh/masters?fen=cooldown', 2);
      assert.equal(requestTimes.length, 2);
      assert.ok(requestTimes[1] - requestTimes[0] >= cooldownMs - 2,
        `429 retry occurred after only ${requestTimes[1] - requestTimes[0]}ms`);
    });
  } finally {
    global.fetch = originalFetch;
    defaultConfig.apiRequestGapMs = originalSpacing;
    defaultConfig.api.networkRetryDelayMs = originalNetworkRetryDelay;
    defaultConfig.apiRetryDelayMs = originalRateLimitRetryDelay;
  }
});

test('request authentication and HTTP retry policy', async (t) => {
  const originalFetch = global.fetch;
  const originalToken = process.env.LICHESS_API_TOKEN;
  const originalNetworkRetryDelay = defaultConfig.api.networkRetryDelayMs;
  const originalSpacing = defaultConfig.apiRequestGapMs;
  const originalRateLimitRetryDelay = defaultConfig.apiRetryDelayMs;
  try {
    process.env.LICHESS_API_TOKEN = 'secret-token';
    defaultConfig.api.networkRetryDelayMs = 0;
    defaultConfig.apiRequestGapMs = 0;
    defaultConfig.apiRetryDelayMs = 0;

    await t.test('Explorer never sends Authorization while token-enabled eval still does', async () => {
      const headers: HeadersInit[] = [];
      global.fetch = async (_url, init) => {
        headers.push(init?.headers ?? {});
        return new Response(JSON.stringify({ moves: [] }));
      };
      await fetchWithRetry('https://explorer.lichess.ovh/masters', 1, false, 'explorer');
      await fetchWithRetry('https://lichess.org/api/cloud-eval', 1, true, 'eval');
      assert.equal((headers[0] as Record<string, string>).Authorization, undefined);
      assert.equal((headers[1] as Record<string, string>).Authorization, 'Bearer secret-token');
    });

    await t.test('502 retries and uses the later successful response', async () => {
      let attempts = 0;
      global.fetch = async () => {
        attempts++;
        return attempts === 1
          ? new Response('temporary', { status: 502 })
          : new Response(JSON.stringify({ moves: ['success'] }));
      };
      assert.deepStrictEqual(await fetchWithRetry('https://lichess.org/api/test', 2, true, 'eval'), { moves: ['success'] });
      assert.equal(attempts, 2);
    });

    await t.test('404 does not retry', async () => {
      let attempts = 0;
      global.fetch = async () => {
        attempts++;
        return new Response('missing', { status: 404 });
      };
      assert.equal(await fetchWithRetry('https://lichess.org/api/missing', 3, true, 'eval'), null);
      assert.equal(attempts, 1);
    });

    await t.test('Cloud Eval gets one cooldown retry then returns control to its fallback', async () => {
      let attempts = 0;
      global.fetch = async () => {
        attempts++;
        return new Response('limited', { status: 429 });
      };
      await assert.rejects(
        fetchWithRetry('https://lichess.org/api/cloud-eval', 10, false, 'eval'),
        error => error instanceof LichessRateLimitError
      );
      assert.equal(attempts, 2);
    });

    await t.test('required Explorer prompt offers retry/stop and stop throws a distinct error', async () => {
      global.fetch = async () => new Response('limited', { status: 429 });
      let prompt = '';
      let promptCount = 0;
      await assert.rejects(
        fetchWithRetry('https://explorer.lichess.ovh/masters', 1, false, 'explorer', {
          prompt: async query => {
            promptCount++;
            prompt = query;
            return 's';
          }
        }),
        error => error instanceof UserRequestedStopError
      );
      assert.equal(promptCount, 1);
      assert.match(prompt, /\[Enter\]=Retry, \[s\]=Stop/);
      assert.doesNotMatch(prompt, /Deny|Skip|\[n\]/);
    });

    await t.test('exhausted Explorer 5xx cannot masquerade as empty required data', async () => {
      let attempts = 0;
      let promptCount = 0;
      global.fetch = async () => {
        attempts++;
        return new Response('unavailable', { status: 503 });
      };
      await assert.rejects(
        fetchWithRetry('https://explorer.lichess.ovh/lichess', 2, false, 'explorer', {
          prompt: async () => {
            promptCount++;
            return 's';
          }
        }),
        error => error instanceof UserRequestedStopError
      );
      assert.equal(attempts, 2);
      assert.equal(promptCount, 1);
    });
  } finally {
    global.fetch = originalFetch;
    defaultConfig.api.networkRetryDelayMs = originalNetworkRetryDelay;
    defaultConfig.apiRequestGapMs = originalSpacing;
    defaultConfig.apiRetryDelayMs = originalRateLimitRetryDelay;
    if (originalToken === undefined) delete process.env.LICHESS_API_TOKEN;
    else process.env.LICHESS_API_TOKEN = originalToken;
  }
});

test('S0.02: Ctrl+C at a prompt reaches the run SIGINT listener', () => {
  const prompt = new EventEmitter();
  let heard = 0;
  const listener = () => { heard++; };
  process.on('SIGINT', listener);
  try {
    forwardCtrlCToRun(prompt);
    prompt.emit('SIGINT');
    prompt.emit('SIGINT');
  } finally {
    process.off('SIGINT', listener);
  }
  assert.strictEqual(heard, 2);
});
