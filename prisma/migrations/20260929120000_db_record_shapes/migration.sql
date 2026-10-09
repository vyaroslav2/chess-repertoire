-- DB: match the record shapes in new-docs/DB.md.
-- The tree (nodes, moves, Position) is rebuilt on every run (DB.02), so it is
-- recreated empty. The caches survive (DB.30), so their rows are copied over.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- ---------------------------------------------------------------------------
-- DB.31 Explorer cache: key is positionKey + per-dataset cache profile.
-- Old rows were keyed by snapshot. Only the snapshot built with the current
-- request profile is carried over; its profile is mapped to the per-dataset
-- profiles computed by computeExplorerCacheProfile for the same settings.
-- Old rows never stored Explorer's position total, eco or opening name, so the
-- total is the sum of the move counts and the names are empty.
-- ---------------------------------------------------------------------------
DROP TABLE "PositionCache";
CREATE TABLE "PositionCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionKey" TEXT NOT NULL,
    "cacheProfile" TEXT NOT NULL,
    "positionTotalGames" INTEGER NOT NULL,
    "eco" TEXT,
    "openingName" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PositionCache_positionKey_cacheProfile_key" ON "PositionCache"("positionKey", "cacheProfile");

CREATE TABLE "PositionCacheMove" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cacheId" TEXT NOT NULL,
    "uci" TEXT NOT NULL,
    "san" TEXT NOT NULL,
    "games" INTEGER NOT NULL,
    "whiteWins" INTEGER NOT NULL,
    "draws" INTEGER NOT NULL,
    "blackWins" INTEGER NOT NULL,
    CONSTRAINT "PositionCacheMove_cacheId_fkey" FOREIGN KEY ("cacheId") REFERENCES "PositionCache" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PositionCacheMove_cacheId_uci_key" ON "PositionCacheMove"("cacheId", "uci");

INSERT OR IGNORE INTO "PositionCache" ("id", "positionKey", "cacheProfile", "positionTotalGames", "eco", "openingName", "fetchedAt")
SELECT f."id", f."positionKey",
       CASE f."databaseType"
         WHEN 'MASTERS' THEN 'b6b7f751e55287c2ba947dc16658970ebddac82c284472a747f625ffb88113f1'
         WHEN 'ELITE'   THEN '912c05cc467685407756760b051a3ecc03940636a3826dff5b73d3a7f8e79553'
         WHEN 'AMATEUR' THEN '315b7b6ed7ee94ad8b15ea57cfa4324700f8c14a4c489d1d0357e14f0faa2ead'
       END,
       COALESCE((SELECT SUM(m."games") FROM "ExplorerMoveCache" m
                 WHERE m."snapshotId" = f."snapshotId" AND m."positionKey" = f."positionKey" AND m."databaseType" = f."databaseType"), 0),
       NULL, NULL, s."startedAt"
FROM "HumanExplorerFetch" f
JOIN "HumanDataSnapshot" s ON s."id" = f."snapshotId"
WHERE s."explorerRequestProfile" = '224dd402c861ade92ac5bbdfb77d3dbbe7001172b4c53c96a5c380e9d5d602ed'
  AND f."databaseType" IN ('MASTERS', 'ELITE', 'AMATEUR');

INSERT OR IGNORE INTO "PositionCacheMove" ("id", "cacheId", "uci", "san", "games", "whiteWins", "draws", "blackWins")
SELECT m."id", f."id", m."uci", m."san", m."games", CAST(m."whiteWins" AS INTEGER), CAST(m."draws" AS INTEGER), CAST(m."blackWins" AS INTEGER)
FROM "ExplorerMoveCache" m
JOIN "HumanExplorerFetch" f
  ON f."snapshotId" = m."snapshotId" AND f."positionKey" = m."positionKey" AND f."databaseType" = m."databaseType"
WHERE f."id" IN (SELECT "id" FROM "PositionCache");

-- ---------------------------------------------------------------------------
-- DB.32 EngineCache: key is fullFen + that engine's own profile.
-- ---------------------------------------------------------------------------
CREATE TABLE "EngineCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullFen" TEXT NOT NULL,
    "engineProfile" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "EngineCache_fullFen_engine_engineProfile_key" ON "EngineCache"("fullFen", "engine", "engineProfile");

CREATE TABLE "EngineCacheEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cacheId" TEXT NOT NULL,
    "uci" TEXT NOT NULL,
    "san" TEXT,
    "cp" REAL,
    "mate" INTEGER,
    "rank" INTEGER,
    CONSTRAINT "EngineCacheEvaluation_cacheId_fkey" FOREIGN KEY ("cacheId") REFERENCES "EngineCache" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EngineCacheEvaluation_cacheId_uci_key" ON "EngineCacheEvaluation"("cacheId", "uci");

INSERT OR IGNORE INTO "EngineCache" ("id", "fullFen", "engineProfile", "engine", "fetchedAt")
SELECT "id", "fullFen", "evaluationProfile", "source", "fetchedAt" FROM "RemoteEngineFetch";

INSERT OR IGNORE INTO "EngineCacheEvaluation" ("id", "cacheId", "uci", "san", "cp", "mate", "rank")
SELECT e."id", e."fetchId", e."uci", e."san", e."cp", e."mate", NULL
FROM "RemoteEngineEvalCache" e
WHERE e."fetchId" IN (SELECT "id" FROM "EngineCache");

INSERT OR IGNORE INTO "EngineCache" ("id", "fullFen", "engineProfile", "engine", "fetchedAt")
SELECT "id", "fullFen", "evaluationProfile", 'LOCAL', "analysedAt" FROM "LocalEngineBaseline";

