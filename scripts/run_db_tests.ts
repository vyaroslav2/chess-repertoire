import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function main() {
    const dbPath = path.resolve(process.cwd(), 'prisma', 'test.db');

    console.log(`[TEST SETUP] Targeting disposable database: ${dbPath}`);

    if (fs.existsSync(dbPath)) {
        console.log(`[TEST SETUP] Deleting existing test.db...`);
        fs.unlinkSync(dbPath);
        console.log(`[TEST SETUP] Successfully deleted old test.db.`);
    } else {
        console.log(`[TEST SETUP] No existing test.db found. Proceeding with fresh creation.`);
    }

    const testEnv = {
        ...process.env,
        DATABASE_URL: `file:${dbPath}`
    };

    console.log(`[TEST SETUP] Running 'prisma db push' to create schema...`);
    execSync('npx prisma db push --accept-data-loss', { env: testEnv, stdio: 'inherit' });

    console.log(`[TEST SETUP] Schema created. Running DB tests...`);
    // No file named: every test file, so a new test can't be left out and run by hand on dev.db.
    const args = process.argv.slice(2);
    const files = args.length > 0 ? args : TEST_ROOTS.flatMap(root => findTestFiles(path.resolve(process.cwd(), root)));
    const failed: string[] = [];
    for (const file of files) {
        try {
            execSync(`npx tsx --test "${file}"`, { env: testEnv, stdio: 'inherit' });
        } catch {
            failed.push(path.relative(process.cwd(), file));
        }
    }

    if (failed.length > 0) {
        console.log(`[TEST SETUP] ${failed.length} of ${files.length} test files failed:\n  ${failed.join('\n  ')}`);
        process.exitCode = 1;
    } else {
        console.log(`[TEST SETUP] All ${files.length} test files passed.`);
    }
}

const TEST_ROOTS = ['src', 'scripts', 'lib'];

function findTestFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : findTestFiles(full);
        return /\.test\.ts$/.test(entry.name) ? [full] : [];
    }).sort();
}

main();
