import type { Prisma, RepertoireMove } from "@prisma/client";
import { Chess } from "chess.js";
import {
  NOT_WHITE_MOVE_ENDING_NODE,
  WHITE_MOVE_ENDINGS,
  claimPosition,
  prisma,
  type WhiteMoveEnding
} from "../db/operations";
import { parseFullFen, positionKeyFromFen } from "./fen";
import { isValidUciMove } from "./uci";
import { deleteOwnedBranches } from "./rm-structural";

export type OpponentCandidateInput = {
  san: string;
  uci?: string;
  probability: number;
  dropped?: boolean;
};

export type CanonicalOpponentCandidate = {
  uci: string;
  san: string;
  moveProb: number;
  routeProb: number;
  siblingIndex: number;
  dropped: boolean;
  destinationFullFen: string;
  destinationPositionKey: string;
  destinationPgn: string;
  destinationHistory: string;
};

export type ExpectedOpponentEdge = {
  id: string;
  repertoireId: string;
  fromNodeId: string;
  toNodeId: string | null;
  uci: string;
  playerTurn: string;
};

export type ExpectedOpponentSource = {
  id: string;
  repertoireId: string;
  fullFen: string;
  positionKey: string;
  displayPgn: string;
  routeProb: number;
  cumProb: number;
};

export type ReconciledOpponentBranch = CanonicalOpponentCandidate & {
  action: "RETAINED" | "ADDED";
  edgeId: string;
  destinationNodeId: string | null;
  destinationCanonicalPgn: string | null;
  destinationCanonicalFullFen: string | null;
  effectiveCumProb: number;
  /** TR.08: this White move's node is a pointer. */
  isTransposition: boolean;
  /** TR.03: the node that owns the position, when this node is a pointer. */
  ownerNodeId: string | null;
  /** HM.24, HM.29, HM.33: set when this White move ends the route at its own node. */
  ending: WhiteMoveEnding | null;
  /** HM.30: the earlier node on this route that the position repeats. */
  repeatedPgn: string | null;
};

export type ReconcileOpponentBranchesResult = {
  retainedUcis: string[];
  addedUcis: string[];
  removedUcis: string[];
  removedEdgeIds: string[];
  removedNodeIds: string[];
  removedNodeCount: number;
  invalidatedExternalSourceNodeIds: string[];
  branches: ReconciledOpponentBranch[];
};

function validateProbability(value: unknown, label: string, maximumOne: boolean): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (maximumOne && value > 1)) {
    throw new Error(`Invalid OPPONENT ${label}`);
  }
}

function validateCanonicalPgn(pgn: string, label: string): void {
  if (typeof pgn !== "string" || pgn.trim() !== pgn || (pgn !== "" && pgn.split(/\s+/).join(" ") !== pgn)) {
    throw new Error(`Invalid ${label}: PGN is not canonical for the current schema`);
  }
}

function isAncestorHistory(ancestor: string, current: string): boolean {
  return ancestor === "" || current === ancestor || current.startsWith(`${ancestor} `);
}

/** HM.26: mate, stalemate or too little material. Threefold and fifty-move are ignored (glossary: repetition). */
export function isGameOverPosition(fullFen: string): boolean {
  const chess = new Chess(fullFen);
  return chess.isCheckmate() || chess.isStalemate() || chess.isInsufficientMaterial();
}

function applyOpponentMove(fullFen: string, uci: string) {
  if (!isValidUciMove(uci)) throw new Error(`Invalid OPPONENT UCI/LAN move ${uci}`);
  const chess = new Chess(fullFen);
  let move;
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    throw new Error(`Illegal OPPONENT UCI/LAN move ${uci}`);
  }
  if (!move || move.lan !== uci) throw new Error(`Illegal OPPONENT UCI/LAN move ${uci}`);
  const destinationFullFen = parseFullFen(chess.fen());
  return {
    uci: move.lan,
    san: move.san,
    destinationFullFen,
    destinationPositionKey: positionKeyFromFen(destinationFullFen)
  };
}

