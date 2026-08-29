import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultConfig } from "../core/config";
import { fetchWikibooksSnippet } from "./wikibooks";

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

test("Wikibooks missing page is valid absence without retry", async () => {
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

test("Wikibooks technical failure retries three times, respects Retry-After, and remains distinct", async () => {
  const waits: number[] = [];
  let attempts = 0;
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const result = await fetchWikibooksSnippet(["d4"], {
      fetch: async () => {
        attempts++;
        return new Response("lagged", { status: 503, headers: { "Retry-After": "2" } });
      },
      wait: async ms => { waits.push(ms); }
    });
    assert.equal(result.status, "TECHNICAL_FAILURE");
    assert.equal(attempts, 3);
    assert.equal(waits.filter(ms => ms === 2000).length, 2);
    assert.match(warnings.join("\n"), /failed after 3 attempts/i);
  } finally {
    console.warn = originalWarn;
  }
});

test("malformed Wikibooks response is retried and a later valid result is used", async () => {
  let attempts = 0;
  const waits: number[] = [];
  const result = await fetchWikibooksSnippet(["Nf3"], {
    fetch: async () => {
      attempts++;
      if (attempts < 3) return jsonResponse({ query: {} });
      return jsonResponse({ query: { pages: { "9": { extract: "Recovered" } } } });
    },
    wait: async ms => { waits.push(ms); }
  });
  assert.deepStrictEqual(result, { status: "DESCRIPTION", text: "Recovered" });
  assert.equal(attempts, 3);
  assert.ok(waits.includes(1000));
  assert.ok(waits.includes(2000));
});

test("Wikibooks requests use a contact-bearing User-Agent and one global pacing gate", async () => {
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
  assert.ok(waits.some(ms => ms >= defaultConfig.api.wikibooks.minimumRequestIntervalMs - 50));
});

test("HTTP 429 without Retry-After waits at least five seconds before retrying", async () => {
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
  assert.ok(waits.some(ms => ms >= 5000));
});
