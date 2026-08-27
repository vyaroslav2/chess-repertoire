import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { UserRequestedStopError } from "../src/lib/api/retry";
import { acquireLock, LOCKFILE_PATH, type LockHandle } from "../src/lib/core/lockfile";
import { runTreeGenerator } from "./start_tree_generator";

function tempLog(label: string): string {
  return path.join(os.tmpdir(), `treegen-${label}-${process.pid}-${Date.now()}.md`);
}

function mockLock(): LockHandle {
  return {
    path: "mock.lock",
    owner: { script: "treegen", pid: process.pid, startedAt: new Date().toISOString() },
    release() {}
  };
}

test("default log is project-relative from another cwd and creates docs/logs", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "treegen-project-"));
  const otherCwd = fs.mkdtempSync(path.join(os.tmpdir(), "treegen-cwd-"));
  const originalCwd = process.cwd();
  try {
    process.chdir(otherCwd);
    await runTreeGenerator({
      environment: {},
      projectRoot: fixtureRoot,
      acquire: mockLock,
      generate: async () => undefined,
      disconnect: async () => undefined
    });
    const expected = path.join(fixtureRoot, "docs", "logs", "TreeGenLog.md");
    assert.equal(fs.existsSync(expected), true);
    assert.match(fs.readFileSync(expected, "utf8"), /\[FINISHED\]/);
    assert.equal(fs.existsSync(path.join(otherCwd, "docs", "logs", "TreeGenLog.md")), false);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(otherCwd, { recursive: true, force: true });
  }
});

test("TREE_GEN_LOG_PATH override wins exactly", async () => {
  const override = tempLog("override");
  const unrelatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "treegen-override-root-"));
  try {
    await runTreeGenerator({
      environment: { TREE_GEN_LOG_PATH: override },
      projectRoot: unrelatedRoot,
      acquire: mockLock,
      generate: async () => undefined,
      disconnect: async () => undefined
    });
    assert.equal(fs.existsSync(override), true);
    assert.equal(fs.existsSync(path.join(unrelatedRoot, "docs", "logs", "TreeGenLog.md")), false);
  } finally {
    if (fs.existsSync(override)) fs.unlinkSync(override);
    fs.rmSync(unrelatedRoot, { recursive: true, force: true });
  }
});

test("start_tree_generator refuses a live lock with owner/path details without truncating log", () => {
  const dummyLogPath = tempLog("refusal");
  const originalLogContent = "This is the original log content. Do not truncate me.";
  fs.writeFileSync(dummyLogPath, originalLogContent);
  const owner = acquireLock("deep-verify", LOCKFILE_PATH);

  try {
    const res = spawnSync("npx", ["tsx", "start_tree_generator.ts"], {
      encoding: "utf8",
      cwd: path.resolve(process.cwd(), "scripts"),
      shell: process.platform === "win32",
      env: { ...process.env, TREE_GEN_LOG_PATH: dummyLogPath }
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /deep-verify/);
    assert.match(res.stderr, new RegExp(String(process.pid)));
    assert.match(res.stderr, /generator\.lock/);
    assert.equal(fs.readFileSync(dummyLogPath, "utf8"), originalLogContent);
  } finally {
    owner.release();
    fs.unlinkSync(dummyLogPath);
  }
});

test("user-requested stop is logged as stopped, disconnects, and does not strand the lock", async () => {
  const lockPath = path.join(os.tmpdir(), `treegen-stop-${process.pid}-${Date.now()}.lock`);
  const logPath = tempLog("stop");
  const events: string[] = [];
  const owner = acquireLock("treegen", lockPath);
  const trackedLock: LockHandle = {
    ...owner,
    release() {
      events.push("release");
      owner.release();
    }
  };

  await assert.rejects(
    runTreeGenerator({
      logPath,
      acquire: () => trackedLock,
      generate: async () => { throw new UserRequestedStopError(); },
      disconnect: async () => { events.push("disconnect"); }
    }),
    UserRequestedStopError
  );

  const log = fs.readFileSync(logPath, "utf8");
  assert.match(log, /\[STOPPED\].*user's request/i);
  assert.doesNotMatch(log, /finished successfully/i);
  assert.deepStrictEqual(events, ["disconnect", "release"]);
  assert.equal(fs.existsSync(lockPath), false);
  fs.unlinkSync(logPath);
});

test("successful cleanup finalises the log, disconnects, then releases the lock", async () => {
  const logPath = tempLog("success");
  const events: string[] = [];
  const lock: LockHandle = {
    path: "mock.lock",
    owner: { script: "treegen", pid: process.pid, startedAt: new Date().toISOString() },
    release() {
      assert.match(fs.readFileSync(logPath, "utf8"), /\[FINISHED\].*successfully/);
      events.push("release");
    }
  };
  await runTreeGenerator({
    logPath,
    acquire: () => lock,
    generate: async () => {
      console.log("generated");
      console.error("visible test error");
    },
    disconnect: async () => { events.push("disconnect"); },
    now: (() => {
      const values = [new Date("2026-08-27T10:00:00.000Z"), new Date("2026-08-27T10:00:02.500Z")];
      return () => values.shift()!;
    })()
  });
  const log = fs.readFileSync(logPath, "utf8");
  assert.match(log, /Finished: 2026-08-27T10:00:02\.500Z/);
  assert.match(log, /Elapsed: 2500ms/);
  assert.match(log, /\[ERROR\] visible test error/);
  assert.deepStrictEqual(events, ["disconnect", "release"]);
  fs.unlinkSync(logPath);
});

test("ordinary generator failure receives a failed ending with its reason", async () => {
  const logPath = tempLog("failure");
  const failure = new Error("required Explorer data unavailable");
  const lock: LockHandle = {
    path: "mock.lock",
    owner: { script: "treegen", pid: process.pid, startedAt: new Date().toISOString() },
    release() {}
  };
  await assert.rejects(runTreeGenerator({
    logPath,
    acquire: () => lock,
    generate: async () => { throw failure; },
    disconnect: async () => undefined
  }), error => error === failure);
  const log = fs.readFileSync(logPath, "utf8");
  assert.match(log, /\[FAILED\] required Explorer data unavailable/);
  assert.doesNotMatch(log, /finished successfully/i);
  fs.unlinkSync(logPath);
});

test("log finalisation failure still disconnects and releases without hiding the run error", async () => {
  const logPath = tempLog("unwritable");
  const events: string[] = [];
  const lock: LockHandle = {
    path: "mock.lock",
    owner: { script: "treegen", pid: process.pid, startedAt: new Date().toISOString() },
    release() { events.push("release"); }
  };
  const original = new Error("generation failed first");
  await assert.rejects(
    runTreeGenerator({
      logPath,
      acquire: () => lock,
      generate: async () => {
        fs.unlinkSync(logPath);
        throw original;
      },
      disconnect: async () => { events.push("disconnect"); }
    }),
    error => error === original
  );
  assert.deepStrictEqual(events, ["disconnect", "release"]);
});
