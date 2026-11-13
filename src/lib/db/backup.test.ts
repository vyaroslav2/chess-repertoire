// SC.58: the backup before each run. Works on a copy of test.db in a temp folder.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backupDatabase, sqliteFilePath } from "./backup";
import { createPrismaClient, isTestDatabaseUrl } from "./client";

assert.ok(isTestDatabaseUrl(process.env.DATABASE_URL), "backup tests run on test.db only");

test("sqliteFilePath resolves a relative URL from prisma/, as Prisma does", () => {
  assert.equal(sqliteFilePath("file:./dev.db", "C:\\repo\\prisma"), path.resolve("C:\\repo\\prisma", "dev.db"));
  assert.equal(sqliteFilePath("file:C:/x/test.db"), path.resolve("C:/x/test.db"));
  assert.throws(() => sqliteFilePath(undefined), /not set/);
  assert.throws(() => sqliteFilePath("mysql://h/db"), /SQLite file/);
});

test("the backup is a full copy, and only the oldest automatic backups are removed", async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));
  const source = path.join(folder, "test.db");
  fs.copyFileSync(sqliteFilePath(process.env.DATABASE_URL), source);
  const url = `file:${source}`;
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  const client = createPrismaClient();
  process.env.DATABASE_URL = saved;
  try {
    await client.user.create({ data: { username: "backup_test_user" } });

    const manual = path.join(folder, "test.db.bak-2026-11-07");
    fs.writeFileSync(manual, "made by hand");
    for (const name of ["test.db.bak-2026-01-01-0900", "test.db.bak-2026-01-02-0900", "test.db.bak-2026-01-03-0900"]) {
      fs.writeFileSync(path.join(folder, name), "old");
    }

    const first = await backupDatabase(client, { url, now: new Date(2026, 10, 13, 9, 30), kept: 3 });
    assert.equal(path.basename(first.path), "test.db.bak-2026-11-13-0930");
    assert.deepEqual(first.removed.map(file => path.basename(file)), ["test.db.bak-2026-01-01-0900"]);

    const second = await backupDatabase(client, { url, now: new Date(2026, 10, 13, 9, 30), kept: 3 });
    assert.equal(path.basename(second.path), "test.db.bak-2026-11-13-0930-2");
    assert.deepEqual(second.removed.map(file => path.basename(file)), ["test.db.bak-2026-01-02-0900"]);

    assert.deepEqual(fs.readdirSync(folder).sort(), [
      "test.db", "test.db.bak-2026-01-03-0900", "test.db.bak-2026-11-07", "test.db.bak-2026-11-13-0930", "test.db.bak-2026-11-13-0930-2",
    ]);
    assert.equal(fs.readFileSync(manual, "utf8"), "made by hand");

    process.env.DATABASE_URL = `file:${path.join(folder, "copy", "test.db")}`;
    fs.mkdirSync(path.join(folder, "copy"));
    fs.copyFileSync(first.path, path.join(folder, "copy", "test.db"));
    const copy = createPrismaClient();
    process.env.DATABASE_URL = saved;
    try {
      assert.equal(await copy.user.count({ where: { username: "backup_test_user" } }), 1);
    } finally {
      await copy.$disconnect();
    }
  } finally {
    process.env.DATABASE_URL = saved;
    await client.$disconnect();
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
