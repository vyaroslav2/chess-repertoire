import { prisma, type ResponseEvaluationSource, type ResponseSelectionMethod, type ResponseMoveOrigin } from "../db/operations";
import { ProposedDeepCorrection } from "./deep-verification";
import { parseFullFen, positionKeyFromFen } from "./fen";
import { Chess } from "chess.js";

import { validateResponsePersistence } from "../db/operations";

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
    toNodeId: string;
  };
  proposal: ProposedDeepCorrection;
};

export type CorrectionResult = {
  removedResponseId: string;
  removedNodeCount: number;
  removedMoveCount: number;
  createdResponseId: string;
  createdDestinationNodeId: string;
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

  const chess = new Chess();
  try {
    chess.load(input.failed.fullFen);
  } catch (e) {
    throw new Error("Invalid failed FullFen: " + input.failed.fullFen);
  }
  let chessMove;
  try {
    chessMove = chess.move(input.proposal.uci);
  } catch (e) {
    throw new Error(`Invalid proposal UCI ${input.proposal.uci} for fen ${input.failed.fullFen}`);
  }
  if (input.proposal.san !== chessMove.san) {
    throw new Error(`Proposal SAN ${input.proposal.san} does not match derived SAN ${chessMove.san}`);
  }

  const derivedSan = chessMove.san;
  const derivedFullFen = chess.fen();
  const canonicalFullFen = parseFullFen(derivedFullFen);
  const posKey = positionKeyFromFen(canonicalFullFen);

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
    if (oldResponse.toNode.repertoireId !== input.repertoireId) throw new Error("Stale failed RESPONSE: toNode foreign repertoire");
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

    // 3. Find all descendants to delete
    const nodesToDelete = new Set<string>();
    const movesToDelete = new Set<string>();

    // Breadth First Search to find all reachable nodes from toNodeId
    const queue: Array<{ nodeId: string; parentPgn: string; san: string }> = [
      { nodeId: oldResponse.toNodeId, parentPgn: oldResponse.fromNode.pgn, san: oldResponse.san }
    ];

    while(queue.length > 0) {
      const current = queue.shift()!;
      if (nodesToDelete.has(current.nodeId)) continue; // cycle safety

      const currentNode = await tx.repertoireNode.findUnique({
        where: { id: current.nodeId }
      });
      if (!currentNode) continue;

      if (currentNode.repertoireId !== input.repertoireId) {
        throw new Error("Cross-repertoire node detected");
      }

      const expectedPgn = (current.parentPgn ? current.parentPgn + " " : "") + current.san;
      if (currentNode.pgn !== expectedPgn) {
        // Externally owned canonical node (transposition target).
        // Do not traverse or delete this node. The incoming edge will still be deleted.
        continue;
      }

      nodesToDelete.add(current.nodeId);

      const outgoingEdges = await tx.repertoireMove.findMany({
        where: { fromNodeId: current.nodeId }
      });

      for (const edge of outgoingEdges) {
        if (edge.repertoireId !== input.repertoireId) {
          throw new Error("Cross-repertoire edge detected");
        }
        movesToDelete.add(edge.id);
        queue.push({ nodeId: edge.toNodeId, parentPgn: currentNode.pgn, san: edge.san });
      }
    }

    movesToDelete.add(oldResponse.id);

    // 4. Delete explicitly
    // This deletes the obsolete edges (like oldResponse) that point into externally owned nodes.
    await tx.repertoireMove.deleteMany({
      where: { id: { in: Array.from(movesToDelete) } }
    });

    // Deleting nodes cascades to all descendant edges and stats internally.
    const nodeIdsArray = Array.from(nodesToDelete);
    await tx.repertoireNode.deleteMany({
      where: { id: { in: nodeIdsArray } }
    });

    // 5. Create replacement destination node
    const chess = new Chess();
    try {
      chess.load(oldResponse.fromNode.fullFen);
    } catch (e) {
      throw new Error("Invalid source FullFen: " + oldResponse.fromNode.fullFen);
    }
    let chessMove;
    try {
      chessMove = chess.move(input.proposal.uci);
    } catch (e) {
      throw new Error(`Invalid proposal UCI ${input.proposal.uci} for fen ${oldResponse.fromNode.fullFen}`);
    }

    const derivedSan = chessMove.san;
    const derivedFullFen = chess.fen();
    const canonicalFullFen = parseFullFen(derivedFullFen);
    const posKey = positionKeyFromFen(canonicalFullFen);

    await tx.position.upsert({ where: { positionKey: posKey }, update: {}, create: { positionKey: posKey } });

    const newPgn = (oldResponse.fromNode.pgn ? oldResponse.fromNode.pgn + " " : "") + derivedSan;

    const newDestinationNode = await tx.repertoireNode.create({
      data: {
        repertoireId: input.repertoireId,
        fullFen: canonicalFullFen,
        positionKey: posKey,
        pgn: newPgn.trim(),
        cumulativeProb: oldResponse.fromNode.cumulativeProb
      }
    });

    // 6. Create replacement RESPONSE
    const newResponse = await tx.repertoireMove.create({
      data: {
        repertoireId: input.repertoireId,
        fromNodeId: oldResponse.fromNodeId,
        toNodeId: newDestinationNode.id,
        san: derivedSan,
        uci: input.proposal.uci,
        playerTurn: "RESPONSE",
        weightedCount: null,
        cp: input.proposal.cp,
        mate: input.proposal.mate,
        source: input.proposal.source,
        selectionMethod: input.proposal.selectionMethod,
        moveOrigin: input.proposal.moveOrigin,
        deepVerified: input.proposal.deepVerified,
        localEvaluationProfile: input.proposal.localEvaluationProfile,
        prob: null,
        trueProbability: null
      }
    });

    // 7. Create fresh SRS stat
    await tx.repertoirePositionStat.create({
      data: {
        repertoireId: input.repertoireId,
        nodeId: oldResponse.fromNodeId,
        targetMoveId: newResponse.id,
        reps: 0,
        lapses: 0,
        state: 0,
        due: new Date(),
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        explanation: null,
        tags: null
      }
    });

    return {
      removedResponseId: oldResponse.id,
      removedNodeCount: nodeIdsArray.length,
      removedMoveCount: movesToDelete.size,
      createdResponseId: newResponse.id,
      createdDestinationNodeId: newDestinationNode.id,
      replacementUci: newResponse.uci!
    };
  });
}
