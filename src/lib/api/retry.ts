import * as readline from 'readline/promises';
import { stdin as processStdin, stdout as processStdout } from 'process';
import { defaultConfig } from '../core/config';

export const GlobalState = {
    lichessCloudEvals: false
};

export const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

let explorerRequestQueue = Promise.resolve();
let nextExplorerRequestAt = 0;

async function waitForExplorerRequestSlot(): Promise<void> {
  const previousRequest = explorerRequestQueue;
  let releaseRequest!: () => void;
  explorerRequestQueue = new Promise<void>(resolve => {
    releaseRequest = resolve;
  });

  await previousRequest;
  try {
    const waitMs = Math.max(0, nextExplorerRequestAt - Date.now());
    if (waitMs > 0) {
      await delay(waitMs);
    }
    nextExplorerRequestAt = Date.now() + defaultConfig.api.betweenRequestDelayMs;
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

export async function fetchWithRetry(url: string, retryAttempts: number, useToken = true, apiType: 'eval' | 'explorer' = 'explorer'): Promise<any> {
  const headers: any = { 'Accept': 'application/json' };
  if (useToken && process.env.LICHESS_API_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.LICHESS_API_TOKEN}`;
  }

  for (let i = 0; i < retryAttempts; i++) {
    try {
      if (apiType === 'explorer') {
        await waitForExplorerRequestSlot();
      }
      const response = await fetch(url, { headers });
      if (response.status === 429) {
        if (i < retryAttempts - 1) {
            console.log(`[WARNING] Lichess rate limit (429) on ${url}. Auto-retrying in ${defaultConfig.api.rateLimitRetryDelayMs}ms (Attempt ${i+1}/${retryAttempts})...`);
            await delay(defaultConfig.api.rateLimitRetryDelayMs);
            continue;
        }

        console.log(`\n[WARNING] Lichess rate limit (429) on ${url}`);
        const cOption = apiType === 'eval' ? `, [c]=Fallback to ChessDB` : ``;
        const answer = await promptUser(`[ACTION REQUIRED] Auto-retries exhausted. Switch VPN and press Enter to retry. (Options: [Enter]=Retry, [n]=Deny/Skip${cOption}, [s]=Stop script): `);
        const choice = answer.toLowerCase().trim();
        
        if (choice === 's') {
            console.log("Stopping script.");
            process.exit(0);
        } else if (choice === 'c' && apiType === 'eval') {
            GlobalState.lichessCloudEvals = false;
            return null;
        } else if (choice === 'n') {
            return null;
        }
        return await fetchWithRetry(url, retryAttempts, useToken, apiType);
      }
      if (!response.ok) {
        console.log(`Lichess error ${response.status} on ${url}`);
        return null;
      }
      return await response.json();
    } catch (e: any) {
      console.log(`[WARNING] Network error fetching ${url}: ${e.message}`);
      if (i === retryAttempts - 1) {
          const cOption = apiType === 'eval' ? `, [c]=Fallback to ChessDB` : ``;
          const answer = await promptUser(`\n[ACTION REQUIRED] Network errors exhausted. Switch VPN and press Enter to retry. (Options: [Enter]=Retry, [n]=Deny/Skip${cOption}, [s]=Stop script): `);
          const choice = answer.toLowerCase().trim();
          
          if (choice === 's') {
              console.log("Stopping script.");
              process.exit(0);
          } else if (choice === 'c' && apiType === 'eval') {
              GlobalState.lichessCloudEvals = false;
              return null;
          } else if (choice === 'n') {
              return null;
          }
          return await fetchWithRetry(url, retryAttempts, useToken, apiType);
      }
      await delay(defaultConfig.api.networkRetryDelayMs);
      continue;
    }
  }
  return null;
}
