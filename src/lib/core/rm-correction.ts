import {
  prisma,
  type ResponseEvaluationSource,
  type ResponseSelectionMethod,
  type ResponseMoveOrigin,
  validateResponsePersistence
} from "../db/operations";
import { ProposedDeepCorrection } from "./deep-verification";
import { replaceResponseBranch } from "./rm-structural";

export interface CorrectionInput {
  repertoireId: string;
  failed: {
    responseId: string;
    uci: string;
    fullFen: string;
    cp: number | null;
    mate: number | null;
    source: string;
    fromNodeId: string;
    toNodeId: string | null;
  };
  proposal: ProposedDeepCorrection;
};

export type CorrectionResult = {
  removedResponseId: string;
  removedNodeCount: number;
  removedMoveCount: number;
  createdResponseId: string;
  createdDestinationNodeId: string | null;
  replacementUci: string;
};

export async function applyApprovedDeepCorrection(input: CorrectionInput): Promise<CorrectionResult> {
  if (input.failed.uci === input.proposal.uci) {
    throw new Error("Cannot destructively replace a move with itself. Proposal UCI matches failed UCI.");
  }

  if (input.proposal.source !== "Local Deep Stockfish") throw new Error("Invalid proposal source");
  if (input.proposal.selectionMethod !== "Corrected after Deep Verification") throw new Error("Invalid proposal selectionMethod");
  if (input.proposal.moveOrigin !== "Human Move" && input.proposal.moveOrigin !== "Engine Move") throw new Error("Invalid proposal moveOrigin: must be Human Move or Engine Move");
  if (input.proposal.deepVerified !== true) throw new Error("Invalid proposal deepVerified: must be true");

  validateResponsePersistence({
    fromNodeId: "dummy",
    toNodeId: "dummy",
    uci: input.proposal.uci,
    san: input.proposal.san,
    cp: input.proposal.cp,
    mate: input.proposal.mate,
    source: input.proposal.source,
    selectionMethod: input.proposal.selectionMethod,
    moveOrigin: input.proposal.moveOrigin,
    deepVerified: input.proposal.deepVerified,
    localEvaluationProfile: input.proposal.localEvaluationProfile,
    weightedCount: null
  });

  return await prisma.$transaction(async (tx) => {
    // 1. Verify old RESPONSE exists and matches expected state perfectly
    const oldResponse = await tx.repertoireMove.findUnique({
      where: { id: input.failed.responseId },
      include: { fromNode: true, toNode: true }
    });

    if (!oldResponse || oldResponse.repertoireId !== input.repertoireId) {
       throw new Error("Stale failed RESPONSE: not found or wrong repertoire");
    }
    if (oldResponse.fromNode.repertoireId !== input.repertoireId) throw new Error("Stale failed RESPONSE: fromNode foreign repertoire");
    if (oldResponse.toNode && oldResponse.toNode.repertoireId !== input.repertoireId) throw new Error("Stale failed RESPONSE: toNode foreign repertoire");
    if (oldResponse.playerTurn !== "RESPONSE") throw new Error("Stale failed RESPONSE: not a RESPONSE");
    if (oldResponse.uci !== input.failed.uci) throw new Error("Stale failed RESPONSE: UCI changed");
    if (oldResponse.fromNode.fullFen !== input.failed.fullFen) throw new Error("Stale failed RESPONSE: fullFen changed");
    if (oldResponse.cp !== input.failed.cp) throw new Error("Stale failed RESPONSE: cp changed");
    if (oldResponse.mate !== input.failed.mate) throw new Error("Stale failed RESPONSE: mate changed");
    if (oldResponse.source !== input.failed.source) throw new Error("Stale failed RESPONSE: source changed");
    if (oldResponse.deepVerified !== false) throw new Error("Stale failed RESPONSE: already deepVerified");
    if (oldResponse.fromNodeId !== input.failed.fromNodeId) throw new Error("Stale failed RESPONSE: fromNodeId changed");
    if (oldResponse.toNodeId !== input.failed.toNodeId) throw new Error("Stale failed RESPONSE: toNodeId changed");

    // Revalidate provenance through standard checks
    validateResponsePersistence({
      fromNodeId: oldResponse.fromNodeId,
      toNodeId: oldResponse.toNodeId,
      uci: oldResponse.uci as string,
      san: oldResponse.san,
      cp: oldResponse.cp,
      mate: oldResponse.mate,
      source: oldResponse.source as ResponseEvaluationSource,
      selectionMethod: oldResponse.selectionMethod as ResponseSelectionMethod,
      moveOrigin: oldResponse.moveOrigin as ResponseMoveOrigin,
      deepVerified: false,
      localEvaluationProfile: oldResponse.localEvaluationProfile,
      weightedCount: oldResponse.weightedCount
      ,stopReason: oldResponse.stopReason === "Repetition" || oldResponse.stopReason === "Transposition" ? oldResponse.stopReason : null
      ,routeHistory: oldResponse.routeHistory
    });

    // 2. Revalidate Local evidence for the proposal
    const profile = input.proposal.localEvaluationProfile;

    // Check baseline exactly matches the proposal's stored baseline
    const baseline = await tx.localEngineBaseline.findUnique({
      where: { fullFen_evaluationProfile: { fullFen: input.failed.fullFen, evaluationProfile: profile } }
    });
    if (!baseline) throw new Error("Stale proposal: LocalEngineBaseline missing");
    if (baseline.bestUci !== input.proposal.baselineUci) throw new Error("Stale proposal: baseline bestUci changed");
    if (baseline.cp !== input.proposal.baselineCp || baseline.mate !== input.proposal.baselineMate) {
      throw new Error("Stale proposal: baseline evaluation changed");
    }

    if (input.proposal.moveOrigin === "Engine Move") {
      if (input.proposal.uci !== baseline.bestUci) throw new Error("Stale proposal: engine proposal uci changed");
      if (input.proposal.cp !== baseline.cp || input.proposal.mate !== baseline.mate) {
        throw new Error("Stale proposal: engine proposal evaluation changed");
      }
    } else if (input.proposal.moveOrigin === "Human Move") {
      const candidate = await tx.localEngineCandidate.findUnique({
        where: { fullFen_candidateUci_evaluationProfile: { fullFen: input.failed.fullFen, candidateUci: input.proposal.uci, evaluationProfile: profile } }
      });
      if (!candidate) throw new Error("Stale proposal: LocalEngineCandidate missing");
      if (candidate.cp !== input.proposal.cp || candidate.mate !== input.proposal.mate) {
        throw new Error("Stale proposal: candidate evaluation changed");
      }
    }

    // 3. Delegate to generic structural replacement primitive
    return await replaceResponseBranch({
        tx,
        repertoireId: input.repertoireId,
        oldResponse: oldResponse,
        newUci: input.proposal.uci,
        expectedNewSan: input.proposal.san,
        newCp: input.proposal.cp,
        newMate: input.proposal.mate,
        newSource: input.proposal.source,
        newSelectionMethod: input.proposal.selectionMethod,
        newMoveOrigin: input.proposal.moveOrigin,
        newDeepVerified: input.proposal.deepVerified,
        newLocalEvaluationProfile: input.proposal.localEvaluationProfile,
        newWeightedCount: null,
        cumulativeProb: oldResponse.fromNode.cumulativeProb
    });
  });
}
