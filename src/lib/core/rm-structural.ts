import { Prisma } from "@prisma/client";
import { Chess } from "chess.js";
import {
  claimPosition,
  readLocalEngineBaseline,
  readLocalEngineCandidate,
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
    toNodeId: string | null;
    san: string;
    fromNode: { displayPgn: string; fullFen: string; cumProb: number; positionKey?: string; history?: string };
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
  newWeightedGames: number | null;
  newMastersGames?: number | null;
  newEliteGames?: number | null;
  newTotalMastersGames?: number | null;
  newMastersMoveShare?: number | null;
  newTotalEliteGames?: number | null;
  newEliteMoveShare?: number | null;
  newEngineRank?: number | null;
  cumProb: number;
}

export interface OwnedBranchRoot {
  edgeId: string;
  nodeId: string;
  parentPgn: string;
  san: string;
}

export async function collectOwnedBranchDeletion(input: {
  tx: Prisma.TransactionClient;
  repertoireId: string;
  roots: OwnedBranchRoot[];
}) {
  const nodesToDelete = new Set<string>();
  const movesToDelete = new Set<string>();
  const queue = [...input.roots]
    .sort((a, b) => a.edgeId.localeCompare(b.edgeId))
    .map(root => ({ nodeId: root.nodeId, parentPgn: root.parentPgn, san: root.san }));

  for (const root of input.roots) movesToDelete.add(root.edgeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (nodesToDelete.has(current.nodeId)) continue;
    const currentNode = await input.tx.repertoireNode.findUnique({ where: { id: current.nodeId } });
    if (!currentNode) throw new Error("Stale repertoire branch: destination node disappeared");
    if (currentNode.repertoireId !== input.repertoireId) throw new Error("Cross-repertoire node detected");
    const expectedPgn = `${current.parentPgn ? `${current.parentPgn} ` : ""}${current.san}`;
    if (currentNode.displayPgn !== expectedPgn) continue;

    nodesToDelete.add(current.nodeId);
    const outgoingEdges = await input.tx.repertoireMove.findMany({
      where: { fromNodeId: current.nodeId },
      orderBy: { id: "asc" }
    });
    for (const edge of outgoingEdges) {
      if (edge.repertoireId !== input.repertoireId) throw new Error("Cross-repertoire edge detected");
      movesToDelete.add(edge.id);
      if (edge.toNodeId !== null) {
        queue.push({ nodeId: edge.toNodeId, parentPgn: currentNode.displayPgn, san: edge.san });
      }
    }
  }

  return { nodesToDelete, movesToDelete };
}

export async function deleteOwnedBranches(input: {
  tx: Prisma.TransactionClient;
  repertoireId: string;
  roots: OwnedBranchRoot[];
}) {
  const collected = await collectOwnedBranchDeletion(input);
  const invalidatedExternalSourceNodeIds = new Set<string>();

  if (collected.nodesToDelete.size > 0) {
    const incomingEdges = await input.tx.repertoireMove.findMany({
      where: { toNodeId: { in: [...collected.nodesToDelete] } }
    });
    for (const edge of incomingEdges) {
      if (!collected.nodesToDelete.has(edge.fromNodeId)) {
        invalidatedExternalSourceNodeIds.add(edge.fromNodeId);
      }
    }
  }

  if (collected.movesToDelete.size > 0) {
    await input.tx.repertoireMove.deleteMany({ where: { id: { in: [...collected.movesToDelete] } } });
  }
  if (collected.nodesToDelete.size > 0) {
    await input.tx.repertoireNode.deleteMany({ where: { id: { in: [...collected.nodesToDelete] } } });
  }
  return { ...collected, invalidatedExternalSourceNodeIds };
}

