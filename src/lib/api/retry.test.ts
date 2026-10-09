import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { defaultConfig } from '../core/config';
import { isApiOff, lichessHeaders, requestApi, resetApiState } from './retry';

const original = {
  fetch: global.fetch,
  gap: defaultConfig.apiRequestGapMs,
  retryDelay: defaultConfig.apiRetryDelayMs,
  timeout: defaultConfig.apiRequestTimeoutMs,
  log: console.log
};
let logs: string[] = [];

beforeEach(() => {
  resetApiState();
  defaultConfig.apiRequestGapMs = 0;
  defaultConfig.apiRetryDelayMs = 0;
  logs = [];
  console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };
});

afterEach(() => {
  global.fetch = original.fetch;
  defaultConfig.apiRequestGapMs = original.gap;
  defaultConfig.apiRetryDelayMs = original.retryDelay;
  defaultConfig.apiRequestTimeoutMs = original.timeout;
  console.log = original.log;
  resetApiState();
});

/** Answers in turn; the last one repeats. Counts every request. */
function answers(...responses: Array<() => Response | Promise<Response>>) {
  const calls: number[] = [];
  const send = (async () => {
    calls.push(Date.now());
    return responses[Math.min(calls.length - 1, responses.length - 1)]();
  }) as typeof fetch;
  return { send, calls };
}

const ok = (body: unknown = { moves: [] }) => () => new Response(JSON.stringify(body));
const status = (code: number, headers?: Record<string, string>) => () => new Response('x', { status: code, headers });

test('AR.01: requests on one lane go one at a time, with the gap after each answer', async () => {
  defaultConfig.apiRequestGapMs = 40;
  const starts: number[] = [];
  const ends: number[] = [];
  global.fetch = (async () => {
    starts.push(Date.now());
    await new Promise(resolve => setTimeout(resolve, 20));
    ends.push(Date.now());
    return new Response(JSON.stringify({ moves: [] }));
  }) as typeof fetch;

  await Promise.all([
    requestApi('Explorer', 'https://explorer.lichess.ovh/lichess?fen=one', { body: 'json' }),
    requestApi('Explorer', 'https://explorer.lichess.ovh/lichess?fen=two', { body: 'json' })
  ]);

  assert.strictEqual(starts.length, 2);
  assert.ok(starts[1] - ends[0] >= 38, `second request started ${starts[1] - ends[0]}ms after the first answer`);
});

test('AR.01: Explorer and Wikibooks each have their own lane', async () => {
  defaultConfig.apiRequestGapMs = 5_000;
  const waits: number[] = [];
  const wait = async (ms: number) => { waits.push(ms); };
  const { send } = answers(ok());

  await requestApi('Explorer', 'https://explorer.lichess.ovh/lichess', { body: 'json', fetch: send, wait });
  await requestApi('Wikibooks', 'https://en.wikibooks.org/w/api.php', { body: 'json', fetch: send, wait });
  assert.deepStrictEqual(waits, [], 'Wikibooks did not wait for the Lichess gap');

  await requestApi('Explorer', 'https://explorer.lichess.ovh/lichess', { body: 'json', fetch: send, wait });
  assert.strictEqual(waits.length, 1);
  assert.ok(waits[0] > 4_900, `Explorer waited ${waits[0]}ms after Explorer`);
});

test('AR.03: a request with no answer after apiRequestTimeoutMs counts as a network error', async () => {
  defaultConfig.apiRequestTimeoutMs = 20;
  let attempts = 0;
  global.fetch = ((_url: string, init?: RequestInit) => {
    attempts++;
    if (attempts === 2) return Promise.resolve(new Response(JSON.stringify({ moves: [] })));
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    });
  }) as typeof fetch;

  const result = await requestApi('Explorer', 'https://explorer.lichess.ovh/lichess', { body: 'json' });
  assert.deepStrictEqual(result, { kind: 'answer', body: { moves: [] } });
  assert.strictEqual(attempts, 2);
  assert.deepStrictEqual(logs, ['[WARNING] Explorer returned a timeout. Pausing the Lichess lane for 0 s, then retrying once.']);
});

test('AR.04: requests never prompt the user', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/api/retry.ts'), 'utf8');
  assert.doesNotMatch(source, /readline|prompt/i);
});

test('AR.05: a readable HTTP 200 is returned as the answer', async () => {
  const { send, calls } = answers(ok({ moves: [{ san: 'e4' }] }));
  const result = await requestApi('Explorer', 'https://explorer.lichess.ovh/lichess', { body: 'json', fetch: send });
  assert.deepStrictEqual(result, { kind: 'answer', body: { moves: [{ san: 'e4' }] } });
  assert.strictEqual(calls.length, 1);
});

