import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Chess } from "chess.js";
import { prisma } from "../db/operations";
import { UserRequestedStopError } from "../api/retry";
import { generateRepertoire } from "./generator";

describe("S0 stop request in the main loop", () => {
  let userId: string;
  let repertoireId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({ data: { username: `s0_stop_${Date.now()}` } });
    userId = user.id;
    const repertoire = await prisma.repertoire.create({ data: { title: "S0 stop", color: "black", userId } });
    repertoireId = repertoire.id;
  });

  afterEach(async () => {
    await prisma.repertoire.deleteMany({ where: { id: repertoireId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("S0.04 S3.01: Ctrl+C during the last position still stops the run", async () => {
    let stopRequested = false;
    let flagReads = 0;
    await assert.rejects(
      generateRepertoire(new Chess().fen(), {
        repertoireId,
        // The root has no games, so the queue is empty once it is processed.
        fetchDatabases: (async () => {
          stopRequested = true;
          return { moves: [], totalGames: 0, positionTotalGames: 0, unaccountedShare: 0, opening: null };
        }) as any,
        fetchOpeningMetadata: async () => null,
        ensureNodeWikibooks: (async () => ({ status: "CACHED", text: null })) as any,
        wait: async () => undefined,
        shouldStop: () => {
          flagReads++;
          return stopRequested;
        }
      }),
      UserRequestedStopError
    );
    assert.equal(flagReads, 2);
  });
});
