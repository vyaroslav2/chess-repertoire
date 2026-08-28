-- Move position metadata to its exact surviving repertoire history and add
-- route/evidence fields. Legacy PositionCache metadata is intentionally
-- discarded because it has no trustworthy history provenance.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_PositionCache" (
    "fen" TEXT NOT NULL PRIMARY KEY
);
INSERT INTO "new_PositionCache" ("fen") SELECT "fen" FROM "PositionCache";
DROP TABLE "PositionCache";
ALTER TABLE "new_PositionCache" RENAME TO "PositionCache";

CREATE TABLE "new_RepertoireMove" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repertoireId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "san" TEXT NOT NULL,
    "uci" TEXT,
    "playerTurn" TEXT NOT NULL,
    "prob" REAL,
    "routeProbability" REAL,
    "trueProbability" REAL,
    "routeHistory" TEXT,
    "stopReason" TEXT,
    "humanDataSnapshotId" TEXT,
    "weightedCount" REAL,
    "mastersGames" INTEGER,
    "eliteGames" INTEGER,
    "totalRelevantGames" INTEGER,
    "moveShare" REAL,
    "engineRank" INTEGER,
    "cp" REAL,
    "mate" INTEGER,
    "source" TEXT,
    "selectionMethod" TEXT,
    "moveOrigin" TEXT,
    "deepVerified" BOOLEAN NOT NULL DEFAULT false,
    "localEvaluationProfile" TEXT,
    CONSTRAINT "RepertoireMove_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "RepertoireNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepertoireMove_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "RepertoireNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepertoireMove_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepertoireMove_humanDataSnapshotId_fkey" FOREIGN KEY ("humanDataSnapshotId") REFERENCES "HumanDataSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RepertoireMove" (
    "cp", "deepVerified", "fromNodeId", "id", "localEvaluationProfile", "mate",
    "moveOrigin", "playerTurn", "prob", "routeProbability", "repertoireId", "san",
    "selectionMethod", "source", "toNodeId", "trueProbability", "uci", "weightedCount"
)
SELECT
    "cp", "deepVerified", "fromNodeId", "id", "localEvaluationProfile", "mate",
    "moveOrigin", "playerTurn", "prob", "trueProbability", "repertoireId", "san",
    "selectionMethod", "source", "toNodeId", "trueProbability", "uci", "weightedCount"
FROM "RepertoireMove";
DROP TABLE "RepertoireMove";
ALTER TABLE "new_RepertoireMove" RENAME TO "RepertoireMove";
CREATE UNIQUE INDEX "RepertoireMove_fromNodeId_uci_key" ON "RepertoireMove"("fromNodeId", "uci");

CREATE TABLE "new_RepertoireNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repertoireId" TEXT NOT NULL,
    "fullFen" TEXT NOT NULL,
    "positionKey" TEXT NOT NULL,
    "history" TEXT NOT NULL DEFAULT '',
    "displayPgn" TEXT NOT NULL DEFAULT '',
    "pgn" TEXT NOT NULL DEFAULT '',
    "eco" TEXT,
    "openingName" TEXT,
    "cumulativeProb" REAL NOT NULL DEFAULT 0,
    "isTransposition" BOOLEAN NOT NULL DEFAULT false,
    "humanDataSnapshotId" TEXT,
    "wikibooksChecked" BOOLEAN NOT NULL DEFAULT false,
    "wikiText" TEXT,
    CONSTRAINT "RepertoireNode_positionKey_fkey" FOREIGN KEY ("positionKey") REFERENCES "Position" ("positionKey") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RepertoireNode_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepertoireNode_humanDataSnapshotId_fkey" FOREIGN KEY ("humanDataSnapshotId") REFERENCES "HumanDataSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RepertoireNode" (
    "cumulativeProb", "displayPgn", "fullFen", "history", "id", "pgn",
    "positionKey", "repertoireId", "wikibooksChecked", "wikiText"
)
SELECT
    "cumulativeProb", "pgn", "fullFen", "pgn", "id", "pgn",
    "positionKey", "repertoireId", "wikibooksChecked", "wikiText"
FROM "RepertoireNode";
DROP TABLE "RepertoireNode";
ALTER TABLE "new_RepertoireNode" RENAME TO "RepertoireNode";
CREATE INDEX "RepertoireNode_repertoireId_history_idx" ON "RepertoireNode"("repertoireId", "history");
CREATE INDEX "RepertoireNode_repertoireId_positionKey_idx" ON "RepertoireNode"("repertoireId", "positionKey");

CREATE TABLE "new_RepertoirePositionStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repertoireId" TEXT NOT NULL,
    "positionKey" TEXT,
    "targetUci" TEXT,
    "nodeId" TEXT,
    "targetMoveId" TEXT,
    "explanation" TEXT,
    "tags" TEXT,
    "due" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stability" REAL NOT NULL DEFAULT 0,
    "difficulty" REAL NOT NULL DEFAULT 0,
    "elapsed_days" INTEGER NOT NULL DEFAULT 0,
    "scheduled_days" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" INTEGER NOT NULL DEFAULT 0,
    "last_review" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepertoirePositionStat_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepertoirePositionStat_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "RepertoireNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RepertoirePositionStat_targetMoveId_fkey" FOREIGN KEY ("targetMoveId") REFERENCES "RepertoireMove" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RepertoirePositionStat" (
    "createdAt", "difficulty", "due", "elapsed_days", "explanation", "id",
    "lapses", "last_review", "nodeId", "positionKey", "repertoireId", "reps",
    "scheduled_days", "stability", "state", "tags", "targetMoveId", "targetUci"
)
SELECT
    s."createdAt", s."difficulty", s."due", s."elapsed_days", s."explanation", s."id",
    s."lapses", s."last_review", s."nodeId", n."positionKey", s."repertoireId", s."reps",
    s."scheduled_days", s."stability", s."state", s."tags", s."targetMoveId", m."uci"
FROM "RepertoirePositionStat" s
LEFT JOIN "RepertoireNode" n ON n."id" = s."nodeId"
LEFT JOIN "RepertoireMove" m ON m."id" = s."targetMoveId";
DROP TABLE "RepertoirePositionStat";
ALTER TABLE "new_RepertoirePositionStat" RENAME TO "RepertoirePositionStat";
CREATE UNIQUE INDEX "RepertoirePositionStat_repertoireId_positionKey_targetUci_key" ON "RepertoirePositionStat"("repertoireId", "positionKey", "targetUci");
CREATE UNIQUE INDEX "RepertoirePositionStat_repertoireId_nodeId_key" ON "RepertoirePositionStat"("repertoireId", "nodeId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
