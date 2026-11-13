// Every PrismaClient the app or a test uses is made here. In a test run, the client works on
// test.db only: anything else, dev.db included, is refused at the first query.
// Why: on 2026-11-13 a test run directly (not through scripts/run_db_tests.ts) fell back to
// .env, i.e. dev.db, and wiped the whole engine cache.
import { PrismaClient } from "@prisma/client";

const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const TEST_DATABASE = /^file:(.*[\\/])?test\.db$/;

/** True under `node --test` / `tsx --test`, or when a `.test.ts` file is run directly. */
export function isTestRun(): boolean {
  return process.env.NODE_TEST_CONTEXT !== undefined || process.argv.slice(1).some(arg => TEST_FILE.test(arg));
}

export function isTestDatabaseUrl(url: string | undefined): boolean {
  return url !== undefined && TEST_DATABASE.test(url);
}

/** A client that throws on any use, but lets `$disconnect` through so cleanup code still runs. */
function refusingClient(reason: string): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      if (property === "$disconnect") return async () => {};
      if (property === "then" || typeof property === "symbol") return undefined;
      throw new Error(reason);
    },
  });
}

export function createPrismaClient(): PrismaClient {
  if (!isTestRun()) return new PrismaClient();
  const url = process.env.DATABASE_URL;
  if (!isTestDatabaseUrl(url)) {
    const where = url === undefined ? "not set, so Prisma would use .env: dev.db" : url;
    return refusingClient(`Refused: tests run on test.db only, but DATABASE_URL is ${where}. Run them with: npx tsx scripts/run_db_tests.ts <file>`);
  }
  return new PrismaClient({ datasourceUrl: url });
}
