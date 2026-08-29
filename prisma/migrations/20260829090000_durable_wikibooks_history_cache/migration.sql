CREATE TABLE "WikibooksHistoryCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repertoireId" TEXT NOT NULL,
    "history" TEXT NOT NULL,
    "wikiText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WikibooksHistoryCache_repertoireId_fkey" FOREIGN KEY ("repertoireId") REFERENCES "Repertoire" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WikibooksHistoryCache_repertoireId_history_key"
ON "WikibooksHistoryCache"("repertoireId", "history");

INSERT OR IGNORE INTO "WikibooksHistoryCache" ("id", "repertoireId", "history", "wikiText", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
       "repertoireId", "history", "wikiText", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "RepertoireNode"
WHERE "wikibooksChecked" = 1;
