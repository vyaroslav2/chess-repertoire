import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { acquireLock } from "./lockfile";

test("atomic lock acquisition has one owner and releases safely", () => {
  const lockPath = path.join(os.tmpdir(), `chess-repertoire-${process.pid}-${Date.now()}.lock`);
  const owner = acquireLock(lockPath);
  assert.equal(fs.existsSync(lockPath), true);
  assert.throws(() => acquireLock(lockPath), /Lockfile exists/);
  assert.equal(fs.existsSync(lockPath), true, "failed acquisition cannot remove owner's lock");
  owner.release();
  assert.equal(fs.existsSync(lockPath), false);
  const nextOwner = acquireLock(lockPath);
  nextOwner.release();
});

test("a handle refuses to remove a replaced lock", () => {
  const lockPath = path.join(os.tmpdir(), `chess-repertoire-owner-${process.pid}-${Date.now()}.lock`);
  const owner = acquireLock(lockPath);
  fs.writeFileSync(lockPath, "different-owner");
  assert.throws(() => owner.release(), /another process/);
  assert.equal(fs.existsSync(lockPath), true);
  fs.unlinkSync(lockPath);
});
