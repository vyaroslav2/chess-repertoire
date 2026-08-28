import * as readline from 'readline/promises';
import { stdin as processStdin, stdout as processStdout } from 'process';
import { defaultConfig } from '../core/config';

export const GlobalState = {
    lichessCloudEvals: false
};

export class UserRequestedStopError extends Error {
  constructor(message = 'Generation was stopped at the user\'s request') {
    super(message);
    this.name = 'UserRequestedStopError';
  }
}

export const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

function automaticRetryDelay(baseMs: number, attemptIndex: number): number {
  return Math.min(
    defaultConfig.api.maximumRetryDelayMs,
    baseMs * Math.pow(defaultConfig.api.retryBackoffMultiplier, attemptIndex)
  );
}

let lichessRequestQueue = Promise.resolve();
let nextLichessRequestAt = 0;

async function waitForLichessRequestSlot(): Promise<void> {
  const previousRequest = lichessRequestQueue;
  let releaseRequest!: () => void;
  lichessRequestQueue = new Promise<void>(resolve => {
    releaseRequest = resolve;
  });

  await previousRequest;
  try {
    const waitMs = Math.max(0, nextLichessRequestAt - Date.now());
    if (waitMs > 0) {
      await delay(waitMs);
    }
    nextLichessRequestAt = Date.now() + defaultConfig.api.betweenRequestDelayMs;
  } finally {
    releaseRequest();
  }
}

export async function promptUser(query: string): Promise<string> {
  const rl = readline.createInterface({ input: processStdin, output: processStdout });
  const answer = await rl.question(query);
  rl.close();
  return answer;
}

type FetchRetryDependencies = {
  prompt?: (query: string) => Promise<string>;
};

export async function fetchWithRetry(url: string, retryAttempts: number, useToken = true, apiType: 'eval' | 'explorer' | 'chessdb' = 'explorer', dependencies: FetchRetryDependencies = {}): Promise<any> {
  const headers: any = {};
  if (apiType !== 'chessdb') {
    headers['Accept'] = 'application/json';
  }
  
  if (useToken && process.env.LICHESS_API_TOKEN && apiType !== 'chessdb') {
      headers['Authorization'] = `Bearer ${process.env.LICHESS_API_TOKEN}`;
  }

  async function handleExhaustedRetries(reason: string): Promise<any> {
    const isRequiredExplorer = apiType === 'explorer';
    const cOption = apiType === 'eval' ? `, [c]=Fallback to ChessDB` : ``;
    const options = isRequiredExplorer
      ? `(Options: [Enter]=Retry, [s]=Stop)`
      : `(Options: [Enter]=Retry, [n]=Deny/Skip${cOption}, [s]=Stop script)`;
    const answer = await (dependencies.prompt ?? promptUser)(`\n[ACTION REQUIRED] ${reason} Switch VPN if needed and press Enter to retry. ${options}: `);
    const choice = answer.toLowerCase().trim();

    if (choice === 's') throw new UserRequestedStopError();
    if (choice === 'c' && apiType === 'eval') return null;
    if (choice === 'n' && !isRequiredExplorer) return null;
    return fetchWithRetry(url, retryAttempts, useToken, apiType, dependencies);
  }

  for (let i = 0; i < retryAttempts; i++) {
    try {
      if (apiType === 'explorer' || apiType === 'eval') {
        await waitForLichessRequestSlot();
      }
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(defaultConfig.api.requestTimeoutMs) });
      if (response.status === 429) {
        if (i < retryAttempts - 1) {
            console.log(`[WARNING] Rate limit (429) on ${url}. Auto-retrying in ${defaultConfig.api.rateLimitRetryDelayMs}ms (Attempt ${i+1}/${retryAttempts})...`);
            await delay(automaticRetryDelay(defaultConfig.api.rateLimitRetryDelayMs, i));
            continue;
        }

        console.log(`\n[WARNING] Rate limit (429) on ${url}`);
        return handleExhaustedRetries('Rate-limit retries exhausted.');
      }
      if (response.status >= 500 && response.status <= 599) {
        console.log(`[WARNING] Temporary HTTP ${response.status} on ${url}.`);
        if (i < retryAttempts - 1) {
          await delay(automaticRetryDelay(defaultConfig.api.networkRetryDelayMs, i));
          continue;
        }
        return handleExhaustedRetries(`HTTP ${response.status} retries exhausted.`);
      }
      if (!response.ok) {
        console.log(`Error ${response.status} on ${url}`);
        return null;
      }
      if (apiType === 'chessdb') {
        return await response.text();
      }
      return await response.json();
    } catch (e: any) {
      if (e instanceof UserRequestedStopError) {
        throw e;
      }

      console.log(`[WARNING] Network error fetching ${url}: ${e.message}`);
      if (i === retryAttempts - 1) {
          return handleExhaustedRetries('Network retries exhausted.');
      }
      await delay(automaticRetryDelay(defaultConfig.api.networkRetryDelayMs, i));
      continue;
    }
  }
  return null;
}
