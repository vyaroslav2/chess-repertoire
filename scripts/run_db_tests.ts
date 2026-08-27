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
    const args = process.argv.slice(2);
    if (args.length > 0) {
        for (const arg of args) {
            execSync(`npx tsx --test ${arg}`, { env: testEnv, stdio: 'inherit' });
        }
    } else {
        execSync('npx tsx --test src/lib/core/db.test.ts', { env: testEnv, stdio: 'inherit' });
        execSync('npx tsx --test src/lib/core/human-cache.test.ts', { env: testEnv, stdio: 'inherit' });
        execSync('npx tsx --test src/lib/api/retry.test.ts', { env: testEnv, stdio: 'inherit' });
        execSync('npx tsx --test src/lib/core/remote-engine-cache.test.ts', { env: testEnv, stdio: 'inherit' });
        execSync('npx tsx --test src/lib/core/local-engine.test.ts', { env: testEnv, stdio: 'inherit' });
        execSync('npx tsx --test src/lib/core/evaluator.slice12.test.ts', { env: testEnv, stdio: 'inherit' });
    }

    console.log(`[TEST SETUP] DB tests complete.`);
}

main();
