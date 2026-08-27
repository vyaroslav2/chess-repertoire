import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { acquireLock } from "../src/lib/core/lockfile";

test("start_tree_generator handles existing lockfile gracefully without truncating log", () => {
  const lockPath = path.resolve(process.cwd(), 'generator.lock');
  const dummyLogPath = path.join(os.tmpdir(), `dummy-log-${Date.now()}.md`);
  
  // Setup: Pre-populate the dummy log
  const originalLogContent = "This is the original log content. Do not truncate me.";
  fs.writeFileSync(dummyLogPath, originalLogContent);
  
  let owner: any = null;
  try {
    owner = acquireLock(lockPath);
  } catch (e) {
    // If the lock already exists before the test, we'll just skip the acquisition.
  }

  try {
    const res = spawnSync("npx", ["tsx", "scripts/start_tree_generator.ts"], {
      encoding: "utf-8",
      cwd: process.cwd(),
      shell: process.platform === 'win32',
      env: { ...process.env, TREE_GEN_LOG_PATH: dummyLogPath }
    });

    assert.equal(res.status, 1, "Script should exit gracefully with 1 when lockfile exists");
    assert.match(res.stderr, /Tree Generator is already running/, "Script should log friendly message");
    
    // Check that the file was untouched
    const currentLogContent = fs.readFileSync(dummyLogPath, "utf-8");
    assert.equal(currentLogContent, originalLogContent, "Active log content should remain completely untouched by rejected generator");
    
  } finally {
    if (owner) {
      owner.release();
    }
    if (fs.existsSync(dummyLogPath)) {
      fs.unlinkSync(dummyLogPath);
    }
  }
});

test("start_tree_generator releases lock even if log manipulation throws", () => {
  const lockPath = path.resolve(process.cwd(), 'generator.lock');
  const dummyLogPath = os.tmpdir(); // A directory will cause fs operations to throw EISDIR

  // Ensure no lock exists prior to test
  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }

  const res = spawnSync("npx", ["tsx", "scripts/start_tree_generator.ts"], {
    encoding: "utf-8",
    cwd: process.cwd(),
    shell: process.platform === 'win32',
    env: { ...process.env, TREE_GEN_LOG_PATH: dummyLogPath }
  });

  // Because the log path is a directory, fs.writeFileSync and fs.appendFileSync will fail.
  // We want to ensure that despite the failure, the lock is still cleanly released.
  assert.equal(fs.existsSync(lockPath), false, "Lock should be released despite fs errors in finally block");
});
