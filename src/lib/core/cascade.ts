import { prisma } from "../db/operations";
import type { Config } from "./config";

/** Run-level cascade state. tinyDroppedTotal is zeroed once, at the start of the run (S2.01). */
export type CascadeRunState = {
  cascadeCount: number;
  tinyDroppedTotal: number;
};

type CascadeItem = {
  cascadeId: string;
  fromNode: string;
  toNode: string;
  gainOnThisItem: number;
};

type CascadeConfig = Pick<Config, "probabilityTolerance" | "tinyThreshold" | "nodeTouchCountCap">;

// Probabilities are never rounded when stored or added up, only when printed.
const percent = (value: number) => `${(value * 100).toFixed(6)}%`;
const routeName = (node: { displayPgn: string }) => node.displayPgn || "(root)";

function hardError(message: string): never {
  console.warn(`[WARNING] ${message}`);
  throw new Error(message);
}

/**
 * Ending total + rareDroppedTotal + unaccountedDroppedTotal + tinyDroppedTotal (TR.23, TR.41).
 * An ending is a node with no children at this moment (glossary: ending).
 */
export async function probabilityBalance(repertoireId: string, tinyDroppedTotal: number) {
  const [endings, dropped] = await Promise.all([
    prisma.repertoireNode.aggregate({
      where: { repertoireId, outgoingMoves: { none: {} } },
      _sum: { cumProb: true }
    }),
    prisma.repertoireNode.aggregate({
      where: { repertoireId },
      _sum: { rareDropped: true, unaccountedDropped: true }
    })
  ]);
  return (endings._sum.cumProb ?? 0) + (dropped._sum.rareDropped ?? 0) +
    (dropped._sum.unaccountedDropped ?? 0) + tinyDroppedTotal;
}