test('AR.07: 429, 5xx and network errors pause the lane for apiRetryDelayMs, then retry once', async () => {
  defaultConfig.apiRetryDelayMs = 120_000;
  for (const [first, reason] of [
    [status(429), 'HTTP 429'],
    [status(503), 'HTTP 503'],
    [() => { throw new TypeError('fetch failed'); }, 'a network error (fetch failed)']
  ] as const) {
    resetApiState();
    logs = [];
    const waits: number[] = [];
    const { send, calls } = answers(first, ok());
    const result = await requestApi('Wikibooks', 'https://en.wikibooks.org/w/api.php', {
      body: 'json', fetch: send, wait: async ms => { waits.push(ms); }
    });
    assert.deepStrictEqual(result, { kind: 'answer', body: { moves: [] } });
    assert.strictEqual(calls.length, 2);
    assert.ok(waits.length === 1 && waits[0] > 119_000, `paused ${waits}ms`);
    assert.deepStrictEqual(logs, [`[WARNING] Wikibooks returned ${reason}. Pausing the Wikibooks lane for 120 s, then retrying once.`]);
  }
});

test('AR.07: a longer Retry-After is obeyed; a shorter one is not', async () => {
  defaultConfig.apiRetryDelayMs = 120_000;
  for (const [retryAfter, expectedS] of [['300', 300], ['5', 120]] as const) {
    resetApiState();
    logs = [];
    const waits: number[] = [];
    const { send } = answers(status(429, { 'Retry-After': retryAfter }), ok());
    await requestApi('Wikibooks', 'https://en.wikibooks.org/w/api.php', {
      body: 'json', fetch: send, wait: async ms => { waits.push(ms); }
    });
    assert.ok(waits[0] > expectedS * 1000 - 1000 && waits[0] <= expectedS * 1000, `paused ${waits[0]}ms`);
    assert.deepStrictEqual(logs, [`[WARNING] Wikibooks returned HTTP 429. Pausing the Wikibooks lane for ${expectedS} s, then retrying once.`]);
  }
});

test('AR.08, AR.11, AR.13: Wikibooks failing again after retry is turned off for the run', async () => {
  const { send, calls } = answers(status(503));
  const result = await requestApi('Wikibooks', 'https://en.wikibooks.org/w/api.php', { body: 'json', fetch: send });
  assert.deepStrictEqual(result, { kind: 'off' });
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(logs, [
    '[WARNING] Wikibooks returned HTTP 503. Pausing the Wikibooks lane for 0 s, then retrying once.',
    '[WARNING] Wikibooks failed again after retry: HTTP 503. Turned off for the rest of this run.'
  ]);
  assert.strictEqual(isApiOff('Wikibooks'), true);

  assert.deepStrictEqual(await requestApi('Wikibooks', 'https://en.wikibooks.org/w/api.php', { body: 'json', fetch: send }), { kind: 'off' });
  assert.strictEqual(calls.length, 2, 'no more requests once off');
  assert.strictEqual(isApiOff('Explorer'), false);
});

test('AR.08, AR.11: Explorer failing again after retry throws', async () => {
  const { send, calls } = answers(status(502));
  await assert.rejects(
    requestApi('Explorer', 'https://explorer.lichess.ovh/lichess', { body: 'json', fetch: send }),
    /Explorer failed again after retry: HTTP 502\./
  );
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(isApiOff('Explorer'), false);
});

test('AR.09: any other 4xx gives up at once without a retry', async () => {
  for (const code of [400, 401, 403, 404]) {
    resetApiState();
    logs = [];
    const { send, calls } = answers(status(code));
    assert.deepStrictEqual(await requestApi('Wikibooks', 'https://en.wikibooks.org/w/api.php', { body: 'json', fetch: send }), { kind: 'off' });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(isApiOff('Wikibooks'), true);
    assert.deepStrictEqual(logs, [`[WARNING] Wikibooks returned HTTP ${code}. Not retrying.`]);
  }

  const { send, calls } = answers(status(404));
  await assert.rejects(
    requestApi('Explorer', 'https://explorer.lichess.ovh/lichess', { body: 'json', fetch: send }),
    /Explorer returned HTTP 404\./
  );
  assert.strictEqual(calls.length, 1);
});

test('AR.10: an HTTP 200 with a malformed body is a hard error, not retried', async () => {
  const { send, calls } = answers(() => new Response('<html>not json</html>'));
  await assert.rejects(
    requestApi('Wikibooks', 'https://en.wikibooks.org/w/api.php', { body: 'json', fetch: send }),
    /Wikibooks returned a malformed answer/
  );
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(isApiOff('Wikibooks'), false);
});

test('Lichess token goes only where asked', () => {
  const token = process.env.LICHESS_API_TOKEN;
  process.env.LICHESS_API_TOKEN = 'secret-token';
  try {
    assert.strictEqual(lichessHeaders(true).Authorization, 'Bearer secret-token');
    assert.strictEqual(lichessHeaders(false).Authorization, undefined);
  } finally {
    if (token === undefined) delete process.env.LICHESS_API_TOKEN;
    else process.env.LICHESS_API_TOKEN = token;
  }
});
