import { generateRepertoire } from "../src/lib/core/generator";
import { prisma } from "../src/lib/db/operations";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

async function main() {
    try {
        await generateRepertoire(START_FEN, 3);
    } catch (e) {
        console.error("Fatal Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