export function canonicalizeOpponentCandidates(input: {
  sourceFullFen: string;
  sourcePgn: string;
  sourceHistory?: string;
  sourceRouteProb: number;
  sourceCumProb: number;
  candidates: OpponentCandidateInput[];
}): CanonicalOpponentCandidate[] {
  const canonicalSource = parseFullFen(input.sourceFullFen);
  if (canonicalSource !== input.sourceFullFen) throw new Error("Invalid OPPONENT source: FullFen is not canonical");
  validateCanonicalPgn(input.sourcePgn, "OPPONENT source");
  validateProbability(input.sourceRouteProb, "source route probability", false);
  validateProbability(input.sourceCumProb, "source cumulative probability", false);

  const seenUcis = new Set<string>();
  return input.candidates.map((candidate, siblingIndex) => {
    validateProbability(candidate.probability, "candidate probability", true);
    if (typeof candidate.san !== "string" || candidate.san.trim() === "") {
      throw new Error("Invalid OPPONENT candidate SAN");
    }

    const chess = new Chess(canonicalSource);
    let move;
    try {
      move = candidate.uci
        ? chess.move({ from: candidate.uci.slice(0, 2), to: candidate.uci.slice(2, 4), promotion: candidate.uci[4] })
        : chess.move(candidate.san);
    } catch {
      throw new Error(`Illegal OPPONENT candidate ${candidate.uci ?? candidate.san}`);
    }
    if (!move || (candidate.uci !== undefined && move.lan !== candidate.uci) || move.san !== candidate.san) {
      throw new Error(`OPPONENT candidate UCI/SAN mismatch for ${candidate.uci ?? candidate.san}`);
    }
    if (seenUcis.has(move.lan)) throw new Error(`Duplicate current OPPONENT UCI candidate ${move.lan}`);
    seenUcis.add(move.lan);

    const destinationFullFen = parseFullFen(chess.fen());
    return {
      uci: move.lan,
      san: move.san,
      moveProb: candidate.probability,
      // HM.06: routeProb = parent.routeProb * moveProb.
      routeProb: input.sourceRouteProb * candidate.probability,
      // HM.05 / DB.16: candidates arrive most popular first; the index starts at 1.
      siblingIndex: siblingIndex + 1,
      dropped: candidate.dropped ?? false,
      destinationFullFen,
      destinationPositionKey: positionKeyFromFen(destinationFullFen),
      destinationPgn: `${input.sourcePgn ? `${input.sourcePgn} ` : ""}${move.san}`,
      destinationHistory: `${(input.sourceHistory ?? input.sourcePgn) ? `${input.sourceHistory ?? input.sourcePgn} ` : ""}${move.lan}`
    };
  });
}

function assertSourceState(source: ExpectedOpponentSource): void {
  const canonicalFullFen = parseFullFen(source.fullFen);
  if (canonicalFullFen !== source.fullFen) throw new Error("Invalid OPPONENT source: FullFen is not canonical");
  if (positionKeyFromFen(canonicalFullFen) !== source.positionKey) {
    throw new Error("Invalid OPPONENT source: PositionKey does not match FullFen");
  }
  validateCanonicalPgn(source.displayPgn, "OPPONENT source");
  validateProbability(source.routeProb, "source route probability", false);
  validateProbability(source.cumProb, "source cumulative probability", false);
}

async function validateStoredOpponentEdge(
  tx: Prisma.TransactionClient,
  source: ExpectedOpponentSource,
  edge: RepertoireMove
) {
  if (edge.playerTurn !== "OPPONENT") throw new Error("Malformed stored OPPONENT edge: wrong playerTurn");
  if (edge.repertoireId !== source.repertoireId || edge.fromNodeId !== source.id) {
    throw new Error("Malformed stored OPPONENT edge: repertoire/source ownership mismatch");
  }
  if (!edge.uci) throw new Error("Malformed stored OPPONENT edge: missing UCI/LAN");
  const derived = applyOpponentMove(source.fullFen, edge.uci);
  if (derived.san !== edge.san) throw new Error("Malformed stored OPPONENT edge: SAN does not match UCI/LAN");
  validateProbability(edge.moveProb, "stored moveProb", true);
  if (edge.toNodeId === null) throw new Error("Malformed stored OPPONENT edge: destination is missing");
  const destination = await tx.repertoireNode.findUnique({ where: { id: edge.toNodeId } });
  if (!destination) throw new Error("Malformed stored OPPONENT edge: destination is missing");
  if (destination.repertoireId !== source.repertoireId) {
    throw new Error("Malformed stored OPPONENT edge: destination belongs to another repertoire");
  }
  const canonicalDestinationFullFen = parseFullFen(destination.fullFen);
  if (canonicalDestinationFullFen !== destination.fullFen ||
      positionKeyFromFen(canonicalDestinationFullFen) !== destination.positionKey) {
    throw new Error("Malformed stored OPPONENT edge: destination FullFen/PositionKey is inconsistent");
  }
  if (derived.destinationFullFen !== destination.fullFen) {
    throw new Error("Malformed stored OPPONENT edge: destination FullFen does not match UCI/LAN");
  }
  return destination;
}

