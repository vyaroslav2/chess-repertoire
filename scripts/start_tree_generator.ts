import { generateRepertoire } from "../src/lib/core/generator";
import { prisma } from "../src/lib/db/operations";
import { acquireLock, type LockHandle } from "../src/lib/core/lockfile";
import fs from "fs";
import path from "path";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

async function main() {
    const obsidianPath = process.env.TREE_GEN_LOG_PATH || "C:\\\\\\\\Users\\\\\\\\vyaro\\\\\\\\OneDrive\\\\\\\\Рабочий стол\\\\\\\\NewObsidian\\\\\\\\TreeGenLog.md";
    
    let lock: LockHandle | null = null;
    try {
        try {
            lock = acquireLock();
        } catch (e: any) {
            if (e.message === 'Lockfile exists') {
                console.error("Tree Generator is already running (lockfile exists).");
                process.exitCode = 1;
                return;
            }
            throw e; // Do not swallow real filesystem/acquisition errors
        }

        // Lock successfully acquired. Proceed with side effects.
        fs.writeFileSync(obsidianPath, "# Tree Generation Log\n\n```text\n");
        
        const originalLog = console.log;
        console.log = function(...args) {
            originalLog.apply(console, args);
            fs.appendFileSync(obsidianPath, args.join(" ") + "\n");
        };

        await generateRepertoire(START_FEN, 3);
    } catch (e) {
        console.error("Fatal Error:", e);
    } finally {
        if (lock) {
            try {
                fs.appendFileSync(obsidianPath, "```\n");
            } finally {
                lock.release();
            }
        }
        await prisma.$disconnect();
    }
}

main().catch(e => {
    console.error("Top-level error:", e);
    process.exitCode = 1;
});
