PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RepertoireMove" (
    "id" TEXT NOT NULL PRIMARY KEY, "repertoireId" TEXT NOT NULL, "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL, "san" TEXT NOT NULL, "uci" TEXT, "playerTurn" TEXT NOT NULL,
    "prob" REAL, "trueProbability" REAL, "weightedCount" REAL, "cp" REAL, "mate" INTEGER,
    "source" TEXT, "selectionMethod" TEXT, "moveOrigin" TEXT,
    "deepVerified" BOOLEAN NOT NULL DEFAULT false, "localEvaluationProfile" TEXT,
    CONSTRAINT "RepertoireMove_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "RepertoireNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepertoireMove_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "RepertoireNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepertoireMove_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RepertoireMove" ("id", "repertoireId", "fromNodeId", "toNodeId", "san", "playerTurn", "prob", "trueProbability", "weightedCount")
SELECT "id", "repertoireId", "fromNodeId", "toNodeId", "san", "playerTurn", "prob", "trueProbability", "weightedCount" FROM "RepertoireMove";
DROP TABLE "RepertoireMove";
ALTER TABLE "new_RepertoireMove" RENAME TO "RepertoireMove";
CREATE UNIQUE INDEX "RepertoireMove_fromNodeId_uci_key" ON "RepertoireMove"("fromNodeId", "uci");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
