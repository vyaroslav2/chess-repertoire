-- SC.20: every eval keeps the node count and the moves of the info line it was read from.
-- Evals cached before this have neither; they keep NULL.
ALTER TABLE "EngineCacheEvaluation" ADD COLUMN "nodes" INTEGER;
ALTER TABLE "EngineCacheEvaluation" ADD COLUMN "pv" TEXT;
