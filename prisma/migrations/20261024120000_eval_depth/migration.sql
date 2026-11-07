-- DB.11, DB.32: every eval keeps the deepest depth its search completed.
-- Evals cached before this have no depth; they keep NULL until the profile changes.
ALTER TABLE "EngineCacheEvaluation" ADD COLUMN "depth" INTEGER;
ALTER TABLE "RepertoireMove" ADD COLUMN "depth" INTEGER;
