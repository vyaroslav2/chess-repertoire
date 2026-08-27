ALTER TABLE "RepertoireNode" ADD COLUMN "wikibooksChecked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RepertoireNode" ADD COLUMN "wikiText" TEXT;

-- PositionCache text has no reliable exact-history provenance and is intentionally discarded.
ALTER TABLE "PositionCache" DROP COLUMN "wikiText";
