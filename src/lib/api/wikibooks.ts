import { defaultConfig } from "../core/config";
import { requestApi } from "./retry";

export type WikibooksResult =
  | { status: "DESCRIPTION"; text: string }
  | { status: "VALID_ABSENCE" }
  | { status: "TECHNICAL_FAILURE"; reason: string };

type WikibooksDependencies = {
  fetch?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
};

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

  const config = defaultConfig.api.wikibooks;
  const url = `https://en.wikibooks.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&maxlag=${config.maxLagSeconds}&titles=${encodeURIComponent(pagePath)}&format=json`;
  const answer = await requestApi("Wikibooks", url, {
    body: "json",
    headers: { "User-Agent": config.userAgent },
    fetch: dependencies.fetch,
    wait: dependencies.wait
  });
  // AR.11, AR.12: a give-up leaves the node without text and is not cached.
  if (answer.kind !== "answer") return { status: "TECHNICAL_FAILURE", reason: "Wikibooks is turned off for the rest of this run" };

  try {
    return parseResult(answer.body);
  } catch (error) {
    // AR.10: a malformed answer is a hard error.
    throw new Error(`Wikibooks returned a malformed answer: ${error instanceof Error ? error.message : String(error)}`);
  }
}
