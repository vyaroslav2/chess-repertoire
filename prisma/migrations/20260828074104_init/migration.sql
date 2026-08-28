-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Repertoire" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generationStatus" TEXT NOT NULL DEFAULT 'IDLE',
    "completedConfigHash" TEXT,
    CONSTRAINT "Repertoire_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Position" (
    "positionKey" TEXT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "HumanDataSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repertoireId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "explorerRequestProfile" TEXT NOT NULL,
    CONSTRAINT "HumanDataSnapshot_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HumanExplorerFetch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "positionKey" TEXT NOT NULL,
    "databaseType" TEXT NOT NULL,
    CONSTRAINT "HumanExplorerFetch_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "HumanDataSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HumanExplorerFetch_positionKey_fkey" FOREIGN KEY ("positionKey") REFERENCES "Position" ("positionKey") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PositionCache" (
    "fen" TEXT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "ExplorerMoveCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "positionKey" TEXT NOT NULL,
    "databaseType" TEXT NOT NULL,
    "uci" TEXT NOT NULL,
    "san" TEXT NOT NULL,
    "games" INTEGER NOT NULL,
    "whiteWins" REAL NOT NULL,
    "draws" REAL NOT NULL,
    "blackWins" REAL NOT NULL,
    CONSTRAINT "ExplorerMoveCache_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "HumanDataSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExplorerMoveCache_positionKey_fkey" FOREIGN KEY ("positionKey") REFERENCES "Position" ("positionKey") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RemoteEngineFetch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullFen" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "evaluationProfile" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RemoteEngineEvalCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fetchId" TEXT NOT NULL,
    "uci" TEXT NOT NULL,
    "san" TEXT,
    "cp" REAL,
    "mate" INTEGER,
    CONSTRAINT "RemoteEngineEvalCache_fetchId_fkey" FOREIGN KEY ("fetchId") REFERENCES "RemoteEngineFetch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LocalEngineBaseline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullFen" TEXT NOT NULL,
    "evaluationProfile" TEXT NOT NULL,
    "bestUci" TEXT NOT NULL,
    "san" TEXT,
    "cp" REAL,
    "mate" INTEGER,
    "analysedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LocalEngineCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullFen" TEXT NOT NULL,
    "candidateUci" TEXT NOT NULL,
    "evaluationProfile" TEXT NOT NULL,
    "san" TEXT,
    "cp" REAL,
    "mate" INTEGER,
    "analysedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RepertoireNode" (
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

-- CreateTable
CREATE TABLE "RepertoireMove" (
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

-- CreateTable
CREATE TABLE "RepertoirePositionStat" (
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

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "HumanExplorerFetch_snapshotId_positionKey_databaseType_key" ON "HumanExplorerFetch"("snapshotId", "positionKey", "databaseType");

-- CreateIndex
CREATE INDEX "ExplorerMoveCache_snapshotId_positionKey_databaseType_idx" ON "ExplorerMoveCache"("snapshotId", "positionKey", "databaseType");

-- CreateIndex
CREATE UNIQUE INDEX "ExplorerMoveCache_snapshotId_positionKey_databaseType_uci_key" ON "ExplorerMoveCache"("snapshotId", "positionKey", "databaseType", "uci");

-- CreateIndex
CREATE UNIQUE INDEX "RemoteEngineFetch_fullFen_source_evaluationProfile_key" ON "RemoteEngineFetch"("fullFen", "source", "evaluationProfile");

-- CreateIndex
CREATE UNIQUE INDEX "RemoteEngineEvalCache_fetchId_uci_key" ON "RemoteEngineEvalCache"("fetchId", "uci");

-- CreateIndex
CREATE UNIQUE INDEX "LocalEngineBaseline_fullFen_evaluationProfile_key" ON "LocalEngineBaseline"("fullFen", "evaluationProfile");

-- CreateIndex
CREATE UNIQUE INDEX "LocalEngineCandidate_fullFen_candidateUci_evaluationProfile_key" ON "LocalEngineCandidate"("fullFen", "candidateUci", "evaluationProfile");

-- CreateIndex
CREATE INDEX "RepertoireNode_repertoireId_history_idx" ON "RepertoireNode"("repertoireId", "history");

-- CreateIndex
CREATE INDEX "RepertoireNode_repertoireId_positionKey_idx" ON "RepertoireNode"("repertoireId", "positionKey");

-- CreateIndex
CREATE UNIQUE INDEX "RepertoireMove_fromNodeId_uci_key" ON "RepertoireMove"("fromNodeId", "uci");

-- CreateIndex
CREATE UNIQUE INDEX "RepertoirePositionStat_repertoireId_positionKey_targetUci_key" ON "RepertoirePositionStat"("repertoireId", "positionKey", "targetUci");

-- CreateIndex
CREATE UNIQUE INDEX "RepertoirePositionStat_repertoireId_nodeId_key" ON "RepertoirePositionStat"("repertoireId", "nodeId");
