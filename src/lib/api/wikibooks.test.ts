import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { defaultConfig } from "../core/config";
import { isApiOff, resetApiState } from "./retry";
import { fetchWikibooksSnippet } from "./wikibooks";

const originalLog = console.log;
let logs: string[] = [];

beforeEach(() => {
  resetApiState();
  logs = [];
  console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };
});

afterEach(() => {
  console.log = originalLog;
  resetApiState();
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
}

const absenceResponse = () => jsonResponse({ query: { pages: { "-1": { missing: "" } } } });

test("Wikibooks preserves headings and accepts short non-empty extracts", async () => {
  let requestedUrl = "";
  let requestedUserAgent = "";
  const result = await fetchWikibooksSnippet(["e4", "c6"], {
    fetch: async (url, init) => {
      requestedUrl = String(url);
      requestedUserAgent = (init?.headers as Record<string, string>)["User-Agent"];
      return jsonResponse({ query: { pages: { "123": { pageid: 123, extract: "  == Heading ==\nShort text.  " } } } });
    }
  });
  assert.deepStrictEqual(result, { status: "DESCRIPTION", text: "== Heading ==\nShort text." });
  assert.match(requestedUrl, /maxlag=5/);
  assert.match(requestedUserAgent, /chess-repertoire/);
});

test("AR.06: Wikibooks missing page is valid absence without retry", async () => {
  let attempts = 0;
  const result = await fetchWikibooksSnippet(["e4"], {
    fetch: async () => {
      attempts++;
      return absenceResponse();
    }
  });
  assert.deepStrictEqual(result, { status: "VALID_ABSENCE" });
  assert.equal(attempts, 1);
});

test("AR.08, AR.11, AR.13: Wikibooks failing again after retry is turned off and returns a technical failure", async () => {
  const waits: number[] = [];
  let attempts = 0;
  const request = (async () => {
    attempts++;
    return new Response("lagged", { status: 503, headers: { "Retry-After": "2" } });
  }) as typeof fetch;

  const result = await fetchWikibooksSnippet(["d4"], { fetch: request, wait: async ms => { waits.push(ms); } });
  assert.equal(result.status, "TECHNICAL_FAILURE");
  assert.equal(attempts, 2);
  assert.ok(waits.some(ms => ms > defaultConfig.apiRetryDelayMs - 1000), "paused for apiRetryDelayMs, not the shorter Retry-After");
  assert.deepStrictEqual(logs.slice(-1), ["[WARNING] Wikibooks failed again after retry: HTTP 503. Turned off for the rest of this run."]);
  assert.equal(isApiOff("Wikibooks"), true);

  const later = await fetchWikibooksSnippet(["e4"], { fetch: request, wait: async () => {} });
  assert.equal(later.status, "TECHNICAL_FAILURE");
  assert.equal(attempts, 2, "no more requests once off");
});

test("AR.10: a malformed Wikibooks answer is a hard error, not retried", async () => {
  let attempts = 0;
  await assert.rejects(
    fetchWikibooksSnippet(["Nf3"], {
      fetch: async () => {
        attempts++;
        return jsonResponse({ query: {} });
      },
      wait: async () => {}
    }),
    /Wikibooks returned a malformed answer: response is missing pages/
  );
  assert.equal(attempts, 1);
});

test("AR.01: Wikibooks requests use a contact-bearing User-Agent and one lane", async () => {
  const waits: number[] = [];
  const headers: string[] = [];
  const request = (async (_url: string | URL | Request, init?: RequestInit) => {
    headers.push(new Headers(init?.headers).get("User-Agent") ?? "");
    return absenceResponse();
  }) as typeof fetch;

  await Promise.all([
    fetchWikibooksSnippet(["e4"], { fetch: request, wait: async ms => { waits.push(ms); } }),
    fetchWikibooksSnippet(["d4"], { fetch: request, wait: async ms => { waits.push(ms); } })
  ]);

  assert.equal(headers.length, 2);
  assert.ok(headers.every(value => value === defaultConfig.api.wikibooks.userAgent));
  assert.match(headers[0], /https:\/\/github\.com\/vyaroslav2\/chess-repertoire/);
  assert.ok(waits.some(ms => ms >= defaultConfig.apiRequestGapMs - 50));
});

test("AR.07: Wikibooks HTTP 429 pauses the lane for apiRetryDelayMs, then retries once", async () => {
  const waits: number[] = [];
  let attempts = 0;
  const request = (async () => {
    attempts++;
    return attempts === 1
      ? new Response("rate limited", { status: 429 })
      : absenceResponse();
  }) as typeof fetch;

  const result = await fetchWikibooksSnippet(["c4"], {
    fetch: request,
    wait: async ms => { waits.push(ms); }
  });

  assert.equal(result.status, "VALID_ABSENCE");
  assert.equal(attempts, 2);
  assert.ok(waits.some(ms => ms > defaultConfig.apiRetryDelayMs - 1000));
});
