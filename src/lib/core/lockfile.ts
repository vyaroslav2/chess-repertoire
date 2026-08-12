import * as fs from 'fs';
import * as path from 'path';

const LOCKFILE_PATH = path.resolve(process.cwd(), 'generator.lock');

export function createLockfile() {
    if (fs.existsSync(LOCKFILE_PATH)) {
        throw new Error('Lockfile exists');
    }
    fs.writeFileSync(LOCKFILE_PATH, 'locked', { encoding: 'utf-8' });
}

export function removeLockfile() {
    if (fs.existsSync(LOCKFILE_PATH)) {
        fs.unlinkSync(LOCKFILE_PATH);
    }
}

export function isLocked(): boolean {
    return fs.existsSync(LOCKFILE_PATH);
}