function assertExpectedStoredSet(
  source: ExpectedOpponentSource,
  expected: ExpectedOpponentEdge[],
  actual: Array<{ id: string; repertoireId: string; fromNodeId: string; toNodeId: string | null; uci: string | null; playerTurn: string }>
) {
  const expectedById = new Map<string, ExpectedOpponentEdge>();
  for (const edge of expected) {
    if (expectedById.has(edge.id)) throw new Error(`Duplicate expected OPPONENT edge ${edge.id}`);
    expectedById.set(edge.id, edge);
  }
  if (expected.length !== actual.length) throw new Error("Stale stored OPPONENT set: edge count changed");
  for (const edge of actual) {
    const expectedEdge = expectedById.get(edge.id);
    if (!expectedEdge) throw new Error(`Stale stored OPPONENT set: unexpected edge ${edge.id}`);
    if (expectedEdge.repertoireId !== source.repertoireId || expectedEdge.fromNodeId !== source.id ||
        edge.repertoireId !== expectedEdge.repertoireId || edge.fromNodeId !== expectedEdge.fromNodeId ||
        edge.toNodeId !== expectedEdge.toNodeId || edge.uci !== expectedEdge.uci ||
        edge.playerTurn !== expectedEdge.playerTurn) {
      throw new Error(`Stale stored OPPONENT set: edge ${edge.id} changed`);
    }
  }
}

export async function readExpectedOpponentEdges(sourceNodeId: string): Promise<ExpectedOpponentEdge[]> {
  const edges = await prisma.repertoireMove.findMany({
    where: { fromNodeId: sourceNodeId, playerTurn: "OPPONENT" },
    orderBy: [{ uci: "asc" }, { id: "asc" }]
  });
  return edges.map(edge => ({
    id: edge.id,
    repertoireId: edge.repertoireId,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    uci: edge.uci ?? "",
    playerTurn: edge.playerTurn
    }));
}

