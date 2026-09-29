import { Chess } from "chess.js";
import {
  prisma,
  readLocalEngineBaseline,
  readLocalEngineCandidate,
  type ResponseEvaluationSource,
  type ResponseMoveOrigin,
  type ResponsePersistenceInput,
  type ResponseSelectionMethod,
  validateResponsePersistence
} from "../db/operations";
import { parseFullFen, positionKeyFromFen } from "./fen";
import { replaceResponseBranch } from "./rm-structural";
import { computeLocalEngineEvaluationProfile, defaultConfig } from "./config";

export type RecomputedResponse = Omit<ResponsePersistenceInput, "fromNodeId" | "toNodeId" | "uci" | "san"> & {
  selectedUci: string;
  selectedMoveSan: string;
  weightedGames: number | null;
};

export interface ReconcileExistingResponseInput {
  repertoireId: string;
  sourceNodeId: string;
  cumProb: number;
  expectedStoredResponse: {
    id: string;
    uci: string;
    fromNodeId: string;
    toNodeId: string | null;
    fullFen: string;
  };
  recomputed: RecomputedResponse;
}

export type ReconcileResult = {
  action: "KEPT" | "REPLACED";
  responseId: string;
  destinationNodeId: string | null;
  destinationFullFen: string;
  destinationPgn: string;
  san: string;
};

function deriveMove(fullFen: string, uci: string) {
  const canonicalSource = parseFullFen(fullFen);
  if (canonicalSource !== fullFen) throw new Error("Stored RESPONSE source FullFen is not canonical");
  const chess = new Chess(canonicalSource);
  let move;
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    throw new Error(`Invalid RESPONSE: illegal UCI move ${uci}`);
  }
  if (!move || move.lan !== uci) throw new Error(`Invalid RESPONSE: illegal UCI move ${uci}`);
  return { san: move.san, destinationFullFen: parseFullFen(chess.fen()) };
}

