import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../db/operations";
import { applyApprovedDeepCorrection, type CorrectionInput } from "./rm-correction";
import { ProposedDeepCorrection } from "./deep-verification";
import { parseFullFen, positionKeyFromFen } from "./fen";

const profile = "TEST_PROFILE_2";

async function createDummyRepertoire() {
    const user = await prisma.user.create({ data: { username: "test_user_"+Math.random() }});
    const repertoire = await prisma.repertoire.create({
        data: { title: "test", color: "white", userId: user.id }
    });
    return repertoire.id;
}

async function createNode(repertoireId: string, fullFen: string, pgn: string) {
    const canonical = parseFullFen(fullFen);
    const key = positionKeyFromFen(canonical);
    await prisma.position.upsert({ where: { positionKey: key }, update: {}, create: { positionKey: key }});
    return await prisma.repertoireNode.create({
        data: { repertoireId, fullFen: canonical, positionKey: key, pgn, cumulativeProb: 1 }
    });
}

test('Correction: rejects identical UCI', async () => {
    const repId = await createDummyRepertoire();
    const proposal: ProposedDeepCorrection = { uci: "e2e4", san: "e4", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "e2e4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: repId, failed: { responseId: "dummy", uci: "e2e4", fullFen: "fen", cp: 10, mate: null, source: "Local Deep Stockfish" , fromNodeId: "dummy", toNodeId: "dummy" }, proposal };
    await assert.rejects(applyApprovedDeepCorrection(input), /Cannot destructively replace a move with itself/);
});

test('Correction: validates stale RESPONSE state (wrong repertoire)', async () => {
    const rep1 = await createDummyRepertoire();
    const rep2 = await createDummyRepertoire();
    const root = await createNode(rep1, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(rep1, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");
    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: rep1, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish" }
    });
    const proposal: ProposedDeepCorrection = { uci: "d2d4", san: "d4", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: rep2, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish" , fromNodeId: failedMove.fromNodeId, toNodeId: failedMove.toNodeId }, proposal };
    await assert.rejects(applyApprovedDeepCorrection(input), /Stale failed RESPONSE: not found or wrong repertoire/);
});

test('Correction: validates stale RESPONSE state (changed deepVerified)', async () => {
    const repId = await createDummyRepertoire();
    const root = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(repId, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");
    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", deepVerified: true }
    });
    const proposal: ProposedDeepCorrection = { uci: "d2d4", san: "d4", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: repId, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish" , fromNodeId: failedMove.fromNodeId, toNodeId: failedMove.toNodeId }, proposal };
    await assert.rejects(applyApprovedDeepCorrection(input), /Stale failed RESPONSE: already deepVerified/);
});

test('Correction: cross-repertoire edge triggers hard error and rollback', async () => {
    const rep1 = await createDummyRepertoire();
    const rep2 = await createDummyRepertoire();
    const root = await createNode(rep1, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(rep1, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");
    const child2 = await createNode(rep2, "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", "e4 c5");

    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: rep1, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    await prisma.repertoireMove.create({
        data: { repertoireId: rep2, fromNodeId: child.id, toNodeId: child2.id, san: "c5", uci: "c7c5", playerTurn: "OPPONENT" }
    });

    await prisma.localEngineBaseline.upsert({
        where: { fullFen_evaluationProfile: { fullFen: root.fullFen, evaluationProfile: profile } }, update: { cp: 20, bestUci: "d2d4" },
        create: { fullFen: root.fullFen, evaluationProfile: profile, bestUci: "d2d4", cp: 20, mate: null }
    });

    const proposal: ProposedDeepCorrection = { uci: "d2d4", san: "d4", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: rep1, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish" , fromNodeId: failedMove.fromNodeId, toNodeId: failedMove.toNodeId }, proposal };

    await assert.rejects(applyApprovedDeepCorrection(input), /Cross-repertoire edge detected/);

    const moveExists = await prisma.repertoireMove.findUnique({ where: { id: failedMove.id }});
    assert.ok(moveExists);
});

test('Correction: missing local engine candidate throws error', async () => {
    const repId = await createDummyRepertoire();
    const root = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(repId, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");
    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    await prisma.localEngineBaseline.upsert({
        where: { fullFen_evaluationProfile: { fullFen: root.fullFen, evaluationProfile: profile } }, update: { cp: 20, bestUci: "d2d4" },
        create: { fullFen: root.fullFen, evaluationProfile: profile, bestUci: "d2d4", cp: 20, mate: null }
    });

    const proposal: ProposedDeepCorrection = { uci: "d2d4", san: "d4", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Human Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: repId, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish" , fromNodeId: failedMove.fromNodeId, toNodeId: failedMove.toNodeId }, proposal };

    await assert.rejects(applyApprovedDeepCorrection(input), /Stale proposal: LocalEngineCandidate missing/);
});

test('Correction: completely fresh SRS initialization', async () => {
    const repId = await createDummyRepertoire();
    const root = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(repId, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");
    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    await prisma.localEngineBaseline.upsert({
        where: { fullFen_evaluationProfile: { fullFen: root.fullFen, evaluationProfile: profile } }, update: { cp: 20, bestUci: "d2d4" },
        create: { fullFen: root.fullFen, evaluationProfile: profile, bestUci: "d2d4", cp: 20, mate: null }
    });

    const proposal: ProposedDeepCorrection = { uci: "d2d4", san: "d4", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: repId, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish" , fromNodeId: failedMove.fromNodeId, toNodeId: failedMove.toNodeId }, proposal };

    const res = await applyApprovedDeepCorrection(input);
    const stat = await prisma.repertoirePositionStat.findFirst({ where: { targetMoveId: res.createdResponseId }});
    assert.ok(stat);
    assert.equal(stat.reps, 0);
    assert.equal(stat.lapses, 0);
    assert.equal(stat.stability, 0);
    assert.equal(stat.difficulty, 0);
    assert.equal(stat.elapsed_days, 0);
    assert.equal(stat.scheduled_days, 0);
    assert.equal(stat.state, 0);
    assert.equal(stat.explanation, null);
    assert.equal(stat.tags, null);
});

test('applyApprovedDeepCorrection handles cycle safety, deletes subgraphs and creates replacement', async () => {
    const repId = await createDummyRepertoire();
    const root = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child1 = await createNode(repId, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");
    const child2 = await createNode(repId, "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", "e4 c5");

    const child3 = await createNode(repId, "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2", "e4 c5 loop1");

    const failedMove = await prisma.repertoireMove.create({
        data: {
            repertoireId: repId,
            fromNodeId: root.id,
            toNodeId: child1.id,
            san: "e4",
            uci: "e2e4",
            playerTurn: "RESPONSE",
            cp: 10,
            mate: null,
            source: "Local Deep Stockfish",
            selectionMethod: "Ordinary API",
            moveOrigin: "Engine Move",
            deepVerified: false,
            localEvaluationProfile: profile,
            weightedCount: 1.5
        }
    });

    const downstreamMove = await prisma.repertoireMove.create({
        data: {
            repertoireId: repId,
            fromNodeId: child1.id,
            toNodeId: child2.id,
            san: "c5",
            uci: "c7c5",
            playerTurn: "OPPONENT",
        }
    });

    const loopMove1 = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: child2.id, toNodeId: child3.id, san: "loop1", playerTurn: "RESPONSE" }
    });
    const loopMove2 = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: child3.id, toNodeId: child2.id, san: "loop2", playerTurn: "OPPONENT" }
    });

    const oldStat = await prisma.repertoirePositionStat.create({
        data: {
            repertoireId: repId,
            nodeId: root.id,
            targetMoveId: failedMove.id,
            reps: 5,
            explanation: "old explanation"
        }
    });

    await prisma.localEngineBaseline.upsert({
        where: { fullFen_evaluationProfile: { fullFen: root.fullFen, evaluationProfile: profile } }, update: { cp: 20, bestUci: "d2d4" },
        create: { fullFen: root.fullFen, evaluationProfile: profile, bestUci: "d2d4", cp: 20, mate: null }
    });

    const proposal: ProposedDeepCorrection = {
        uci: "d2d4", san: "d4", cp: 20, mate: null,
        source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification",
        moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile,
        baselineUci: "d2d4", baselineCp: 20, baselineMate: null
    };

    const input: CorrectionInput = {
        repertoireId: repId,
        failed: {
            responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish"
        , fromNodeId: failedMove.fromNodeId, toNodeId: failedMove.toNodeId },
        proposal
    };

    const res = await applyApprovedDeepCorrection(input);

    assert.equal(res.removedResponseId, failedMove.id);
    assert.equal(res.removedNodeCount, 3); // child1, child2, child3
    assert.equal(res.removedMoveCount, 4); // failedMove, downstreamMove, loop1, loop2
    assert.equal(res.replacementUci, "d2d4");

    const oldNode = await prisma.repertoireNode.findUnique({ where: { id: child1.id } });
    assert.equal(oldNode, null, "Old destination node should be deleted");

    const newResponse = await prisma.repertoireMove.findUnique({ where: { id: res.createdResponseId } });
    assert.ok(newResponse);
    assert.equal(newResponse.uci, "d2d4");
    assert.equal(newResponse.deepVerified, true);
    assert.equal(newResponse.weightedCount, null, "Weighted count reset to null");

    const oldStatCheck = await prisma.repertoirePositionStat.findUnique({ where: { id: oldStat.id } });
    assert.ok(oldStatCheck, "The history-specific card should be reset in place");

    const newStatCheck = await prisma.repertoirePositionStat.findFirst({ where: { targetMoveId: newResponse.id } });
    assert.ok(newStatCheck);
    assert.equal(newStatCheck.id, oldStat.id);
    assert.equal(newStatCheck.reps, 0, "New stat should have reps 0");
    assert.equal(newStatCheck.explanation, null, "New stat should not inherit explanation");
});


test('Correction: preserves externally owned canonical node (transposition target)', async () => {
    const repId = await createDummyRepertoire();
    const root = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child1 = await createNode(repId, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");

    // Externally owned canonical node
    const sharedTarget = await createNode(repId, "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", "d4 c5");

    // The move that reached child1 (this is the failed move)
    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: root.id, toNodeId: child1.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    // The obsolete edge from child1 to the sharedTarget (transposition)
    await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: child1.id, toNodeId: sharedTarget.id, san: "c5", uci: "c7c5", playerTurn: "OPPONENT" }
    });

    // Create an edge out of sharedTarget
    const safeEdge = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: sharedTarget.id, toNodeId: root.id, san: "Nf3", uci: "g1f3", playerTurn: "RESPONSE" }
    });

    await prisma.localEngineBaseline.upsert({
        where: { fullFen_evaluationProfile: { fullFen: root.fullFen, evaluationProfile: profile } }, update: { cp: 20, bestUci: "d2d4" },
        create: { fullFen: root.fullFen, evaluationProfile: profile, bestUci: "d2d4", cp: 20, mate: null }
    });

    const proposal: ProposedDeepCorrection = {
        uci: "d2d4", san: "d4", cp: 20, mate: null,
        source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification",
        moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile,
        baselineUci: "d2d4", baselineCp: 20, baselineMate: null
    };
    const input: CorrectionInput = { repertoireId: repId, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish" , fromNodeId: failedMove.fromNodeId, toNodeId: failedMove.toNodeId }, proposal };

    await applyApprovedDeepCorrection(input);

    const safeNode = await prisma.repertoireNode.findUnique({ where: { id: sharedTarget.id } });
    assert.ok(safeNode, "Externally owned canonical node must survive");

    const safeEdgeCheck = await prisma.repertoireMove.findUnique({ where: { id: safeEdge.id } });
    assert.ok(safeEdgeCheck, "Continuation of externally owned node must survive");
});

