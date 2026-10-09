import { defaultConfig } from '../core/config';

export class UserRequestedStopError extends Error {
  constructor(message = 'Generation was stopped at the user\'s request') {
    super(message);
    this.name = 'UserRequestedStopError';
  }
}

export const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/** AR.01: every outside API, and the lane it shares. */
export type ApiName = "Explorer" | "Wikibooks";
type LaneName = "Lichess" | "Wikibooks";

const laneOf: Record<ApiName, LaneName> = {
  "Explorer": "Lichess",
  "Wikibooks": "Wikibooks"
};

type Lane = { queue: Promise<void>; nextRequestAt: number };

let lanes: Record<LaneName, Lane>;
let apisOff: Set<ApiName>;

/** Fresh lanes and every API on. Called once per process; tests call it between cases. */
export function resetApiState(): void {
  lanes = {
    Lichess: { queue: Promise.resolve(), nextRequestAt: 0 },
    Wikibooks: { queue: Promise.resolve(), nextRequestAt: 0 }
  };
  apisOff = new Set();
}
resetApiState();

/** AR.13: an API that gave up gets no more requests this run. */
export function isApiOff(api: ApiName): boolean {
  return apisOff.has(api);
}

export function lichessHeaders(useToken: boolean): Record<string, string> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (useToken && process.env.LICHESS_API_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.LICHESS_API_TOKEN}`;
  }
  return headers;
}

export type ApiResponse =
  | { kind: "answer"; body: any }  // AR.05
  | { kind: "off" };               // AR.11: gave up, now or earlier in the run

type RequestOptions = {
  body: "json";
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
};

type Attempt =
  | { kind: "response"; status: number; headers: Headers; text: string }
  | { kind: "failed"; reason: string };

/** The AR.07 pause after this attempt, or 0. */
function pauseAfter(attempt: Attempt): number {
  return retryableProblem(attempt) ? Math.max(defaultConfig.apiRetryDelayMs, retryAfterMs(attempt)) : 0;
}

/** AR.01-AR.03: one request at a time per lane, with the gap and the timeout. AR.07's pause is set before the lane is released. */
async function sendThroughLane(api: ApiName, url: string, options: RequestOptions): Promise<Attempt> {
  const lane = lanes[laneOf[api]];
  const wait = options.wait ?? delay;
  const previous = lane.queue;
  let release!: () => void;
  lane.queue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  let attempt: Attempt = { kind: "failed", reason: "no request sent" };
  try {
    const gapMs = lane.nextRequestAt - Date.now();
    if (gapMs > 0) await wait(gapMs);
    const send = options.fetch ?? fetch;
    try {
      const response = await send(url, {
        headers: options.headers,
        signal: AbortSignal.timeout(defaultConfig.apiRequestTimeoutMs)
      });
      const text = await response.text();
      attempt = { kind: "response", status: response.status, headers: response.headers, text };
    } catch (e: any) {
      attempt = e?.name === "TimeoutError"
        ? { kind: "failed", reason: "a timeout" }
        : { kind: "failed", reason: `a network error (${e?.message ?? String(e)})` };
    }
    return attempt;
  } finally {
    const waitMs = Math.max(defaultConfig.apiRequestGapMs, pauseAfter(attempt));
    lane.nextRequestAt = Math.max(lane.nextRequestAt, Date.now() + waitMs);
    release();
  }
}

/** AR.07: the cases worth one retry. Returns the reason, or null. */
function retryableProblem(attempt: Attempt): string | null {
  if (attempt.kind === "failed") return attempt.reason;
  if (attempt.status === 429 || (attempt.status >= 500 && attempt.status <= 599)) return `HTTP ${attempt.status}`;
  return null;
}

function retryAfterMs(attempt: Attempt): number {
  if (attempt.kind !== "response") return 0;
  const header = attempt.headers.get("Retry-After");
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(header);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : 0;
}

/** AR.11: Explorer stops the run; the others are turned off. */
function giveUp(api: ApiName, reason: string, afterRetry: boolean): ApiResponse {
  if (api === "Explorer") {
    throw new Error(afterRetry ? `Explorer failed again after retry: ${reason}.` : `Explorer returned ${reason}.`);
  }
  apisOff.add(api);
  if (afterRetry) {
    console.log(`[WARNING] ${api} failed again after retry: ${reason}. Turned off for the rest of this run.`);
  }
  return { kind: "off" };
}

/** AR: send one request under the shared rules. Only a real answer comes back to cache (AR.12). AR.06's missing Wikibooks page is a 200 answer. */
export async function requestApi(api: ApiName, url: string, options: RequestOptions): Promise<ApiResponse> {
  if (apisOff.has(api)) return { kind: "off" };

  let attempt = await sendThroughLane(api, url, options);
  const problem = retryableProblem(attempt);
  if (problem) {
    // sendThroughLane has already paused the lane; the retry waits its turn behind the pause.
    console.log(`[WARNING] ${api} returned ${problem}. Pausing the ${laneOf[api]} lane for ${Math.ceil(pauseAfter(attempt) / 1000)} s, then retrying once.`);
    attempt = await sendThroughLane(api, url, options);
    const again = retryableProblem(attempt);
    if (again) return giveUp(api, again, true); // AR.08
  }
  if (attempt.kind !== "response") throw new Error("unreachable");

  if (attempt.status < 200 || attempt.status > 299) {
    console.log(`[WARNING] ${api} returned HTTP ${attempt.status}. Not retrying.`); // AR.09
    return giveUp(api, `HTTP ${attempt.status}`, false);
  }
  try {
    return { kind: "answer", body: JSON.parse(attempt.text) };
  } catch (e: any) {
    // AR.10: a hard error, never retried.
    throw new Error(`${api} returned a malformed answer: ${e.message}`);
  }
}
