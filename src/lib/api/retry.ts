import * as readline from 'readline/promises';
import { stdin as processStdin, stdout as processStdout } from 'process';

export const GlobalState = {
    useLichessEval: true
};

export const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function promptUser(query: string): Promise<string> {
  const rl = readline.createInterface({ input: processStdin, output: processStdout });
  const answer = await rl.question(query);
  rl.close();
  return answer;
}

export async function fetchWithRetry(url: string, retries = 10, useToken = true, apiType: 'eval' | 'explorer' = 'explorer'): Promise<any> {
  const headers: any = { 'Accept': 'application/json' };
  if (useToken && process.env.LICHESS_API_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.LICHESS_API_TOKEN}`;
  }

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { headers });
      if (response.status === 429) {
        if (i < retries - 1) {
            console.log(`[WARNING] Lichess rate limit (429) on ${url}. Auto-retrying in 2s (Attempt ${i+1}/${retries})...`);
            await delay(2000);
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
            GlobalState.useLichessEval = false;
            return null;
        } else if (choice === 'n') {
            return null;
        }
        return await fetchWithRetry(url, retries, useToken, apiType);
      }
      if (!response.ok) {
        console.log(`Lichess error ${response.status} on ${url}`);
        return null;
      }
      return await response.json();
    } catch (e: any) {
      console.log(`[WARNING] Network error fetching ${url}: ${e.message}`);
      if (i === retries - 1) {
          const cOption = apiType === 'eval' ? `, [c]=Fallback to ChessDB` : ``;
          const answer = await promptUser(`\n[ACTION REQUIRED] Network errors exhausted. Switch VPN and press Enter to retry. (Options: [Enter]=Retry, [n]=Deny/Skip${cOption}, [s]=Stop script): `);
          const choice = answer.toLowerCase().trim();
          
          if (choice === 's') {
              console.log("Stopping script.");
              process.exit(0);
          } else if (choice === 'c' && apiType === 'eval') {
              GlobalState.useLichessEval = false;
              return null;
          } else if (choice === 'n') {
              return null;
          }
          return await fetchWithRetry(url, retries, useToken, apiType);
      }
      await delay(1000);
      continue;
    }
  }
  return null;
}
