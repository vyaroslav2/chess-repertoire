import * as fs from "fs";
import * as path from "path";
import { defaultConfig } from "./config";

export const LOCKFILE_PATH = path.resolve(__dirname, "../../..", defaultConfig.lockfileName);

export type LockData = {
  script: string;
  pid: number;
  startedAt: string;
};

export type LockHandle = {
  readonly path: string;
  readonly owner: LockData;
  release(): void;
};

export class LockAcquisitionError extends Error {
  constructor(message: string, readonly lockPath: string, readonly owner?: LockData) {
    super(message);
    this.name = "LockAcquisitionError";
  }
}

export class LockReleaseError extends Error {
  constructor(message: string, readonly lockPath: string, readonly owner: LockData) {
    super(message);
    this.name = "LockReleaseError";
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// LF.07
function parseLock(raw: string, lockPath: string): LockData {
  const malformed = () => new LockAcquisitionError("Existing lockfile is malformed. Manual intervention required.", lockPath);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw malformed();
  }
  if (!value || typeof value !== "object") throw malformed();
  const record = value as Record<string, unknown>;
  if (typeof record.script !== "string" || !record.script ||
      typeof record.pid !== "number" || !Number.isInteger(record.pid) || record.pid <= 0 ||
      typeof record.startedAt !== "string" || !record.startedAt || Number.isNaN(Date.parse(record.startedAt))) {
    throw malformed();
  }
  return { script: record.script, pid: record.pid, startedAt: record.startedAt };
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    return true;
  }
}

// LF.04
function refusal(owner: LockData, lockPath: string): LockAcquisitionError {
  return new LockAcquisitionError(
    `${owner.script} (process ${owner.pid}) has been running since ${owner.startedAt} UTC.`,
    lockPath,
    owner
  );
}

// LF.10
export function releaseLock(expectedScript: string, lockPath: string = LOCKFILE_PATH): void {
  let owner: LockData;
  try {
    owner = parseLock(fs.readFileSync(lockPath, "utf8"), lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (owner.script !== expectedScript) {
    throw new LockReleaseError(
      `[WARNING] Cannot release lock owned by ${owner.script}; expected ${expectedScript}. This may mean another script is running concurrently — check for overlapping runs before continuing.`,
      lockPath,
      owner
    );
  }
  fs.unlinkSync(lockPath);
}

export function acquireLock(script: string, lockPath: string = LOCKFILE_PATH): LockHandle {
  if (!script.trim()) throw new Error("Lock owner script name is required");

  const retryLimit = defaultConfig.lockfileRetryLimit;
  let staleRemovals = 0;
  let vanishings = 0;

  for (;;) {
    // LF.01: [time] is always UTC.
    const owner: LockData = { script, pid: process.pid, startedAt: new Date().toISOString() };
    let descriptor: number;
    try {
      // LF.11: exclusive create; never opens an existing file.
      descriptor = fs.openSync(lockPath, "wx");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        // LF.02
        throw new LockAcquisitionError(`Unable to create lockfile: ${reason(error)}.`, lockPath);
      }

      let existing: LockData;
      try {
        existing = parseLock(fs.readFileSync(lockPath, "utf8"), lockPath);
      } catch (readError) {
        if (readError instanceof LockAcquisitionError) throw readError;
        if ((readError as NodeJS.ErrnoException).code === "ENOENT") {
          // LF.06
          vanishings += 1;
          if (vanishings >= retryLimit) {
            throw new LockAcquisitionError(
              `Unable to acquire lockfile after ${retryLimit} attempts — file kept vanishing during the check. This is not expected. Manual intervention required.`,
              lockPath
            );
          }
          continue;
        }
        // LF.09
        throw new LockAcquisitionError(`Unable to read existing lockfile: ${reason(readError)}. Manual intervention required.`, lockPath);
      }
      if (processIsAlive(existing.pid)) throw refusal(existing, lockPath);

      // LF.05
      if (staleRemovals >= retryLimit) {
        throw new LockAcquisitionError(`Unable to remove lockfile after ${retryLimit} attempts.`, lockPath, existing);
      }
      console.log("Stale lockfile -- owner process no longer running. Removing.");
      staleRemovals += 1;
      try {
        fs.unlinkSync(lockPath);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") {
          // LF.08
          throw new LockAcquisitionError(
            `Unable to remove stranded lockfile: ${reason(unlinkError)}. Manual intervention required.`,
            lockPath,
            existing
          );
        }
      }
      continue;
    }

    let writeError: unknown = null;
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(owner, null, 2)}\n`, { encoding: "utf8" });
    } catch (error) {
      writeError = error;
    } finally {
      fs.closeSync(descriptor);
    }
    if (writeError) {
      // LF.03: clean up the empty file, then stop.
      try { fs.unlinkSync(lockPath); } catch { /* best effort: write failure remains primary */ }
      throw new LockAcquisitionError(
        `Failed to write to newly created lockfile: ${reason(writeError)}. Attempting cleanup of the empty lockfile, then exiting.`,
        lockPath
      );
    }

    let released = false;
    return {
      path: lockPath,
      owner,
      release() {
        if (released) return;
        releaseLock(script, lockPath);
        released = true;
      }
    };
  }
}

export function isLocked(): boolean {
  return fs.existsSync(LOCKFILE_PATH);
}