export async function reconcileOpponentBranches(input: {
  repertoireId: string;
  expectedSource: ExpectedOpponentSource;
  expectedStoredEdges: ExpectedOpponentEdge[];
  recomputedCandidates: CanonicalOpponentCandidate[];
}): Promise<ReconcileOpponentBranchesResult> {
  if (input.expectedSource.repertoireId !== input.repertoireId) {
    throw new Error("OPPONENT source repertoire does not match reconciliation repertoire");
  }
  assertSourceState(input.expectedSource);

  const currentByUci = new Map<string, CanonicalOpponentCandidate>();
  for (const candidate of input.recomputedCandidates) {
    if (currentByUci.has(candidate.uci)) throw new Error(`Duplicate current OPPONENT UCI candidate ${candidate.uci}`);
    const derived = applyOpponentMove(input.expectedSource.fullFen, candidate.uci);
    validateProbability(candidate.moveProb, "candidate moveProb", true);
    validateProbability(candidate.routeProb, "candidate routeProb", false);
    if (candidate.routeProb !== input.expectedSource.routeProb * candidate.moveProb ||
        candidate.san !== derived.san || candidate.destinationFullFen !== derived.destinationFullFen ||
        candidate.destinationPositionKey !== derived.destinationPositionKey ||
        candidate.destinationPgn !== `${input.expectedSource.displayPgn ? `${input.expectedSource.displayPgn} ` : ""}${derived.san}`) {
      throw new Error(`Invalid recomputed OPPONENT candidate state for ${candidate.uci}`);
    }
    currentByUci.set(candidate.uci, candidate);
  }

  return prisma.$transaction(async tx => {
    const source = await tx.repertoireNode.findUnique({ where: { id: input.expectedSource.id } });
    if (!source) throw new Error("Stale OPPONENT source: node disappeared");
    if (source.repertoireId !== input.repertoireId || source.repertoireId !== input.expectedSource.repertoireId) {
      throw new Error("Stale OPPONENT source: repertoire ownership changed");
    }
    if (source.fullFen !== input.expectedSource.fullFen || source.positionKey !== input.expectedSource.positionKey ||
        source.displayPgn !== input.expectedSource.displayPgn || source.routeProb !== input.expectedSource.routeProb ||
        source.cumProb !== input.expectedSource.cumProb) {
      throw new Error("Stale OPPONENT source: canonical state changed");
    }
    assertSourceState(source);

    const actualEdges = await tx.repertoireMove.findMany({
      where: { fromNodeId: source.id, playerTurn: "OPPONENT" },
      orderBy: [{ uci: "asc" }, { id: "asc" }]
    });
    assertExpectedStoredSet(input.expectedSource, input.expectedStoredEdges, actualEdges);

    const storedByUci = new Map<string, typeof actualEdges[number]>();
    for (const edge of actualEdges) {
      await validateStoredOpponentEdge(tx, input.expectedSource, edge);
      if (!edge.uci) throw new Error("Malformed stored OPPONENT edge: missing UCI/LAN");
      if (storedByUci.has(edge.uci)) throw new Error(`Malformed stored OPPONENT set: duplicate UCI ${edge.uci}`);
      storedByUci.set(edge.uci, edge);
    }

    const retainedUcis = [...currentByUci.keys()].filter(uci => storedByUci.has(uci)).sort();
    const addedUcis = [...currentByUci.keys()].filter(uci => !storedByUci.has(uci)).sort();
    const removedUcis = [...storedByUci.keys()].filter(uci => !currentByUci.has(uci)).sort();
    const removedEdges = removedUcis.map(uci => storedByUci.get(uci)!);

    // Complete stale/current set validation and structural ownership discovery happens
    // before the first mutation, so any later hard error rolls the entire source update back.
    const deleted = await deleteOwnedBranches({
      tx,
      repertoireId: input.repertoireId,
      roots: removedEdges.flatMap(edge => edge.toNodeId === null ? [] : [{
        edgeId: edge.id,
        nodeId: edge.toNodeId,
        parentPgn: source.displayPgn,
        san: edge.san
      }])
    });
    const removedTerminalIds = removedEdges.filter(edge => edge.toNodeId === null).map(edge => edge.id);
    if (removedTerminalIds.length > 0) {
      await tx.repertoireMove.deleteMany({ where: { id: { in: removedTerminalIds } } });
    }

    const branches: ReconciledOpponentBranch[] = [];
    for (const candidate of [...input.recomputedCandidates].sort((a, b) => a.uci.localeCompare(b.uci))) {
      const stored = storedByUci.get(candidate.uci);
      // HM.20: the checks run in a fixed order: too rare, game over, repetition, then transposition.
      let ending: WhiteMoveEnding | null = null;
      let repeatedPgn: string | null = null;
      if (candidate.dropped) {
        ending = "Too rare"; // HM.21
      } else if (isGameOverPosition(candidate.destinationFullFen)) {
        ending = "Game over"; // HM.26
      } else {
        // HM.30: the position already appears earlier on this route.
        const samePosition = await tx.repertoireNode.findMany({
          where: { repertoireId: input.repertoireId, positionKey: candidate.destinationPositionKey, ...NOT_WHITE_MOVE_ENDING_NODE },
          orderBy: { displayPgn: "asc" }
        });
        const repeated = samePosition.find(node => isAncestorHistory(node.displayPgn, source.displayPgn));
        if (repeated) {
          ending = "Repetition";
          repeatedPgn = repeated.displayPgn;
        }
      }
      const storedEnding = WHITE_MOVE_ENDINGS.find(reason => reason === stored?.stopReason) ?? null;
      if (stored && storedEnding !== ending) {
        throw new Error(`Stored OPPONENT ${candidate.uci} changed how its route ends and requires branch rebuild`);
      }
      if (ending) {
        // HM.25: the move still gets its own node, with cumProb = parent.cumProb * moveProb.
        // HM.23: a dropped move's cumProb is held at 0 and what arrives goes to rareDropped.
        // HM.28, HM.32: a game-over or repetition node is an ending and keeps its cumProb.
        // None of them owns a position, and a repetition points nowhere (HM.N.04).
        const arrivingProb = source.cumProb * candidate.moveProb;
        const probability = ending === "Too rare"
          ? { cumProb: 0, rareDropped: arrivingProb }
          : { cumProb: arrivingProb };
        let edge;
        let node;
        if (stored) {
          edge = await tx.repertoireMove.update({
            where: { id: stored.id },
            data: { san: candidate.san, moveProb: candidate.moveProb }
          });
          node = await tx.repertoireNode.update({ where: { id: stored.toNodeId! }, data: probability });
        } else {
          node = await tx.repertoireNode.create({
            data: {
              repertoireId: input.repertoireId,
              fullFen: candidate.destinationFullFen,
              positionKey: candidate.destinationPositionKey,
              history: candidate.destinationHistory,
              displayPgn: candidate.destinationPgn,
              routeProb: candidate.routeProb,
              ...probability,
              siblingIndex: candidate.siblingIndex
            }
          });
          edge = await tx.repertoireMove.create({
            data: {
              repertoireId: source.repertoireId,
              fromNodeId: source.id,
              toNodeId: node.id,
              uci: candidate.uci,
              san: candidate.san,
              playerTurn: "OPPONENT",
              moveProb: candidate.moveProb,
              stopReason: ending
            }
          });
        }
        branches.push({
          ...candidate,
          action: stored ? "RETAINED" : "ADDED",
          edgeId: edge.id,
          destinationNodeId: node.id,
          destinationCanonicalPgn: node.displayPgn,
          destinationCanonicalFullFen: node.fullFen,
          effectiveCumProb: node.cumProb,
          isTransposition: false,
          ownerNodeId: null,
          ending,
          repeatedPgn
        });
        continue;
      }
      if (stored) {
        if (stored.toNodeId === null) throw new Error("Stored OPPONENT edge is missing its destination");
        const retainedDestination = await tx.repertoireNode.findUnique({ where: { id: stored.toNodeId } });
        if (!retainedDestination) {
          throw new Error("Retained OPPONENT destination was removed with an obsolete canonical owner");
        }
        const isTransposition = retainedDestination.transposesTo !== null;
        const updated = await tx.repertoireMove.update({
          where: { id: stored.id },
          data: {
            san: candidate.san,
            moveProb: candidate.moveProb,
            stopReason: isTransposition ? "Transposition" : null
          }
        });
        const effectiveCumProb = retainedDestination.cumProb;
        branches.push({
          ...candidate,
          action: "RETAINED",
          edgeId: updated.id,
          destinationNodeId: retainedDestination.id,
          destinationCanonicalPgn: retainedDestination.displayPgn,
          destinationCanonicalFullFen: retainedDestination.fullFen,
          effectiveCumProb,
          isTransposition,
          ownerNodeId: retainedDestination.transposesTo,
          ending: null,
          repeatedPgn: null
        });
        continue;
      }

      // HM.25: every returned White move gets its own node.
      let destination = await tx.repertoireNode.create({
        data: {
          repertoireId: input.repertoireId,
          fullFen: candidate.destinationFullFen,
          positionKey: candidate.destinationPositionKey,
          history: candidate.destinationHistory,
          displayPgn: candidate.destinationPgn,
          routeProb: candidate.routeProb,
          // HM.25: until a cascade reaches the parent, this equals routeProb.
          cumProb: source.cumProb * candidate.moveProb,
          siblingIndex: candidate.siblingIndex
        }
      });
      // TR.02, TR.03: an earlier node may already own this positionKey (DB.36).
      // TR.06, TR.07: if not, this node takes the row and keeps transposesTo = null.
      const ownerNodeId = await claimPosition(tx, input.repertoireId, candidate.destinationPositionKey, destination.id);
      const isTransposition = ownerNodeId !== destination.id;
      if (isTransposition) {
        // TR.08: this node is now a pointer; its route stops here.
        destination = await tx.repertoireNode.update({ where: { id: destination.id }, data: { transposesTo: ownerNodeId } });
      }
      const created = await tx.repertoireMove.create({
        data: {
          repertoireId: source.repertoireId,
          fromNodeId: source.id,
          toNodeId: destination.id,
          uci: candidate.uci,
          san: candidate.san,
          playerTurn: "OPPONENT",
          moveProb: candidate.moveProb,
          stopReason: isTransposition ? "Transposition" : null
        }
      });
      branches.push({
        ...candidate,
        action: "ADDED",
        edgeId: created.id,
        destinationNodeId: destination.id,
        destinationCanonicalPgn: destination.displayPgn,
        destinationCanonicalFullFen: destination.fullFen,
        effectiveCumProb: destination.cumProb,
        isTransposition,
        ownerNodeId: isTransposition ? ownerNodeId : null,
        ending: null,
        repeatedPgn: null
      });
    }

    return {
      retainedUcis,
      addedUcis,
      removedUcis,
      removedEdgeIds: removedEdges.map(edge => edge.id),
      removedNodeIds: [...deleted.nodesToDelete].sort(),
      removedNodeCount: deleted.nodesToDelete.size,
      invalidatedExternalSourceNodeIds: [...deleted.invalidatedExternalSourceNodeIds],
      branches
    };
  });
}