/** TR.09 - TR.19: hand a new pointer's cumProb to its owner and spread it down the owner's subtree. */
export async function runCascade(input: {
  repertoireId: string;
  pointerId: string;
  ownerId: string;
  run: CascadeRunState;
  config: CascadeConfig;
}) {
  const { repertoireId, run, config } = input;

  // TR.09
  run.cascadeCount += 1;
  const cascadeId = `C${String(run.cascadeCount).padStart(2, "0")}`;

  // TR.23
  const balanceBefore = await probabilityBalance(repertoireId, run.tinyDroppedTotal);
  const appliedItems: Array<Pick<CascadeItem, "fromNode" | "toNode" | "gainOnThisItem">> = [];
  const touchCounts = new Map<string, number>();
  let revisits = 0;
  let refires = 0;
  let duplicates = 0;
  let tinyDroppedCounter = 0;

  // TR.10
  const pointer = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: input.pointerId } });
  const worklist: CascadeItem[] = [{
    cascadeId,
    fromNode: pointer.id,
    toNode: input.ownerId,
    gainOnThisItem: pointer.cumProb
  }];
  await prisma.repertoireNode.update({ where: { id: pointer.id }, data: { cumProb: 0 } });

  // TR.18
  while (worklist.length > 0) {
    // TR.11
    const item = worklist.shift()!;
    const gain = item.gainOnThisItem;

    // TR.24, TR.37
    if (gain < config.tinyThreshold) {
      tinyDroppedCounter += 1;
      run.tinyDroppedTotal += gain;
      continue;
    }

    const toNode = await prisma.repertoireNode.findUniqueOrThrow({
      where: { id: item.toNode },
      include: {
        incomingMoves: { select: { stopReason: true } },
        outgoingMoves: { select: { toNodeId: true, moveProb: true } }
      }
    });

    // TR.13
    if ((touchCounts.get(toNode.id) ?? 0) > 0) {
      // TR.38
      revisits += 1;
      // TR.39, TR.40
      if (appliedItems.some(applied => applied.fromNode === item.fromNode && applied.toNode === item.toNode &&
          applied.gainOnThisItem !== gain)) {
        refires += 1;
      }
      // TR.26, TR.35
      if (appliedItems.some(applied => applied.fromNode === item.fromNode && applied.toNode === item.toNode &&
          applied.gainOnThisItem === gain)) {
        const fromNode = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: item.fromNode } });
        console.warn(`[WARNING] Duplicate item in cascade ${cascadeId}: ${routeName(fromNode)} --> ${routeName(toNode)}, gain ${percent(gain)}. Applied anyway.`);
        duplicates += 1;
      }
    }

    if (toNode.transposesTo !== null) {
      // TR.32, TR.15: a pointer passes the same gain on to its owner; its cumProb stays 0.
      worklist.push({ cascadeId, fromNode: toNode.id, toNode: toNode.transposesTo, gainOnThisItem: gain });
    } else if (toNode.incomingMoves.some(move => move.stopReason === "Too rare")) {
      // TR.48, TR.45: a dropped node keeps cumProb at 0 (HM.04).
      await prisma.repertoireNode.update({ where: { id: toNode.id }, data: { rareDropped: { increment: gain } } });
    } else {
      // TR.16
      const updated = await prisma.repertoireNode.update({ where: { id: toNode.id }, data: { cumProb: { increment: gain } } });
      // TR.33, TR.34
      if (updated.cumProb > 1 + config.probabilityTolerance) {
        hardError(`cumProb above 100% at ${routeName(toNode)} in cascade ${cascadeId}: ${percent(updated.cumProb)}.`);
      }
    }

    // TR.31
    appliedItems.push({ fromNode: item.fromNode, toNode: item.toNode, gainOnThisItem: gain });
    // TR.17
    const touchCount = (touchCounts.get(toNode.id) ?? 0) + 1;
    touchCounts.set(toNode.id, touchCount);
    // TR.36, TR.43
    if (touchCount > config.nodeTouchCountCap) {
      hardError(`Possible loop: ${routeName(toNode)} touched ${touchCount} times in cascade ${cascadeId}.`);
    }

    // TR.20
    const children = toNode.outgoingMoves.filter(move => move.toNodeId !== null);
    if (children.length === 0) continue;
    // TR.21: White to move means the node's route ends with a Black move.
    if (toNode.fullFen.split(" ")[1] === "w") {
      // TR.25
      for (const child of children) {
        worklist.push({ cascadeId, fromNode: toNode.id, toNode: child.toNodeId!, gainOnThisItem: gain * (child.moveProb ?? 0) });
      }
      // TR.47: the games Explorer lists no move for (EX.05).
      const childShare = children.reduce((total, child) => total + (child.moveProb ?? 0), 0);
      await prisma.repertoireNode.update({
        where: { id: toNode.id },
        data: { unaccountedDropped: { increment: gain * (1 - childShare) } }
      });
    } else {
      // TR.22
      worklist.push({ cascadeId, fromNode: toNode.id, toNode: children[0].toNodeId!, gainOnThisItem: gain });
    }
  }

  // TR.41
  const balanceAfter = await probabilityBalance(repertoireId, run.tinyDroppedTotal);
  if (Math.abs(balanceAfter - balanceBefore) > config.probabilityTolerance) {
    // TR.42, TR.51, TR.52
    if (balanceAfter < balanceBefore) {
      hardError(`Probability went missing in cascade ${cascadeId}: sum ${percent(balanceBefore)} --> ${percent(balanceAfter)}.`);
    }
    hardError(`Probability was created in cascade ${cascadeId}: sum ${percent(balanceBefore)} --> ${percent(balanceAfter)}.`);
  }

  // TR.19
  console.log(`Cascade ${cascadeId} complete. revisits=${revisits}; refires=${refires}; duplicates=${duplicates}; tinyDroppedCounter=${tinyDroppedCounter}`);
  return { cascadeId, revisits, refires, duplicates, tinyDroppedCounter };
}
