import { Prisma } from "@prisma/client";

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
