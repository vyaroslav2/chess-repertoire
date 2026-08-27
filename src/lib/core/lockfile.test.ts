import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { acquireLock, LOCKFILE_PATH, releaseLock } from "./lockfile";

function temporaryLock(label: string): string {
  return path.join(os.tmpdir(), `chess-repertoire-${label}-${process.pid}-${Date.now()}.lock`);
}

test("atomic lock acquisition records a readable owner and refuses a live owner", () => {
  const lockPath = temporaryLock("live");
  const owner = acquireLock("treegen", lockPath);
  try {
    const stored = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    assert.equal(stored.script, "treegen");
    assert.equal(stored.pid, process.pid);
    assert.ok(!Number.isNaN(Date.parse(stored.startedAt)));
    assert.throws(
      () => acquireLock("deep-verify", lockPath),
      error => {
        assert.match(String(error), /treegen/);
        assert.match(String(error), new RegExp(String(process.pid)));
        assert.match(String(error), /has been running since/);
        assert.match(String(error), new RegExp(lockPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        return true;
      }
    );
    assert.equal(fs.existsSync(lockPath), true, "failed acquisition cannot remove a live owner's lock");
  } finally {
    owner.release();
  }
});

test("a clearly dead owner is removed and atomic acquisition retries", () => {
  const lockPath = temporaryLock("dead");
  fs.writeFileSync(lockPath, `${JSON.stringify({ script: "treegen", pid: 2147483647, startedAt: "2026-08-01T10:00:00.000Z" }, null, 2)}\n`);
  const owner = acquireLock("deep-verify", lockPath);
  try {
    assert.equal(owner.owner.script, "deep-verify");
    assert.equal(JSON.parse(fs.readFileSync(lockPath, "utf8")).script, "deep-verify");
  } finally {
    owner.release();
  }
});

test("wrong script cannot release another script's lock", () => {
  const lockPath = temporaryLock("ownership");
  const owner = acquireLock("treegen", lockPath);
  try {
    assert.throws(() => releaseLock("sweeper", lockPath), /owned by treegen/);
    assert.equal(fs.existsSync(lockPath), true);
  } finally {
    owner.release();
  }
});

test("malformed existing lock is preserved for manual intervention", () => {
  const lockPath = temporaryLock("malformed");
  fs.writeFileSync(lockPath, "not valid lock data");
  try {
    assert.throws(() => acquireLock("treegen", lockPath), /malformed.*Lock file:/i);
    assert.equal(fs.readFileSync(lockPath, "utf8"), "not valid lock data");
  } finally {
    fs.unlinkSync(lockPath);
  }
});

test("default lock path is repository-relative, not cwd-relative", () => {
  assert.equal(LOCKFILE_PATH, path.resolve(__dirname, "../../..", "generator.lock"));
  assert.notEqual(LOCKFILE_PATH, path.resolve(os.tmpdir(), "generator.lock"));
});
