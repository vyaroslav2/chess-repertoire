import * as fs from "fs";
import * as path from "path";

export const LOCKFILE_PATH = path.resolve(__dirname, "../../..", "generator.lock");

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

function parseLock(raw: string, lockPath: string): LockData {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LockAcquisitionError(`Existing lockfile is malformed. Manual intervention required. Lock file: ${lockPath}`, lockPath);
  }
  if (!value || typeof value !== "object") {
    throw new LockAcquisitionError(`Existing lockfile is malformed. Manual intervention required. Lock file: ${lockPath}`, lockPath);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.script !== "string" || !record.script ||
      typeof record.pid !== "number" || !Number.isInteger(record.pid) || record.pid <= 0 ||
      typeof record.startedAt !== "string" || !record.startedAt || Number.isNaN(Date.parse(record.startedAt))) {
    throw new LockAcquisitionError(`Existing lockfile has invalid owner data. Manual intervention required. Lock file: ${lockPath}`, lockPath);
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

function refusal(owner: LockData, lockPath: string): LockAcquisitionError {
  return new LockAcquisitionError(
    `${owner.script} (process ${owner.pid}) has been running since ${owner.startedAt}. Lock file: ${lockPath}`,
    lockPath,
    owner
  );
}

export function releaseLock(expectedScript: string, lockPath: string = LOCKFILE_PATH): void {
  let owner: LockData;
  try {
    owner = parseLock(fs.readFileSync(lockPath, "utf8"), lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (owner.script !== expectedScript) {
    throw new Error(`Cannot release lock owned by ${owner.script}; expected ${expectedScript}. Lock file: ${lockPath}`);
  }
  fs.unlinkSync(lockPath);
}

export function acquireLock(script: string, lockPath: string = LOCKFILE_PATH): LockHandle {
  if (!script.trim()) throw new Error("Lock owner script name is required");

  for (;;) {
    const owner: LockData = { script, pid: process.pid, startedAt: new Date().toISOString() };
    let descriptor: number;
    try {
      descriptor = fs.openSync(lockPath, "wx");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw new LockAcquisitionError(`Unable to create lockfile: ${(error as Error).message}. Lock file: ${lockPath}`, lockPath);
      }

      let existing: LockData;
      try {
        existing = parseLock(fs.readFileSync(lockPath, "utf8"), lockPath);
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw readError;
      }
      if (processIsAlive(existing.pid)) throw refusal(existing, lockPath);
      try {
        fs.unlinkSync(lockPath);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") {
          throw new LockAcquisitionError(`Unable to remove stranded lockfile: ${(unlinkError as Error).message}. Lock file: ${lockPath}`, lockPath, existing);
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
      try { fs.unlinkSync(lockPath); } catch { /* best effort: creation failure remains primary */ }
      throw writeError;
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
