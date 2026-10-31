-- HEG.40: what the selector did, on the Black move it judged. NULL where it did not run.
ALTER TABLE "RepertoireMove" ADD COLUMN "championSan" TEXT;
ALTER TABLE "RepertoireMove" ADD COLUMN "championCp2M" REAL;
ALTER TABLE "RepertoireMove" ADD COLUMN "chosenCp2M" REAL;
ALTER TABLE "RepertoireMove" ADD COLUMN "selectorCpLoss" REAL;
ALTER TABLE "RepertoireMove" ADD COLUMN "selectorGames" INTEGER;
ALTER TABLE "RepertoireMove" ADD COLUMN "selectorScore" REAL;
ALTER TABLE "RepertoireMove" ADD COLUMN "safeGain" REAL;
ALTER TABLE "RepertoireMove" ADD COLUMN "lineCpSpent" REAL;
ALTER TABLE "RepertoireMove" ADD COLUMN "selectorJudged" TEXT;
