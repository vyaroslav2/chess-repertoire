-- Repertoire opening metadata is history-specific and always carries checked-state provenance.
ALTER TABLE "RepertoireNode" ADD COLUMN "openingMetadataStatus" TEXT;
ALTER TABLE "RepertoireNode" ADD COLUMN "openingMetadataSource" TEXT;

-- A same-route repetition is a terminal move, not an edge back to an ancestor node.
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RepertoireMove" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repertoireId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT,
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
INSERT INTO "new_RepertoireMove" SELECT "id", "repertoireId", "fromNodeId", CASE WHEN "stopReason" = 'Repetition' THEN NULL ELSE "toNodeId" END, "san", "uci", "playerTurn", "prob", "routeProbability", "trueProbability", "routeHistory", "stopReason", "humanDataSnapshotId", "weightedCount", "mastersGames", "eliteGames", "totalRelevantGames", "moveShare", "engineRank", "cp", "mate", "source", "selectionMethod", "moveOrigin", "deepVerified", "localEvaluationProfile" FROM "RepertoireMove";
UPDATE "new_RepertoireMove"
SET "routeProbability" = (
      SELECT CASE
        WHEN "new_RepertoireMove"."playerTurn" = 'OPPONENT'
          THEN source."cumulativeProb" * COALESCE("new_RepertoireMove"."prob", 0)
        ELSE source."cumulativeProb"
      END
      FROM "RepertoireNode" AS source
      WHERE source."id" = "new_RepertoireMove"."fromNodeId"
    ),
    "trueProbability" = (
      SELECT CASE
        WHEN "new_RepertoireMove"."playerTurn" = 'OPPONENT'
          THEN source."cumulativeProb" * COALESCE("new_RepertoireMove"."prob", 0)
        ELSE source."cumulativeProb"
      END
      FROM "RepertoireNode" AS source
      WHERE source."id" = "new_RepertoireMove"."fromNodeId"
    )
WHERE "stopReason" = 'Repetition';
DROP TABLE "RepertoireMove";
ALTER TABLE "new_RepertoireMove" RENAME TO "RepertoireMove";
CREATE UNIQUE INDEX "RepertoireMove_fromNodeId_uci_key" ON "RepertoireMove"("fromNodeId", "uci");
PRAGMA foreign_keys=ON;
