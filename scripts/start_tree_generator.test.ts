import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { UserRequestedStopError } from "../src/lib/api/retry";
import { acquireLock, LOCKFILE_PATH, type LockHandle } from "../src/lib/core/lockfile";
import {
  dequeueGeneratorQueueItem,
  enqueueCanonicalContinuation,
  type GeneratorQueueItem,
  type PendingCanonicalContinuations
} from "../src/lib/core/generator";
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

test("canonical continuation worklist is LIFO", () => {
  const queue: GeneratorQueueItem[] = [];
  const pending: PendingCanonicalContinuations = new Map();
  const first = { nodeId: "first", fen: "8/8/8/8/8/8/8/8 w - - 0 1", currentMoveNumber: 1, cumProb: 0.1, history: [] };
  const second = { nodeId: "second", fen: "8/8/8/8/8/8/8/8 w - - 0 1", currentMoveNumber: 1, cumProb: 0.2, history: [] };

  enqueueCanonicalContinuation({ queue, pendingByResponseSource: pending, responseSourceNodeId: "response-1", item: first });
  enqueueCanonicalContinuation({ queue, pendingByResponseSource: pending, responseSourceNodeId: "response-2", item: second });

  assert.equal(dequeueGeneratorQueueItem(queue, pending), second);
  assert.equal(dequeueGeneratorQueueItem(queue, pending), first);
  assert.equal(pending.size, 0);
});

test("S1.03: default log is project-relative from another cwd and creates new-docs/logs", async () => {
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
    const logDirectory = path.join(fixtureRoot, "new-docs", "logs");
    const generatedLogs = fs.readdirSync(logDirectory).filter(name => /^treegen-.*\.md$/.test(name));
    assert.equal(generatedLogs.length, 1);
    const expected = path.join(logDirectory, generatedLogs[0]);
    assert.match(fs.readFileSync(expected, "utf8"), /\[FINISHED\]/);
    assert.equal(fs.existsSync(path.join(otherCwd, "new-docs", "logs")), false);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(otherCwd, { recursive: true, force: true });
  }
});

test("S1.03: each run writes its own log and earlier run logs are never touched", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "treegen-keep-"));
  const logDirectory = path.join(fixtureRoot, "new-docs", "logs");
  fs.mkdirSync(logDirectory, { recursive: true });
  const earlier = [
    "treegen-2026-08-01T100000Z.md",
    "treegen-2026-08-02T100000Z.md",
    "treegen-2026-08-03T100000Z.md"
  ];
  for (const name of earlier) fs.writeFileSync(path.join(logDirectory, name), `earlier ${name}`);
  try {
    await runTreeGenerator({
      environment: {},
      projectRoot: fixtureRoot,
      acquire: mockLock,
      generate: async () => undefined,
      disconnect: async () => undefined,
      now: () => new Date("2026-08-30T11:15:23.456Z")
    });
    for (const name of earlier) {
      assert.equal(fs.readFileSync(path.join(logDirectory, name), "utf8"), `earlier ${name}`);
    }
    assert.equal(fs.existsSync(path.join(logDirectory, "treegen-2026-08-30T111523Z.md")), true);
    assert.equal(fs.readdirSync(logDirectory).length, earlier.length + 1);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
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
    assert.equal(fs.existsSync(path.join(unrelatedRoot, "new-docs", "logs")), false);
  } finally {
    if (fs.existsSync(override)) fs.unlinkSync(override);
    fs.rmSync(unrelatedRoot, { recursive: true, force: true });
  }
});

test("S1.02: a refused lock stops with the lock message alone in the console and never touches the log", () => {
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
    assert.match(res.stderr, /lockfile-never-remove-by-yourself-unless-stale/);
    assert.doesNotMatch(res.stderr, /Tree generation failed/);
    assert.doesNotMatch(res.stderr, /^\s+at /m);
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

test("S0.03 S0.07: each Ctrl+C sets the flag and prints to the raw console, never the run log", async () => {
  const logPath = tempLog("sigint");
  const printed: string[] = [];
  const listenersBefore = process.listenerCount("SIGINT");
  const consoleLog = console.log;
  console.log = (...args: unknown[]) => { printed.push(args.join(" ")); };
  const message = "Stop requested; generation will stop after the current position.";
  try {
    await runTreeGenerator({
      logPath,
      acquire: mockLock,
      generate: async (shouldStop) => {
        assert.equal(shouldStop(), false);
        process.emit("SIGINT", "SIGINT");
        assert.equal(shouldStop(), true);
        process.emit("SIGINT", "SIGINT");
        assert.equal(shouldStop(), true);
      },
      disconnect: async () => undefined
    });
  } finally {
    console.log = consoleLog;
  }
  assert.deepStrictEqual(printed.filter(line => line === message), [message, message]);
  assert.doesNotMatch(fs.readFileSync(logPath, "utf8"), /Stop requested/);
  assert.equal(process.listenerCount("SIGINT"), listenersBefore);
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