export async function replaceResponseBranch(input: ReplaceResponseBranchInput) {
  const { tx, repertoireId, oldResponse } = input;
  validateResponsePersistence({
    fromNodeId: oldResponse.fromNodeId,
    toNodeId: "pending-destination",
    uci: input.newUci,
    san: input.expectedNewSan,
    cp: input.newCp,
    mate: input.newMate,
    source: input.newSource,
    selectionMethod: input.newSelectionMethod,
    moveOrigin: input.newMoveOrigin,
    deepVerified: input.newDeepVerified,
    localEvaluationProfile: input.newLocalEvaluationProfile,
    weightedGames: input.newWeightedGames
    ,mastersGames: input.newMastersGames
    ,eliteGames: input.newEliteGames
    ,totalMastersGames: input.newTotalMastersGames
    ,mastersMoveShare: input.newMastersMoveShare
    ,totalEliteGames: input.newTotalEliteGames
    ,eliteMoveShare: input.newEliteMoveShare
    ,engineRank: input.newEngineRank
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
      readLocalEngineBaseline(canonicalSource, profile),
      readLocalEngineCandidate(canonicalSource, input.newUci, profile)
    ]);
    if (!baseline || (baseline.bestUci !== input.newUci && !candidate)) {
      throw new Error("Invalid replacement RESPONSE: compatible Local Deep evidence is missing");
    }
    const exactEvidence = baseline.bestUci === input.newUci ? baseline : candidate!;
    if (exactEvidence.cp !== input.newCp || exactEvidence.mate !== input.newMate) {
      throw new Error("Invalid replacement RESPONSE: exact Local Deep evaluation changed");
    }
  }

  const { nodesToDelete, movesToDelete, invalidatedExternalSourceNodeIds } = await deleteOwnedBranches({
    tx,
    repertoireId,
    roots: oldResponse.toNodeId === null ? [] : [{
      edgeId: oldResponse.id,
      nodeId: oldResponse.toNodeId,
      parentPgn: oldResponse.fromNode.displayPgn,
      san: oldResponse.san
    }]
  });
  if (oldResponse.toNodeId === null) {
    await tx.repertoireMove.delete({ where: { id: oldResponse.id } });
    movesToDelete.add(oldResponse.id);
  }
  const newPgn = `${oldResponse.fromNode.displayPgn ? `${oldResponse.fromNode.displayPgn} ` : ""}${chessMove.san}`;
  const newHistory = `${oldResponse.fromNode.history ? `${oldResponse.fromNode.history} ` : ""}${input.newUci}`;
  // Position keys omit move clocks, whereas a persisted edge must retain the
  // exact FullFen produced by its UCI.  Only that exact state can be reused as
  // this edge's destination.
  const existingDestinationNode = await tx.repertoireNode.findFirst({ where: { repertoireId, fullFen: canonicalFullFen } });
  const isRepetition = existingDestinationNode !== null && (existingDestinationNode.history === "" ||
    (oldResponse.fromNode.history?.startsWith(`${existingDestinationNode.history} `) ?? false));
  let newDestinationNode = existingDestinationNode;
  if (!newDestinationNode) {
    newDestinationNode = await tx.repertoireNode.create({
      data: {
        repertoireId, fullFen: canonicalFullFen, positionKey: posKey, history: newHistory,
        displayPgn: newPgn, routeProb: input.cumProb, cumProb: input.cumProb, siblingIndex: 0
      }
    });
    await claimPosition(tx, repertoireId, posKey, newDestinationNode.id);
  }
  const isTransposition = !isRepetition && newDestinationNode.history !== newHistory;
  const newResponse = await tx.repertoireMove.create({
    data: {
      repertoireId,
      fromNodeId: oldResponse.fromNodeId,
      toNodeId: isRepetition ? null : newDestinationNode.id,
      san: chessMove.san,
      uci: input.newUci,
      playerTurn: "RESPONSE",
      weightedGames: input.newWeightedGames,
      mastersGames: input.newMastersGames ?? null,
      eliteGames: input.newEliteGames ?? null,
      totalMastersGames: input.newTotalMastersGames ?? null,
      mastersMoveShare: input.newMastersMoveShare ?? null,
      totalEliteGames: input.newTotalEliteGames ?? null,
      eliteMoveShare: input.newEliteMoveShare ?? null,
      engineRank: input.newEngineRank ?? null,
      cp: input.newCp,
      mate: input.newMate,
      source: input.newSource,
      selectionMethod: input.newSelectionMethod,
      moveOrigin: input.newMoveOrigin,
      deepVerified: input.newDeepVerified,
      moveProb: null,
      stopReason: isRepetition ? "Repetition" : isTransposition ? "Transposition" : null
    }
  });
  await tx.repertoirePositionStat.upsert({
    where: { repertoireId_nodeId: { repertoireId, nodeId: oldResponse.fromNodeId } },
    update: {
      targetMoveId: newResponse.id,
      positionKey: oldResponse.fromNode.positionKey,
      targetUci: input.newUci,
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
    },
    create: {
      repertoireId,
      nodeId: oldResponse.fromNodeId,
      targetMoveId: newResponse.id,
      positionKey: oldResponse.fromNode.positionKey,
      targetUci: input.newUci,
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
    invalidatedExternalSourceNodeIds,
    createdResponseId: newResponse.id,
    createdDestinationNodeId: isRepetition ? null : newDestinationNode.id,
    createdDestinationFullFen: newDestinationNode.fullFen,
    createdDestinationPgn: newDestinationNode.displayPgn,
    replacementUci: newResponse.uci!,
    replacementSan: newResponse.san
  };
}