test('Correction: rejects stale baseline', async () => {
    const repId = await createDummyRepertoire();
    const root = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(repId, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");
    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    await prisma.localEngineBaseline.upsert({
        where: { fullFen_evaluationProfile: { fullFen: root.fullFen, evaluationProfile: profile } }, update: { cp: 15, bestUci: "d2d4" },
        create: { fullFen: root.fullFen, evaluationProfile: profile, bestUci: "d2d4", cp: 15, mate: null }
    });

    const proposal: ProposedDeepCorrection = { uci: "d2d4", san: "d4", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: repId, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish" , fromNodeId: failedMove.fromNodeId, toNodeId: failedMove.toNodeId }, proposal };

    await assert.rejects(applyApprovedDeepCorrection(input), /Stale proposal: baseline evaluation changed/);
});

test('Correction: runtime-validates proposal before mutation', async () => {
    const repId = await createDummyRepertoire();
    const root = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(repId, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");
    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    // Valid setup
    await prisma.localEngineBaseline.upsert({
        where: { fullFen_evaluationProfile: { fullFen: root.fullFen, evaluationProfile: profile } }, update: { cp: 20, bestUci: "d2d4" },
        create: { fullFen: root.fullFen, evaluationProfile: profile, bestUci: "d2d4", cp: 20, mate: null }
    });

    const proposal: ProposedDeepCorrection = { uci: "d2d4", san: "Nf3", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: repId, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish" , fromNodeId: failedMove.fromNodeId, toNodeId: failedMove.toNodeId }, proposal };

    // SAN mismatch error because UCI d2d4 derives to 'd4', not 'Nf3'
    await assert.rejects(applyApprovedDeepCorrection(input), /Proposal SAN Nf3 does not match derived SAN d4/);
});

test('Correction: rejects stale fromNodeId', async () => {
    const repId = await createDummyRepertoire();
    const root = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const otherRoot = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1", "d4"); // fixed pgn
    const child = await createNode(repId, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");

    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    await prisma.localEngineBaseline.upsert({
        where: { fullFen_evaluationProfile: { fullFen: root.fullFen, evaluationProfile: profile } }, update: { cp: 20, bestUci: "d2d4" },
        create: { fullFen: root.fullFen, evaluationProfile: profile, bestUci: "d2d4", cp: 20, mate: null }
    });

    const proposal: ProposedDeepCorrection = { uci: "d2d4", san: "d4", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: repId, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish", fromNodeId: otherRoot.id, toNodeId: child.id }, proposal };

    await assert.rejects(applyApprovedDeepCorrection(input), /Stale failed RESPONSE: fromNodeId changed/);
});

test('Correction: rejects stale toNodeId', async () => {
    const repId = await createDummyRepertoire();
    const root = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(repId, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");
    const otherChild = await createNode(repId, "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1", "d4");

    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    await prisma.localEngineBaseline.upsert({
        where: { fullFen_evaluationProfile: { fullFen: root.fullFen, evaluationProfile: profile } }, update: { cp: 20, bestUci: "d2d4" },
        create: { fullFen: root.fullFen, evaluationProfile: profile, bestUci: "d2d4", cp: 20, mate: null }
    });

    const proposal: ProposedDeepCorrection = { uci: "d2d4", san: "d4", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: repId, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish", fromNodeId: root.id, toNodeId: otherChild.id }, proposal };

    await assert.rejects(applyApprovedDeepCorrection(input), /Stale failed RESPONSE: toNodeId changed/);
});

test('Correction: Engine Move proposal exact baseline validation', async () => {
    const repId = await createDummyRepertoire();
    const root = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(repId, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");
    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    await prisma.localEngineBaseline.upsert({
        where: { fullFen_evaluationProfile: { fullFen: root.fullFen, evaluationProfile: profile } }, update: { cp: 20, bestUci: "d2d4" },
        create: { fullFen: root.fullFen, evaluationProfile: profile, bestUci: "d2d4", cp: 20, mate: null }
    });

    // Valid move so it passes basic move generation validation, but with the wrong evaluation.
    const proposal: ProposedDeepCorrection = { uci: "g1f3", san: "Nf3", cp: 50, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: repId, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish", fromNodeId: root.id, toNodeId: child.id }, proposal };

    await assert.rejects(applyApprovedDeepCorrection(input), /Stale proposal: engine proposal uci changed|engine proposal cp changed/);
});

test('Correction: rejects failed RESPONSE with foreign fromNode', async () => {
    const rep1 = await createDummyRepertoire();
    const rep2 = await createDummyRepertoire();

    // foreign fromNode
    const root = await createNode(rep2, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(rep1, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");

    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: rep1, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    await prisma.localEngineBaseline.upsert({
        where: { fullFen_evaluationProfile: { fullFen: root.fullFen, evaluationProfile: profile } }, update: { cp: 20, bestUci: "d2d4" },
        create: { fullFen: root.fullFen, evaluationProfile: profile, bestUci: "d2d4", cp: 20, mate: null }
    });

    const proposal: ProposedDeepCorrection = { uci: "g1f3", san: "Nf3", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: rep1, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish", fromNodeId: root.id, toNodeId: child.id }, proposal };

    await assert.rejects(applyApprovedDeepCorrection(input), /Stale failed RESPONSE: fromNode foreign repertoire/);
});

test('Correction: BFS rejects traversal of foreign node on a local edge', async () => {
    const rep1 = await createDummyRepertoire();
    const rep2 = await createDummyRepertoire();

    const root = await createNode(rep1, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(rep1, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");
    // destination node belongs to rep2!
    const grandChild = await createNode(rep2, "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", "e4 e5");

    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: rep1, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    // An edge belonging to rep1 but pointing to a node in rep2
    await prisma.repertoireMove.create({
        data: { repertoireId: rep1, fromNodeId: child.id, toNodeId: grandChild.id, san: "e5", uci: "e7e5", playerTurn: "CHALLENGE", cp: null, source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Human Move", deepVerified: false, localEvaluationProfile: null }
    });

    await prisma.localEngineBaseline.upsert({
        where: { fullFen_evaluationProfile: { fullFen: root.fullFen, evaluationProfile: profile } }, update: { cp: 20, bestUci: "d2d4" },
        create: { fullFen: root.fullFen, evaluationProfile: profile, bestUci: "d2d4", cp: 20, mate: null }
    });

    const proposal: ProposedDeepCorrection = { uci: "d2d4", san: "d4", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: rep1, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish", fromNodeId: root.id, toNodeId: child.id }, proposal };

    await assert.rejects(applyApprovedDeepCorrection(input), /Cross-repertoire node detected/);
});

test('Correction: rejects Hardcoded Move origin', async () => {
    const repId = await createDummyRepertoire();
    const root = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(repId, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");

    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    const proposal: ProposedDeepCorrection = { uci: "d2d4", san: "d4", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Hardcoded Move" as any, deepVerified: true, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: repId, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish", fromNodeId: root.id, toNodeId: child.id }, proposal };

    await assert.rejects(applyApprovedDeepCorrection(input), /Invalid proposal moveOrigin/);
});

test('Correction: rejects deepVerified = false proposal', async () => {
    const repId = await createDummyRepertoire();
    const root = await createNode(repId, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "");
    const child = await createNode(repId, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "e4");

    const failedMove = await prisma.repertoireMove.create({
        data: { repertoireId: repId, fromNodeId: root.id, toNodeId: child.id, san: "e4", uci: "e2e4", playerTurn: "RESPONSE", cp: 10, source: "Local Deep Stockfish", selectionMethod: "Ordinary API", moveOrigin: "Engine Move", deepVerified: false, localEvaluationProfile: profile }
    });

    const proposal: ProposedDeepCorrection = { uci: "d2d4", san: "d4", cp: 20, mate: null, source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification", moveOrigin: "Engine Move", deepVerified: false as any, localEvaluationProfile: profile, baselineUci: "d2d4", baselineCp: 20, baselineMate: null };
    const input: CorrectionInput = { repertoireId: repId, failed: { responseId: failedMove.id, uci: "e2e4", fullFen: root.fullFen, cp: 10, mate: null, source: "Local Deep Stockfish", fromNodeId: root.id, toNodeId: child.id }, proposal };

    await assert.rejects(applyApprovedDeepCorrection(input), /Invalid proposal deepVerified/);
});
