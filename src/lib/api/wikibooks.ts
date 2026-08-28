export type WikibooksResult =
  | { status: "DESCRIPTION"; text: string }
  | { status: "VALID_ABSENCE" }
  | { status: "TECHNICAL_FAILURE"; reason: string };

type WikibooksDependencies = {
  fetch?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function retryDelayMs(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const dateMs = Date.parse(retryAfter);
    if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  }
  const config = defaultConfig.api.wikibooks;
  return config.initialRetryDelayMs * Math.pow(config.retryBackoffMultiplier, attempt - 1);
}

function parseResult(data: unknown): WikibooksResult {
  if (!data || typeof data !== "object") throw new Error("response is not an object");
  const query = (data as Record<string, unknown>).query;
  if (!query || typeof query !== "object") throw new Error("response is missing query");
  const pages = (query as Record<string, unknown>).pages;
  if (!pages || typeof pages !== "object" || Array.isArray(pages)) throw new Error("response is missing pages");
  const entries = Object.entries(pages as Record<string, unknown>);
  if (entries.length !== 1) throw new Error("response has an unexpected page count");
  const [pageId, pageValue] = entries[0];
  if (!pageValue || typeof pageValue !== "object") throw new Error("page is malformed");
  const page = pageValue as Record<string, unknown>;
  if (pageId === "-1" || Object.prototype.hasOwnProperty.call(page, "missing")) return { status: "VALID_ABSENCE" };
  if (typeof page.extract !== "string") throw new Error("page extract is malformed");
  const text = page.extract.trim();
  return text ? { status: "DESCRIPTION", text } : { status: "VALID_ABSENCE" };
}

export async function fetchWikibooksSnippet(history: string[], dependencies: WikibooksDependencies = {}): Promise<WikibooksResult> {
  if (history.length === 0) return { status: "VALID_ABSENCE" };

  let pagePath = "Chess_Opening_Theory";
  for (let i = 0; i < history.length; i++) {
    const moveNum = Math.floor(i / 2) + 1;
    pagePath += i % 2 === 0 ? `/${moveNum}._${history[i]}` : `/${moveNum}...${history[i]}`;
  }

  const request = dependencies.fetch ?? fetch;
  const sleep = dependencies.wait ?? wait;
  const config = defaultConfig.api.wikibooks;
  const url = `https://en.wikibooks.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&maxlag=${config.maxLagSeconds}&titles=${encodeURIComponent(pagePath)}&format=json`;
  let lastReason = "unknown failure";

  for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
    let response: Response | null = null;
    try {
      response = await request(url, {
        headers: { "User-Agent": config.userAgent },
        signal: AbortSignal.timeout(config.requestTimeoutMs)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseResult(await response.json());
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
      if (attempt < config.retryAttempts) await sleep(retryDelayMs(response, attempt));
    }
  }

  console.warn(`[WARNING] Wikibooks lookup failed after ${config.retryAttempts} attempts: ${lastReason}`);
  return { status: "TECHNICAL_FAILURE", reason: lastReason };
}
import { defaultConfig } from "../core/config";