INSERT OR IGNORE INTO "EngineCacheEvaluation" ("id", "cacheId", "uci", "san", "cp", "mate", "rank")
SELECT lower(hex(randomblob(16))), c."id", b."bestUci", b."san", b."cp", b."mate", 1
FROM "LocalEngineBaseline" b
JOIN "EngineCache" c ON c."fullFen" = b."fullFen" AND c."engine" = 'LOCAL' AND c."engineProfile" = b."evaluationProfile";

INSERT OR IGNORE INTO "EngineCache" ("id", "fullFen", "engineProfile", "engine", "fetchedAt")
SELECT lower(hex(randomblob(16))), "fullFen", "evaluationProfile", 'LOCAL', "analysedAt" FROM "LocalEngineCandidate";

INSERT OR IGNORE INTO "EngineCacheEvaluation" ("id", "cacheId", "uci", "san", "cp", "mate", "rank")
SELECT lower(hex(randomblob(16))), c."id", l."candidateUci", l."san", l."cp", l."mate", NULL
FROM "LocalEngineCandidate" l
JOIN "EngineCache" c ON c."fullFen" = l."fullFen" AND c."engine" = 'LOCAL' AND c."engineProfile" = l."evaluationProfile";

DROP TABLE "ExplorerMoveCache";
DROP TABLE "HumanExplorerFetch";
DROP TABLE "HumanDataSnapshot";
DROP TABLE "RemoteEngineEvalCache";
DROP TABLE "RemoteEngineFetch";
DROP TABLE "LocalEngineBaseline";
DROP TABLE "LocalEngineCandidate";

-- ---------------------------------------------------------------------------
-- DB.33 opening metadata per route: the source column is gone.
-- ---------------------------------------------------------------------------
CREATE TABLE "new_OpeningMetadataHistoryCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repertoireId" TEXT NOT NULL,
    "history" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "eco" TEXT,
    "openingName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpeningMetadataHistoryCache_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OpeningMetadataHistoryCache" ("createdAt", "eco", "history", "id", "openingName", "repertoireId", "status", "updatedAt") SELECT "createdAt", "eco", "history", "id", "openingName", "repertoireId", "status", "updatedAt" FROM "OpeningMetadataHistoryCache";
DROP TABLE "OpeningMetadataHistoryCache";
ALTER TABLE "new_OpeningMetadataHistoryCache" RENAME TO "OpeningMetadataHistoryCache";
CREATE UNIQUE INDEX "OpeningMetadataHistoryCache_repertoireId_history_key" ON "OpeningMetadataHistoryCache"("repertoireId", "history");

-- ---------------------------------------------------------------------------
-- The tree: recreated empty (DB.02, DB.36).
-- ---------------------------------------------------------------------------
UPDATE "RepertoirePositionStat" SET "nodeId" = NULL, "targetMoveId" = NULL;

DROP TABLE "RepertoireMove";
DROP TABLE "Position";
DROP TABLE "RepertoireNode";

CREATE TABLE "RepertoireNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repertoireId" TEXT NOT NULL,
    "positionKey" TEXT NOT NULL,
    "fullFen" TEXT NOT NULL,
    "history" TEXT NOT NULL DEFAULT '',
    "displayPgn" TEXT NOT NULL DEFAULT '',
    "routeProb" REAL NOT NULL,
    "cumProb" REAL NOT NULL,
    "rareDropped" REAL NOT NULL DEFAULT 0,
    "unaccountedDropped" REAL NOT NULL DEFAULT 0,
    "transposesTo" TEXT,
    "eco" TEXT,
    "openingName" TEXT,
    "openingMetadataStatus" TEXT,
    "wikibooksChecked" BOOLEAN NOT NULL DEFAULT false,
    "wikiText" TEXT,
    "siblingIndex" INTEGER,
    CONSTRAINT "RepertoireNode_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepertoireNode_transposesTo_fkey" FOREIGN KEY ("transposesTo") REFERENCES "RepertoireNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "RepertoireNode_repertoireId_history_idx" ON "RepertoireNode"("repertoireId", "history");
CREATE INDEX "RepertoireNode_repertoireId_positionKey_idx" ON "RepertoireNode"("repertoireId", "positionKey");

CREATE TABLE "Position" (
    "repertoireId" TEXT NOT NULL,
    "positionKey" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,

    PRIMARY KEY ("repertoireId", "positionKey"),
    CONSTRAINT "Position_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Position_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "RepertoireNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Position_nodeId_key" ON "Position"("nodeId");

CREATE TABLE "RepertoireMove" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repertoireId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT,
    "san" TEXT NOT NULL,
    "uci" TEXT,
    "playerTurn" TEXT NOT NULL,
    "moveProb" REAL,
    "stopReason" TEXT,
    "mastersGames" INTEGER,
    "eliteGames" INTEGER,
    "weightedGames" REAL,
    "totalMastersGames" INTEGER,
    "mastersMoveShare" REAL,
    "totalEliteGames" INTEGER,
    "eliteMoveShare" REAL,
    "cp" REAL,
    "mate" INTEGER,
    "source" TEXT,
    "selectionMethod" TEXT,
    "moveOrigin" TEXT,
    "engineRank" INTEGER,
    "deepVerified" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "RepertoireMove_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "RepertoireNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepertoireMove_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "RepertoireNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepertoireMove_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RepertoireMove_fromNodeId_uci_key" ON "RepertoireMove"("fromNodeId", "uci");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
