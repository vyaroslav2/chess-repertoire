import { Prisma } from "@prisma/client";
import { Chess } from "chess.js";
import {
  type ResponseEvaluationSource,
  type ResponseMoveOrigin,
  type ResponseSelectionMethod,
  validateResponsePersistence
} from "../db/operations";
import { parseFullFen, positionKeyFromFen } from "./fen";

export interface ReplaceResponseBranchInput {
  tx: Prisma.TransactionClient;
  repertoireId: string;
  oldResponse: {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    san: string;
    fromNode: { pgn: string; fullFen: string; cumulativeProb: number };
  };
  newUci: string;
  expectedNewSan: string;
  newCp: number | null;
  newMate: number | null;
  newSource: ResponseEvaluationSource;
  newSelectionMethod: ResponseSelectionMethod;
  newMoveOrigin: ResponseMoveOrigin;
  newDeepVerified: boolean;
  newLocalEvaluationProfile: string | null;
  newWeightedCount: number | null;
  cumulativeProb: number;
}

export async function replaceResponseBranch(input: ReplaceResponseBranchInput) {
  const { tx, repertoireId, oldResponse } = input;
  validateResponsePersistence({
    fromNodeId: oldResponse.fromNodeId,
    toNodeId: oldResponse.toNodeId,
    uci: input.newUci,
    san: input.expectedNewSan,
    cp: input.newCp,
    mate: input.newMate,
    source: input.newSource,
    selectionMethod: input.newSelectionMethod,
    moveOrigin: input.newMoveOrigin,
    deepVerified: input.newDeepVerified,
    localEvaluationProfile: input.newLocalEvaluationProfile,
    weightedCount: input.newWeightedCount
  });

  const canonicalSource = parseFullFen(oldResponse.fromNode.fullFen);
  if (canonicalSource !== oldResponse.fromNode.fullFen) throw new Error("Invalid source FullFen: source must be canonical");
  const chess = new Chess(canonicalSource);
  let chessMove;
  try {
    chessMove = chess.move({ from: input.newUci.slice(0, 2), to: input.newUci.slice(2, 4), promotion: input.newUci[4] });
  } catch {
    throw new Error(`Invalid proposal UCI ${input.newUci} for fen ${canonicalSource}`);
  }
  if (!chessMove || chessMove.lan !== input.newUci) throw new Error(`Invalid proposal UCI ${input.newUci} for fen ${canonicalSource}`);
  if (chessMove.san !== input.expectedNewSan) {
    throw new Error(`Proposal SAN ${input.expectedNewSan} does not match derived SAN ${chessMove.san}`);
  }
  const canonicalFullFen = parseFullFen(chess.fen());
  const posKey = positionKeyFromFen(canonicalFullFen);

  if (input.newDeepVerified) {
    const profile = input.newLocalEvaluationProfile!;
    const [baseline, candidate] = await Promise.all([
      tx.localEngineBaseline.findUnique({ where: { fullFen_evaluationProfile: { fullFen: canonicalSource, evaluationProfile: profile } } }),
      tx.localEngineCandidate.findUnique({ where: { fullFen_candidateUci_evaluationProfile: {
        fullFen: canonicalSource,
        candidateUci: input.newUci,
        evaluationProfile: profile
      } } })
    ]);
    if (!baseline || (baseline.bestUci !== input.newUci && !candidate)) {
      throw new Error("Invalid replacement RESPONSE: compatible Local Deep evidence is missing");
    }
    const exactEvidence = baseline.bestUci === input.newUci ? baseline : candidate!;
    if (exactEvidence.cp !== input.newCp || exactEvidence.mate !== input.newMate) {
      throw new Error("Invalid replacement RESPONSE: exact Local Deep evaluation changed");
    }
  }

  const nodesToDelete = new Set<string>();
  const movesToDelete = new Set<string>();
  const queue: Array<{ nodeId: string; parentPgn: string; san: string }> = [
    { nodeId: oldResponse.toNodeId, parentPgn: oldResponse.fromNode.pgn, san: oldResponse.san }
  ];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (nodesToDelete.has(current.nodeId)) continue;
    const currentNode = await tx.repertoireNode.findUnique({ where: { id: current.nodeId } });
    if (!currentNode) throw new Error("Stale RESPONSE branch: destination node disappeared");
    if (currentNode.repertoireId !== repertoireId) throw new Error("Cross-repertoire node detected");
    const expectedPgn = `${current.parentPgn ? `${current.parentPgn} ` : ""}${current.san}`;
    if (currentNode.pgn !== expectedPgn) continue;
    nodesToDelete.add(current.nodeId);
    const outgoingEdges = await tx.repertoireMove.findMany({ where: { fromNodeId: current.nodeId } });
    for (const edge of outgoingEdges) {
      if (edge.repertoireId !== repertoireId) throw new Error("Cross-repertoire edge detected");
      movesToDelete.add(edge.id);
      queue.push({ nodeId: edge.toNodeId, parentPgn: currentNode.pgn, san: edge.san });
    }
  }

  movesToDelete.add(oldResponse.id);
  await tx.repertoireMove.deleteMany({ where: { id: { in: [...movesToDelete] } } });
  await tx.repertoireNode.deleteMany({ where: { id: { in: [...nodesToDelete] } } });
  await tx.position.upsert({ where: { positionKey: posKey }, update: {}, create: { positionKey: posKey } });

  const newPgn = `${oldResponse.fromNode.pgn ? `${oldResponse.fromNode.pgn} ` : ""}${chessMove.san}`;
  const newDestinationNode = await tx.repertoireNode.create({
    data: { repertoireId, fullFen: canonicalFullFen, positionKey: posKey, pgn: newPgn, cumulativeProb: input.cumulativeProb }
  });
  const newResponse = await tx.repertoireMove.create({
    data: {
      repertoireId,
      fromNodeId: oldResponse.fromNodeId,
      toNodeId: newDestinationNode.id,
      san: chessMove.san,
      uci: input.newUci,
      playerTurn: "RESPONSE",
      weightedCount: input.newWeightedCount,
      cp: input.newCp,
      mate: input.newMate,
      source: input.newSource,
      selectionMethod: input.newSelectionMethod,
      moveOrigin: input.newMoveOrigin,
      deepVerified: input.newDeepVerified,
      localEvaluationProfile: input.newLocalEvaluationProfile,
      prob: null,
      trueProbability: null
    }
  });
  await tx.repertoirePositionStat.create({
    data: {
      repertoireId,
      nodeId: oldResponse.fromNodeId,
      targetMoveId: newResponse.id,
      due: new Date(),
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
      explanation: null,
      tags: null
    }
  });
  return {
    removedResponseId: oldResponse.id,
    removedNodeCount: nodesToDelete.size,
    removedMoveCount: movesToDelete.size,
    createdResponseId: newResponse.id,
    createdDestinationNodeId: newDestinationNode.id,
    createdDestinationFullFen: newDestinationNode.fullFen,
    createdDestinationPgn: newDestinationNode.pgn,
    replacementUci: newResponse.uci!,
    replacementSan: newResponse.san
  };
}
