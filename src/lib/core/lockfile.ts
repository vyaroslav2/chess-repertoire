import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const LOCKFILE_PATH = path.resolve(process.cwd(), 'generator.lock');

export type LockHandle = { release(): void };

export function acquireLock(lockPath: string = LOCKFILE_PATH): LockHandle {
    const token = randomUUID();
    let descriptor: number;
    try { descriptor = fs.openSync(lockPath, 'wx'); }
    catch (error: any) {
        if (error?.code === 'EEXIST') throw new Error('Lockfile exists');
        throw error;
    }
    try { fs.writeFileSync(descriptor, token, { encoding: 'utf-8' }); }
    finally { fs.closeSync(descriptor); }
    let released = false;
    return {
        release() {
            if (released) return;
            const owner = fs.readFileSync(lockPath, 'utf-8');
            if (owner !== token) throw new Error('Cannot release a lock owned by another process');
            fs.unlinkSync(lockPath);
            released = true;
        }
    };
}

/** @deprecated Use acquireLock() and release its returned handle. */
export function createLockfile() { return acquireLock(); }

export function isLocked(): boolean {
    return fs.existsSync(LOCKFILE_PATH);
}
