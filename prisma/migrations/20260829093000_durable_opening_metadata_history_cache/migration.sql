CREATE TABLE "OpeningMetadataHistoryCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repertoireId" TEXT NOT NULL,
    "history" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eco" TEXT,
    "openingName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpeningMetadataHistoryCache_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OpeningMetadataHistoryCache_repertoireId_history_key"
ON "OpeningMetadataHistoryCache"("repertoireId", "history");

INSERT OR IGNORE INTO "OpeningMetadataHistoryCache" ("id", "repertoireId", "history", "status", "source", "eco", "openingName", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
       "repertoireId", "history", "openingMetadataStatus", "openingMetadataSource", "eco", "openingName", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "RepertoireNode"
WHERE "openingMetadataStatus" IN ('PRESENT', 'VALID_ABSENCE')
  AND "openingMetadataSource" = 'LICHESS_MASTERS';
