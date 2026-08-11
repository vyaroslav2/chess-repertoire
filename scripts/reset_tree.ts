import { prisma } from "../src/lib/db/operations";

async function main() {
    console.log("Wiping algorithm nodes (RepertoireNode, RepertoireMove, RepertoirePositionStat)...");
    await prisma.repertoireNode.deleteMany();
    console.log("Nodes wiped. Cache tables remain intact!");
}

main().finally(() => prisma.$disconnect());
