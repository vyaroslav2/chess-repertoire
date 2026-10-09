import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mock, test } from "node:test";
import { acquireLock, LOCKFILE_PATH, LockAcquisitionError, LockReleaseError, releaseLock, type LockHandle } from "./lockfile";
import { defaultConfig } from "./config";

function temporaryLock(label: string): string {
  return path.join(os.tmpdir(), `chess-repertoire-${label}-${process.pid}-${Date.now()}.lock`);
}

const DEAD_PID = 2147483647;

function writeLock(lockPath: string, script: string, pid: number, startedAt = "2026-08-01T10:00:00.000Z"): void {
  fs.writeFileSync(lockPath, `${JSON.stringify({ script, pid, startedAt }, null, 2)}\n`);
}

function errnoError(code: string, message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}

function lockError(message: string): { name: string; message: string } {
  return { name: "LockAcquisitionError", message };
}

function captureLog(): { lines: string[]; restore(): void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };
  return { lines, restore() { console.log = original; } };
}

test("LF.01 LF.11 atomic lock acquisition records script, pid and UTC time", () => {
  const lockPath = temporaryLock("create");
  const owner = acquireLock("treegen", lockPath);
  try {
    const stored = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    assert.equal(stored.script, "treegen");
    assert.equal(stored.pid, process.pid);
    assert.match(stored.startedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  } finally {
    owner.release();
  }
});

test("LF.02 create failing for a reason other than EEXIST stops with the OS reason", () => {
  const lockPath = path.join(os.tmpdir(), `chess-repertoire-missing-${process.pid}-${Date.now()}`, "lock");
  assert.throws(
    () => acquireLock("treegen", lockPath),
    error => {
      assert.ok(error instanceof LockAcquisitionError);
      assert.match(error.message, /^Unable to create lockfile: ENOENT: .*\.$/);
      return true;
    }
  );
});

test("LF.03 write failure removes the empty lockfile, then stops", () => {
  const lockPath = temporaryLock("write");
  const write = mock.method(fs, "writeFileSync", () => { throw errnoError("ENOSPC", "ENOSPC: no space left on device, write"); });
  try {
    assert.throws(
      () => acquireLock("treegen", lockPath),
      lockError("Failed to write to newly created lockfile: ENOSPC: no space left on device, write. Attempting cleanup of the empty lockfile, then exiting.")
    );
  } finally {
    write.mock.restore();
  }
  assert.equal(fs.existsSync(lockPath), false);
});

test("LF.04 a live owner refuses the lock and keeps it", () => {
  const lockPath = temporaryLock("live");
  const owner = acquireLock("treegen", lockPath);
  try {
    assert.throws(
      () => acquireLock("deep-verify", lockPath),
      error => {
        assert.ok(error instanceof LockAcquisitionError);
        assert.equal(error.message, `treegen (process ${process.pid}) has been running since ${owner.owner.startedAt} UTC.`);
        return true;
      }
    );
    assert.equal(fs.existsSync(lockPath), true, "failed acquisition cannot remove a live owner's lock");
  } finally {
    owner.release();
  }
});

test("LF.05 a dead owner's lock is removed with a message, then acquisition retries", () => {
  const lockPath = temporaryLock("dead");
  writeLock(lockPath, "treegen", DEAD_PID);
  const log = captureLog();
  let owner: LockHandle;
  try {
    owner = acquireLock("deep-verify", lockPath);
  } finally {
    log.restore();
  }
  try {
    assert.deepEqual(log.lines, ["Stale lockfile -- owner process no longer running. Removing."]);
    assert.equal(owner.owner.script, "deep-verify");
    assert.equal(JSON.parse(fs.readFileSync(lockPath, "utf8")).script, "deep-verify");
  } finally {
    owner.release();
  }
});

test("LF.05 stale removal stops after lockfileRetryLimit attempts", () => {
  const lockPath = temporaryLock("stale-limit");
  writeLock(lockPath, "treegen", DEAD_PID);
  const unlink = mock.method(fs, "unlinkSync", () => undefined);
  const log = captureLog();
  try {
    assert.throws(
      () => acquireLock("treegen", lockPath),
      lockError(`Unable to remove lockfile after ${defaultConfig.lockfileRetryLimit} attempts.`)
    );
    assert.equal(unlink.mock.callCount(), defaultConfig.lockfileRetryLimit);
    assert.equal(log.lines.length, defaultConfig.lockfileRetryLimit);
  } finally {
    log.restore();
    unlink.mock.restore();
    fs.unlinkSync(lockPath);
  }
});

test("LF.06 a vanishing lockfile retries silently, then stops at lockfileRetryLimit", () => {
  const lockPath = temporaryLock("vanish");
  writeLock(lockPath, "treegen", process.pid);
  const read = mock.method(fs, "readFileSync", () => { throw errnoError("ENOENT", "ENOENT: no such file or directory"); });
  const log = captureLog();
  try {
    assert.throws(
      () => acquireLock("treegen", lockPath),
      lockError(`Unable to acquire lockfile after ${defaultConfig.lockfileRetryLimit} attempts — file kept vanishing during the check. This is not expected. Manual intervention required.`)
    );
    assert.equal(read.mock.callCount(), defaultConfig.lockfileRetryLimit);
    assert.deepEqual(log.lines, []);
  } finally {
    log.restore();
    read.mock.restore();
    fs.unlinkSync(lockPath);
  }
});

test("LF.07 malformed or invalid lock contents are preserved for manual intervention", () => {
  for (const contents of ["not valid lock data", JSON.stringify({ script: "treegen", pid: -1, startedAt: "x" })]) {
    const lockPath = temporaryLock("malformed");
    fs.writeFileSync(lockPath, contents);
    try {
      assert.throws(
        () => acquireLock("treegen", lockPath),
        lockError("Existing lockfile is malformed. Manual intervention required.")
      );
      assert.equal(fs.readFileSync(lockPath, "utf8"), contents);
    } finally {
      fs.unlinkSync(lockPath);
    }
  }
});

test("LF.08 failing to remove a stale lock stops with the OS reason", () => {
  const lockPath = temporaryLock("unlink");
  writeLock(lockPath, "treegen", DEAD_PID);
  const unlink = mock.method(fs, "unlinkSync", () => { throw errnoError("EPERM", "EPERM: operation not permitted, unlink"); });
  const log = captureLog();
  try {
    assert.throws(
      () => acquireLock("treegen", lockPath),
      lockError("Unable to remove stranded lockfile: EPERM: operation not permitted, unlink. Manual intervention required.")
    );
  } finally {
    log.restore();
    unlink.mock.restore();
    fs.unlinkSync(lockPath);
  }
});

test("LF.09 failing to read an existing lock for a reason other than ENOENT stops with the OS reason", () => {
  const lockPath = temporaryLock("read");
  writeLock(lockPath, "treegen", process.pid);
  const read = mock.method(fs, "readFileSync", () => { throw errnoError("EACCES", "EACCES: permission denied, open"); });
  try {
    assert.throws(
      () => acquireLock("treegen", lockPath),
      lockError("Unable to read existing lockfile: EACCES: permission denied, open. Manual intervention required.")
    );
  } finally {
    read.mock.restore();
    fs.unlinkSync(lockPath);
  }
});

test("LF.10 wrong script cannot release another script's lock", () => {
  const lockPath = temporaryLock("ownership");
  const owner = acquireLock("treegen", lockPath);
  try {
    assert.throws(
      () => releaseLock("sweeper", lockPath),
      error => {
        assert.ok(error instanceof LockReleaseError);
        assert.equal(
          error.message,
          "[WARNING] Cannot release lock owned by treegen; expected sweeper. This may mean another script is running concurrently — check for overlapping runs before continuing."
        );
        return true;
      }
    );
    assert.equal(fs.existsSync(lockPath), true);
  } finally {
    owner.release();
  }
});

test("default lock path is repository-relative, not cwd-relative", () => {
  assert.equal(LOCKFILE_PATH, path.resolve(__dirname, "../../..", defaultConfig.lockfileName));
  assert.notEqual(LOCKFILE_PATH, path.resolve(os.tmpdir(), defaultConfig.lockfileName));
});

test("generation-config lockfileName names the default lockfile", () => {
  assert.equal(path.basename(LOCKFILE_PATH), "lockfile-never-remove-by-yourself-unless-stale");
});
