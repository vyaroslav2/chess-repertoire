// The test.db guard. Touches no database.
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient, isTestDatabaseUrl, isTestRun } from "./client";

function withDatabaseUrl<T>(url: string | undefined, run: () => T): T {
  const saved = process.env.DATABASE_URL;
  if (url === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = url;
  try {
    return run();
  } finally {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  }
}

test("a test run is recognised", () => {
  assert.equal(isTestRun(), true);
});

test("only a file named test.db counts as the test database", () => {
  for (const url of ["file:./test.db", "file:C:\\chess-repertoire\\prisma\\test.db", "file:C:/chess-repertoire/prisma/test.db", "file:test.db"]) {
    assert.equal(isTestDatabaseUrl(url), true, url);
  }
  for (const url of [undefined, "", "file:./dev.db", "file:./prisma/dev.db", "file:./not-test.db", "file:./test.db.bak", "mysql://x/test.db"]) {
    assert.equal(isTestDatabaseUrl(url), false, String(url));
  }
});

test("in a test, a client for dev.db or no DATABASE_URL refuses every query", async () => {
  for (const url of [undefined, "file:./dev.db"]) {
    const client = withDatabaseUrl(url, createPrismaClient);
    assert.throws(() => client.engineCache, /tests run on test\.db only/);
    assert.throws(() => client.$transaction, /tests run on test\.db only/);
    await client.$disconnect();
  }
});

test("in a test, a client for test.db is a real client", async () => {
  const client = withDatabaseUrl("file:./test.db", createPrismaClient);
  assert.ok(client instanceof PrismaClient);
  await client.$disconnect();
});
