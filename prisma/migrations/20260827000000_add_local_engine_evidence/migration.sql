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

CREATE UNIQUE INDEX "LocalEngineBaseline_fullFen_evaluationProfile_key"
ON "LocalEngineBaseline"("fullFen", "evaluationProfile");

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

CREATE UNIQUE INDEX "LocalEngineCandidate_fullFen_candidateUci_evaluationProfile_key"
ON "LocalEngineCandidate"("fullFen", "candidateUci", "evaluationProfile");
