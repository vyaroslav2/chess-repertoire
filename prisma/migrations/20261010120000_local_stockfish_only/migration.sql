-- DB.13, DB.14: Black's move loses the Masters and Elite fields and deepVerified.
-- Black plays local Stockfish 19's top move (EW), so there is no human evidence to keep.
-- Old Lichess, ChessDB, Masters and Elite cache rows are left in place; nothing reads them.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RepertoireMove" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repertoireId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT,
    "san" TEXT NOT NULL,
    "uci" TEXT,
    "playerTurn" TEXT NOT NULL,
    "moveProb" REAL,
    "stopReason" TEXT,
    "cp" REAL,
    "mate" INTEGER,
    "source" TEXT,
    "selectionMethod" TEXT,
    "moveOrigin" TEXT,
    "engineRank" INTEGER,
    CONSTRAINT "RepertoireMove_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "RepertoireNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepertoireMove_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "RepertoireNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepertoireMove_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RepertoireMove" ("cp", "engineRank", "fromNodeId", "id", "mate", "moveOrigin", "moveProb", "playerTurn", "repertoireId", "san", "selectionMethod", "source", "stopReason", "toNodeId", "uci") SELECT "cp", "engineRank", "fromNodeId", "id", "mate", "moveOrigin", "moveProb", "playerTurn", "repertoireId", "san", "selectionMethod", "source", "stopReason", "toNodeId", "uci" FROM "RepertoireMove";
DROP TABLE "RepertoireMove";
ALTER TABLE "new_RepertoireMove" RENAME TO "RepertoireMove";
CREATE UNIQUE INDEX "RepertoireMove_fromNodeId_uci_key" ON "RepertoireMove"("fromNodeId", "uci");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

