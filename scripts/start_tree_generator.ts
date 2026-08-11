import { generateRepertoire } from "../src/lib/core/generator";
import { prisma } from "../src/lib/db/operations";
import fs from "fs";
import path from "path";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

async function main() {
    const obsidianPath = "C:\\Users\\vyaro\\OneDrive\\Рабочий стол\\NewObsidian\\TreeGenLog.md";
    
    // Clear and initialize log file
    fs.writeFileSync(obsidianPath, "# Tree Generation Log\n\n```text\n");
    
    const originalLog = console.log;
    console.log = function(...args) {
        originalLog.apply(console, args);
        fs.appendFileSync(obsidianPath, args.join(" ") + "\n");
    };

    try {
        await generateRepertoire(START_FEN, 4);
    } catch (e) {
        console.error("Fatal Error:", e);
    } finally {
        fs.appendFileSync(obsidianPath, "```\n");
        await prisma.$disconnect();
    }
}

main();