export async function reconcileExistingResponse(input: ReconcileExistingResponseInput): Promise<ReconcileResult> {
  if (input.sourceNodeId !== input.expectedStoredResponse.fromNodeId) {
    throw new Error("Stale stored RESPONSE: sourceNodeId does not match expected fromNodeId");
  }
  validateResponsePersistence({
    fromNodeId: input.sourceNodeId,
    toNodeId: input.expectedStoredResponse.toNodeId,
    uci: input.recomputed.selectedUci,
    san: input.recomputed.selectedMoveSan,
    cp: input.recomputed.cp,
    mate: input.recomputed.mate,
    source: input.recomputed.source,
    selectionMethod: input.recomputed.selectionMethod,
    moveOrigin: input.recomputed.moveOrigin,
    deepVerified: input.recomputed.deepVerified,
    localEvaluationProfile: input.recomputed.localEvaluationProfile,
    weightedGames: input.recomputed.weightedGames,
    stopReason: input.expectedStoredResponse.toNodeId === null ? "Repetition" : null
  });

  return prisma.$transaction(async tx => {
    const oldResponse = await tx.repertoireMove.findUnique({
      where: { id: input.expectedStoredResponse.id },
      include: { fromNode: true, toNode: true }
    });
    if (!oldResponse || oldResponse.repertoireId !== input.repertoireId) {
      throw new Error("Stale stored RESPONSE: not found or wrong repertoire");
    }
    if (oldResponse.fromNode.repertoireId !== input.repertoireId) throw new Error("Stale stored RESPONSE: fromNode foreign repertoire");
    if (oldResponse.toNode && oldResponse.toNode.repertoireId !== input.repertoireId) throw new Error("Stale stored RESPONSE: toNode foreign repertoire");
    if (oldResponse.playerTurn !== "RESPONSE") throw new Error("Stale stored RESPONSE: not a RESPONSE");
    if (oldResponse.uci !== input.expectedStoredResponse.uci) throw new Error("Stale stored RESPONSE: UCI changed");
    if (oldResponse.fromNodeId !== input.expectedStoredResponse.fromNodeId || oldResponse.fromNodeId !== input.sourceNodeId) {
      throw new Error("Stale stored RESPONSE: fromNodeId changed");
    }
    if (oldResponse.toNodeId !== input.expectedStoredResponse.toNodeId) throw new Error("Stale stored RESPONSE: toNodeId changed");
    if (oldResponse.fromNode.fullFen !== input.expectedStoredResponse.fullFen) throw new Error("Stale stored RESPONSE: fullFen changed");

    validateResponsePersistence({
      fromNodeId: oldResponse.fromNodeId,
      toNodeId: oldResponse.toNodeId,
      uci: oldResponse.uci,
      san: oldResponse.san,
      cp: oldResponse.cp,
      mate: oldResponse.mate,
      source: oldResponse.source as ResponseEvaluationSource,
      selectionMethod: oldResponse.selectionMethod as ResponseSelectionMethod,
      moveOrigin: oldResponse.moveOrigin as ResponseMoveOrigin,
      deepVerified: oldResponse.deepVerified,
      localEvaluationProfile: oldResponse.deepVerified ? computeLocalEngineEvaluationProfile(defaultConfig) : null,
      weightedGames: oldResponse.weightedGames
      ,stopReason: oldResponse.stopReason === "Repetition" || oldResponse.stopReason === "Transposition" ? oldResponse.stopReason : null
    });

    const storedMove = deriveMove(oldResponse.fromNode.fullFen, oldResponse.uci);
    if (storedMove.san !== oldResponse.san) throw new Error("Stored RESPONSE SAN does not match its authoritative UCI");
    if (oldResponse.toNode && storedMove.destinationFullFen !== oldResponse.toNode.fullFen) {
      throw new Error("Stored RESPONSE destination FullFen does not match its authoritative UCI");
    }
    if (oldResponse.stopReason === "Repetition") {
      const repeatedAncestor = await tx.repertoireNode.findFirst({
        where: { repertoireId: input.repertoireId, positionKey: positionKeyFromFen(storedMove.destinationFullFen) }
      });
      if (!repeatedAncestor || !(repeatedAncestor.history === "" || oldResponse.fromNode.history.startsWith(`${repeatedAncestor.history} `))) {
        throw new Error("Stored RESPONSE repetition does not return to an ancestor position");
      }
    }
    const recomputedMove = deriveMove(oldResponse.fromNode.fullFen, input.recomputed.selectedUci);
    if (recomputedMove.san !== input.recomputed.selectedMoveSan) {
      throw new Error("Recomputed RESPONSE SAN does not match its authoritative UCI");
    }

    const stat = await tx.repertoirePositionStat.findUnique({
      where: { repertoireId_nodeId: { repertoireId: input.repertoireId, nodeId: oldResponse.fromNodeId } }
    });
    if (!stat || stat.targetMoveId !== oldResponse.id) {
      throw new Error("Stale stored RESPONSE: position stat no longer targets the expected RESPONSE");
    }

    if (oldResponse.uci === input.recomputed.selectedUci) {
      const finalDeepVerified = oldResponse.deepVerified || input.recomputed.deepVerified;
      const finalProfile = oldResponse.deepVerified ? computeLocalEngineEvaluationProfile(defaultConfig) : input.recomputed.localEvaluationProfile;
      if (finalDeepVerified) {
        const profile = finalProfile!;
        const [baseline, candidate] = await Promise.all([
          readLocalEngineBaseline(oldResponse.fromNode.fullFen, profile),
          readLocalEngineCandidate(oldResponse.fromNode.fullFen, oldResponse.uci, profile)
        ]);
        if (!baseline || (baseline.bestUci !== oldResponse.uci && !candidate)) {
          throw new Error("Cannot preserve RESPONSE deep verification: compatible Local Deep evidence is missing");
        }
        if (input.recomputed.deepVerified) {
          const exactEvidence = baseline.bestUci === oldResponse.uci ? baseline : candidate!;
          if (exactEvidence.cp !== input.recomputed.cp || exactEvidence.mate !== input.recomputed.mate) {
            throw new Error("Cannot persist recomputed deep verification: exact Local Deep evaluation changed");
          }
        }
      }

      await tx.repertoireMove.update({
        where: { id: oldResponse.id },
        data: {
          san: recomputedMove.san,
          cp: input.recomputed.cp,
          mate: input.recomputed.mate,
          source: input.recomputed.source,
          selectionMethod: input.recomputed.selectionMethod,
          moveOrigin: input.recomputed.moveOrigin,
          weightedGames: input.recomputed.weightedGames,
          mastersGames: input.recomputed.mastersGames ?? null,
          eliteGames: input.recomputed.eliteGames ?? null,
          totalMastersGames: input.recomputed.totalMastersGames ?? null,
          mastersMoveShare: input.recomputed.mastersMoveShare ?? null,
          totalEliteGames: input.recomputed.totalEliteGames ?? null,
          eliteMoveShare: input.recomputed.eliteMoveShare ?? null,
          engineRank: input.recomputed.engineRank ?? null,
          deepVerified: finalDeepVerified
        }
      });
      return {
        action: "KEPT",
        responseId: oldResponse.id,
        destinationNodeId: oldResponse.toNodeId,
        destinationFullFen: oldResponse.toNode?.fullFen ?? storedMove.destinationFullFen,
        destinationPgn: oldResponse.toNode?.displayPgn ?? "",
        san: recomputedMove.san
      };
    }

    const replacement = await replaceResponseBranch({
      tx,
      repertoireId: input.repertoireId,
      oldResponse,
      newUci: input.recomputed.selectedUci,
      expectedNewSan: input.recomputed.selectedMoveSan,
      newCp: input.recomputed.cp,
      newMate: input.recomputed.mate,
      newSource: input.recomputed.source,
      newSelectionMethod: input.recomputed.selectionMethod,
      newMoveOrigin: input.recomputed.moveOrigin,
      newDeepVerified: input.recomputed.deepVerified,
      newLocalEvaluationProfile: input.recomputed.localEvaluationProfile,
      newWeightedGames: input.recomputed.weightedGames,
      newMastersGames: input.recomputed.mastersGames,
      newEliteGames: input.recomputed.eliteGames,
      newTotalMastersGames: input.recomputed.totalMastersGames,
      newMastersMoveShare: input.recomputed.mastersMoveShare,
      newTotalEliteGames: input.recomputed.totalEliteGames,
      newEliteMoveShare: input.recomputed.eliteMoveShare,
      newEngineRank: input.recomputed.engineRank,
      cumProb: input.cumProb

    });
    return {
      action: "REPLACED",
      responseId: replacement.createdResponseId,
      destinationNodeId: replacement.createdDestinationNodeId,
      destinationFullFen: replacement.createdDestinationFullFen,
      destinationPgn: replacement.createdDestinationPgn,
      san: replacement.replacementSan
    };
  });
}
