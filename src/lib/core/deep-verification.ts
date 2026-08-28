import { parseFullFen } from "./fen";
import { buildBlackHumanShortlist, type ExplorerMoveInput } from "./black-human-shortlist";
import { computeExplorerRequestProfile, defaultConfig } from "./config";
import { getCpTolerance } from "./verifier";
import { verifyLocalCandidate, type LocalCandidateVerification } from "./local-engine";
import {
  markResponseDeepVerified,
  prisma,
  readHumanExplorerBucket,
  validateResponsePersistence,
  type ResponseEvaluationSource,
  type ResponseMoveOrigin,
  type ResponseSelectionMethod
} from "../db/operations";

export type ProposedDeepCorrection = {
  uci: string;
  san: string;
  cp: number | null;
  mate: number | null;
  source: "Local Deep Stockfish";
  selectionMethod: "Corrected after Deep Verification";
  moveOrigin: "Human Move" | "Engine Move";
  deepVerified: true;
  localEvaluationProfile: string;
  baselineUci: string;
  baselineCp: number | null;
  baselineMate: number | null;
};

export type DeepVerificationResult =
  | { status: "COMPLETE"; verifiedCount: number }
  | {
      status: "FAILED_RESPONSE";
      verifiedCount: number;
      failed: { responseId: string; uci: string; san: string; fullFen: string; cp: number | null; mate: number | null; source: ResponseEvaluationSource; fromNodeId: string; toNodeId: string | null; };
      proposal: ProposedDeepCorrection;
    };

type VerifyLocal = typeof verifyLocalCandidate;
type MarkPass = typeof markResponseDeepVerified;
export type DeepVerificationDependencies = { verifyLocal?: VerifyLocal; markPass?: MarkPass };

export function responseMoveNumber(fullFen: string): number {
  const canonical = parseFullFen(fullFen);
  const fullmove = Number(canonical.split(" ")[5]);
  if (!Number.isInteger(fullmove) || fullmove < 1) throw new Error("Invalid RESPONSE fullmove number");
  return fullmove;
}

function toExplorerInput(rows: Awaited<ReturnType<typeof readHumanExplorerBucket>>): ExplorerMoveInput[] {
  if (rows.status === "missing") throw new Error("DV correction requires complete current HumanDataSnapshot cache");
  if (rows.status === "empty") return [];
  return rows.moves.map(move => ({
    uci: move.uci, san: move.san, games: move.games,
    white: move.whiteWins, draws: move.draws, black: move.blackWins
  }));
}

function proposalFromLocal(result: LocalCandidateVerification, moveOrigin: "Human Move" | "Engine Move"): ProposedDeepCorrection {
  const evaluation = moveOrigin === "Human Move" ? result.candidate : result.baseline;
  return {
    uci: evaluation.uci, san: evaluation.san, cp: evaluation.cp, mate: evaluation.mate,
    source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification",
    moveOrigin, deepVerified: true, localEvaluationProfile: result.evaluationProfile,
    baselineUci: result.baseline.uci, baselineCp: result.baseline.cp, baselineMate: result.baseline.mate
  };
}

export async function runDeepVerification(
  repertoireId: string,
  dependencies: DeepVerificationDependencies = {}
): Promise<DeepVerificationResult> {
  if (typeof repertoireId !== "string" || repertoireId.trim() === "") throw new Error("DV requires an explicit repertoireId");
  const repertoire = await prisma.repertoire.findUnique({ where: { id: repertoireId } });
  if (!repertoire) throw new Error(`DV repertoire not found: ${repertoireId}`);
  const verify = dependencies.verifyLocal ?? verifyLocalCandidate;
  const markPass = dependencies.markPass ?? markResponseDeepVerified;
  const responses = await prisma.repertoireMove.findMany({
    where: { repertoireId, playerTurn: "RESPONSE", deepVerified: false },
    include: { fromNode: true }
  });
  responses.sort((a, b) => responseMoveNumber(a.fromNode.fullFen) - responseMoveNumber(b.fromNode.fullFen) ||
    a.fromNode.pgn.localeCompare(b.fromNode.pgn) || (a.uci ?? "").localeCompare(b.uci ?? ""));

  let verifiedCount = 0;
  for (const response of responses) {
    if (response.fromNode.repertoireId !== repertoireId) throw new Error("DV RESPONSE/source repertoire mismatch");
    validateResponsePersistence({
      fromNodeId: response.fromNodeId, toNodeId: response.toNodeId, uci: response.uci as string, san: response.san,
      cp: response.cp, mate: response.mate, source: response.source as ResponseEvaluationSource,
      selectionMethod: response.selectionMethod as ResponseSelectionMethod, moveOrigin: response.moveOrigin as ResponseMoveOrigin,
      deepVerified: false, localEvaluationProfile: response.localEvaluationProfile, weightedCount: response.weightedCount
    });
    const fullFen = parseFullFen(response.fromNode.fullFen);
    if (fullFen !== response.fromNode.fullFen) throw new Error("DV RESPONSE source FullFen is not canonical");
    const moveNumber = responseMoveNumber(fullFen);
    const local = await verify(fullFen, response.uci!, getCpTolerance(moveNumber, true), defaultConfig);
    if (local.decision === "ACCEPT") {
      await markPass({
        responseId: response.id, expectedUci: response.uci!, expectedFullFen: fullFen,
        localEvaluationProfile: local.evaluationProfile,
        expectedBaseline: { uci: local.baseline.uci, cp: local.baseline.cp, mate: local.baseline.mate },
        expectedCandidate: { uci: local.candidate.uci, cp: local.candidate.cp, mate: local.candidate.mate }
      });
      verifiedCount++;
      continue;
    }

    const profile = computeExplorerRequestProfile(defaultConfig);
    const snapshot = await prisma.humanDataSnapshot.findFirst({
      where: { repertoireId, explorerRequestProfile: profile }, orderBy: { startedAt: "desc" }
    });
    if (!snapshot) throw new Error("DV correction requires the repertoire's current compatible HumanDataSnapshot");
    const [mastersBucket, eliteBucket] = await Promise.all([
      readHumanExplorerBucket(snapshot.id, response.fromNode.positionKey, "MASTERS"),
      readHumanExplorerBucket(snapshot.id, response.fromNode.positionKey, "ELITE")
    ]);
    const shortlist = buildBlackHumanShortlist(toExplorerInput(mastersBucket), toExplorerInput(eliteBucket), defaultConfig);
    let proposal: ProposedDeepCorrection | null = null;
    for (const candidate of shortlist) {
      const candidateLocal = await verify(fullFen, candidate.uci, getCpTolerance(moveNumber, true), defaultConfig);
      if (candidateLocal.decision === "ACCEPT") {
        proposal = proposalFromLocal(candidateLocal, "Human Move");
        break;
      }
    }
    proposal ??= proposalFromLocal(local, "Engine Move");
    return {
      status: "FAILED_RESPONSE", verifiedCount,
      failed: { responseId: response.id, uci: response.uci!, san: response.san, fullFen, cp: response.cp, mate: response.mate, source: response.source as ResponseEvaluationSource, fromNodeId: response.fromNodeId, toNodeId: response.toNodeId },
      proposal
    };
  }
  return { status: "COMPLETE", verifiedCount };
}
