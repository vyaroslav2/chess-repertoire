import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert";
import { prisma, createRepertoireMove, createResponseMove, createRepertoireNode } from "../db/operations";
import { reconcileExistingResponse, type RecomputedResponse } from "./rm-reconciliation";
import { positionKeyFromFen, parseFullFen } from "./fen";
import { createEmptyCard } from "ts-fsrs";
import { Chess } from "chess.js";
import {
    buildCanonicalContinuationQueueItem,
    enqueueCanonicalContinuation,
    evaluateCanonicalResponse,
    persistCanonicalMaxCumulativeProbability,
    raisePendingCanonicalContinuationProbability,
    type GeneratorQueueItem,
    type PendingCanonicalContinuations
} from "./generator";

// Tests for Slice 16
describe("RM Reconciliation", () => {
    let user: any;
    let repertoire: any;
    let baseFullFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    let testIdx = 0;

    beforeEach(async () => {
        testIdx++;
        user = await prisma.user.create({ data: { username: "test_reconciliation_" + Date.now() + "_" + testIdx } });
        repertoire = await prisma.repertoire.create({
            data: { title: "Test Rep", color: "black", userId: user.id }
        });
    });

    afterEach(async () => {
        await prisma.repertoire.delete({ where: { id: repertoire.id } });
        await prisma.user.delete({ where: { id: user.id } });
    });

    async function setupBase() {
        const sourceNode = await createRepertoireNode(repertoire.id, baseFullFen, "e4", 1.0);

        const destFen = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
        const destNode = await createRepertoireNode(repertoire.id, destFen, "e4 c5", 1.0);

        const responseMove = await createResponseMove({
            fromNodeId: sourceNode.id,
            toNodeId: destNode.id,
            uci: "c7c5",
            san: "c5",
            cp: -30,
            mate: null,
            weightedCount: 100,
            source: "Lichess Cloud Evaluation",
            selectionMethod: "Ordinary API",
            moveOrigin: "Human Move",
            deepVerified: false,
            localEvaluationProfile: null
        });

        const emptyCard = createEmptyCard();
        const stat = await prisma.repertoirePositionStat.create({
            data: {
                repertoireId: repertoire.id,
                nodeId: sourceNode.id,
                targetMoveId: responseMove.id,
                reps: 5, // simulate progress
                lapses: 1,
                stability: 20,
                difficulty: 5,
                elapsed_days: 10,
                scheduled_days: 20,
                due: new Date("2031-02-03T04:05:06.000Z"),
                state: 2,
                explanation: "learned plan"
            }
        });

        return { sourceNode, destNode, responseMove, stat };
    }

    async function setupProbabilityTransposition(existingProbability: number, incomingProbability: number) {
        const canonicalHistory = ["Nf3", "Nf6", "g3", "g6", "Bg2", "Bg7", "d4"];
        const transposingHistory = ["g3", "g6", "Bg2", "Bg7", "Nf3", "Nf6", "d4"];
        const play = (history: string[]) => {
            const chess = new Chess();
            for (const san of history) chess.move(san);
            return chess;
        };
        const canonicalSource = await createRepertoireNode(
            repertoire.id,
            play(canonicalHistory).fen(),
            canonicalHistory.join(" "),
            existingProbability
        );
        const transposingParentHistory = transposingHistory.slice(0, -1);
        const transposingParent = await createRepertoireNode(
            repertoire.id,
            play(transposingParentHistory).fen(),
            transposingParentHistory.join(" "),
            incomingProbability
        );
        await createRepertoireMove({
            repertoireId: repertoire.id,
            fromNodeId: transposingParent.id,
            toNodeId: canonicalSource.id,
            uci: "d2d4",
            san: "d4",
            playerTurn: "OPPONENT",
            trueProbability: incomingProbability
        });
        const destinationChess = new Chess(canonicalSource.fullFen);
        destinationChess.move({ from: "c7", to: "c5" });
        const canonicalDestination = await createRepertoireNode(
            repertoire.id,
            destinationChess.fen(),
            `${canonicalSource.pgn} c5`,
            existingProbability
        );
        const storedResponse = await createResponseMove({
            fromNodeId: canonicalSource.id,
            toNodeId: canonicalDestination.id,
            uci: "c7c5",
            san: "c5",
            cp: -20,
            mate: null,
            source: "ChessDB",
            selectionMethod: "Ordinary API",
            moveOrigin: "Human Move",
            deepVerified: false,
            localEvaluationProfile: null,
            weightedCount: 20
        });
        await prisma.repertoirePositionStat.create({
            data: { repertoireId: repertoire.id, nodeId: canonicalSource.id, targetMoveId: storedResponse.id }
        });
        return { canonicalHistory, transposingHistory, canonicalSource, canonicalDestination, storedResponse };
    }

    async function reconcileProbabilityTransposition(
        setup: Awaited<ReturnType<typeof setupProbabilityTransposition>>,
        effectiveProbability: number
    ) {
        return reconcileExistingResponse({
            repertoireId: repertoire.id,
            sourceNodeId: setup.canonicalSource.id,
            cumulativeProb: effectiveProbability,
            expectedStoredResponse: {
                id: setup.storedResponse.id,
                uci: "c7c5",
                fromNodeId: setup.canonicalSource.id,
                toNodeId: setup.canonicalDestination.id,
                fullFen: setup.canonicalSource.fullFen
            },
            recomputed: {
                selectedUci: "c7c5",
                selectedMoveSan: "c5",
                cp: -12,
                mate: null,
                source: "Lichess Cloud Evaluation",
                selectionMethod: "Ordinary API",
                moveOrigin: "Human Move",
                deepVerified: false,
                localEvaluationProfile: null,
                weightedCount: 40
            }
        });
    }

    describe("Same-UCI Reconciliation", () => {
        it("same UCI preserves RESPONSE row ID, descendants, stats", async () => {
            const { sourceNode, responseMove, stat, destNode } = await setupBase();

            // Create a child of the destination to verify it's preserved
            const childFen = "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
            const childNode = await createRepertoireNode(repertoire.id, childFen, "e4 c5 Nf3", 1.0);
            await createRepertoireMove({
                repertoireId: repertoire.id,
                fromNodeId: destNode.id,
                toNodeId: childNode.id,
                uci: "g1f3",
                san: "Nf3",
                playerTurn: "OPPONENT",
                prob: 1.0,
                trueProbability: 1.0
            });

            const recomputed: RecomputedResponse = {
                selectedUci: "c7c5",
                selectedMoveSan: "c5",
                cp: -15, // changed
                mate: null,
                source: "Local Deep Stockfish", // changed
                selectionMethod: "Ordinary API", // changed
                moveOrigin: "Engine Move", // changed
                deepVerified: false,
                localEvaluationProfile: null,
                weightedCount: null // changed
            };

            const result = await reconcileExistingResponse({
                repertoireId: repertoire.id,
                sourceNodeId: sourceNode.id,
                cumulativeProb: 1.0,
                expectedStoredResponse: {
                    id: responseMove.id,
                    uci: responseMove.uci!,
                    fromNodeId: responseMove.fromNodeId,
                    toNodeId: responseMove.toNodeId,
                    fullFen: sourceNode.fullFen
                },
                recomputed
            });

            assert.strictEqual(result.action, "KEPT");
            assert.strictEqual(result.responseId, responseMove.id); // preserved ID

            const updatedResponse = await prisma.repertoireMove.findUnique({ where: { id: responseMove.id } });
            assert.strictEqual(updatedResponse!.cp, -15);
            assert.strictEqual(updatedResponse!.source, "Local Deep Stockfish");
            assert.strictEqual(updatedResponse!.moveOrigin, "Engine Move");
            assert.strictEqual(updatedResponse!.weightedCount, null); // changed to null
            assert.strictEqual(updatedResponse!.deepVerified, false);
            assert.strictEqual(updatedResponse!.localEvaluationProfile, null);

            const preservedStat = await prisma.repertoirePositionStat.findUnique({ where: { id: stat.id } });
            assert.ok(preservedStat);
            assert.strictEqual(preservedStat!.reps, 5); // FSRS preserved
            assert.strictEqual(preservedStat!.lapses, 1);
            assert.strictEqual(preservedStat!.stability, 20);
            assert.strictEqual(preservedStat!.difficulty, 5);
            assert.strictEqual(preservedStat!.due.toISOString(), "2031-02-03T04:05:06.000Z");
            assert.strictEqual(preservedStat!.state, 2);

            const preservedChild = await prisma.repertoireNode.findUnique({ where: { id: childNode.id } });
            assert.ok(preservedChild); // Descendants preserved
        });

        it("preserves deepVerified=true if recomputation returns false", async () => {
            const { sourceNode, responseMove } = await setupBase();

            await prisma.localEngineBaseline.upsert({
                where: { fullFen_evaluationProfile: { fullFen: sourceNode.fullFen, evaluationProfile: "profile-v1" } },
                update: { bestUci: "c7c5", san: "c5", cp: 0, mate: null },
                create: {
                    fullFen: sourceNode.fullFen,
                    evaluationProfile: "profile-v1",
                    bestUci: "c7c5",
                    san: "c5",
                    cp: 0,
                    mate: null
                }
            });
            const dvResponse = await prisma.repertoireMove.update({
                where: { id: responseMove.id },
                data: {
                    cp: 0,
                    source: "Local Deep Stockfish",
                    selectionMethod: "Corrected after Deep Verification",
                    moveOrigin: "Human Move",
                    deepVerified: true,
                    localEvaluationProfile: "profile-v1"
                }
            });

            const recomputed: RecomputedResponse = {
                selectedUci: "c7c5",
                selectedMoveSan: "c5",
                cp: 10,
                mate: null,
                source: "Lichess Cloud Evaluation",
                selectionMethod: "Ordinary API",
                moveOrigin: "Human Move",
                deepVerified: false,
                localEvaluationProfile: null,
                weightedCount: 50
            };

            const result = await reconcileExistingResponse({
                repertoireId: repertoire.id,
                sourceNodeId: sourceNode.id,
                cumulativeProb: 1.0,
                expectedStoredResponse: {
                    id: dvResponse.id,
                    uci: "c7c5",
                    fromNodeId: dvResponse.fromNodeId,
                    toNodeId: dvResponse.toNodeId,
                    fullFen: sourceNode.fullFen
                },
                recomputed
            });

            const updated = await prisma.repertoireMove.findUnique({ where: { id: dvResponse.id } });
            assert.strictEqual(updated!.cp, 10);
            assert.strictEqual(updated!.source, "Lichess Cloud Evaluation");
            assert.strictEqual(updated!.deepVerified, true, "deepVerified must remain true");
            assert.strictEqual(updated!.localEvaluationProfile, "profile-v1", "Local profile must remain");
            assert.strictEqual(updated!.weightedCount, 50, "current Human weighted evidence must refresh");
        });

        it("replaces cp with mate atomically and keeps an unverified RESPONSE unverified", async () => {
            const { sourceNode, responseMove, stat } = await setupBase();
            await reconcileExistingResponse({
                repertoireId: repertoire.id,
                sourceNodeId: sourceNode.id,
                cumulativeProb: 1,
                expectedStoredResponse: {
                    id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                    toNodeId: responseMove.toNodeId, fullFen: sourceNode.fullFen
                },
                recomputed: {
                    selectedUci: "c7c5", selectedMoveSan: "c5", cp: null, mate: -3,
                    source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API",
                    moveOrigin: "Engine Move", deepVerified: false,
                    localEvaluationProfile: null, weightedCount: null
                }
            });
            const updated = await prisma.repertoireMove.findUniqueOrThrow({ where: { id: responseMove.id } });
            assert.equal(updated.cp, null);
            assert.equal(updated.mate, -3);
            assert.equal(updated.deepVerified, false);
            assert.equal(updated.localEvaluationProfile, null);
            assert.equal(updated.weightedCount, null);
            assert.ok(await prisma.repertoirePositionStat.findUnique({ where: { id: stat.id } }));
        });

        it("supports same-UCI hardcoded provenance refresh without resetting the learned item", async () => {
            const { sourceNode, responseMove, stat } = await setupBase();
            await reconcileExistingResponse({
                repertoireId: repertoire.id,
                sourceNodeId: sourceNode.id,
                cumulativeProb: 1,
                expectedStoredResponse: {
                    id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                    toNodeId: responseMove.toNodeId, fullFen: sourceNode.fullFen
                },
                recomputed: {
                    selectedUci: "c7c5", selectedMoveSan: "c5", cp: 7, mate: null,
                    source: "ChessDB", selectionMethod: "Hardcoded Opening", moveOrigin: "Hardcoded Move",
                    deepVerified: false, localEvaluationProfile: null, weightedCount: null
                }
            });
            const updated = await prisma.repertoireMove.findUniqueOrThrow({ where: { id: responseMove.id } });
            assert.equal(updated.selectionMethod, "Hardcoded Opening");
            assert.equal(updated.moveOrigin, "Hardcoded Move");
            assert.equal(updated.source, "ChessDB");
            assert.equal((await prisma.repertoirePositionStat.findUniqueOrThrow({ where: { id: stat.id } })).reps, 5);
        });
    });

    describe("Different-UCI Reconciliation", () => {
        it("different UCI replaces RESPONSE, deletes descendants, creates fresh stat", async () => {
            const { sourceNode, responseMove, stat, destNode } = await setupBase();
            const root = await createRepertoireNode(
                repertoire.id,
                "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                "",
                1
            );
            const upstream = await createRepertoireMove({
                repertoireId: repertoire.id, fromNodeId: root.id, toNodeId: sourceNode.id,
                uci: "e2e4", san: "e4", playerTurn: "OPPONENT"
            });

            // Create a child of the old destination to verify it's deleted
            const childFen = "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
            const childNode = await createRepertoireNode(repertoire.id, childFen, "e4 c5 Nf3", 1.0);
            await createRepertoireMove({
                repertoireId: repertoire.id,
                fromNodeId: destNode.id,
                toNodeId: childNode.id,
                uci: "g1f3",
                san: "Nf3",
                playerTurn: "OPPONENT",
                prob: 1.0,
                trueProbability: 1.0
            });

            const recomputed: RecomputedResponse = {
                selectedUci: "e7e5", // DIFFERENT!
                selectedMoveSan: "e5",
                cp: -10,
                mate: null,
                source: "ChessDB",
                selectionMethod: "Ordinary API",
                moveOrigin: "Engine Move",
                deepVerified: false,
                localEvaluationProfile: null,
                weightedCount: null
            };

            const result = await reconcileExistingResponse({
                repertoireId: repertoire.id,
                sourceNodeId: sourceNode.id,
                cumulativeProb: 1.0,
                expectedStoredResponse: {
                    id: responseMove.id,
                    uci: responseMove.uci!,
                    fromNodeId: responseMove.fromNodeId,
                    toNodeId: responseMove.toNodeId,
                    fullFen: sourceNode.fullFen
                },
                recomputed
            });

            assert.strictEqual(result.action, "REPLACED");
            assert.notStrictEqual(result.responseId, responseMove.id); // NEW ID
            assert.ok(await prisma.repertoireNode.findUnique({ where: { id: sourceNode.id } }));
            assert.ok(await prisma.repertoireNode.findUnique({ where: { id: root.id } }));
            assert.ok(await prisma.repertoireMove.findUnique({ where: { id: upstream.id } }));

            // Old response is gone
            const oldR = await prisma.repertoireMove.findUnique({ where: { id: responseMove.id } });
            assert.strictEqual(oldR, null);

            // Old descendants are gone
            const oldChild = await prisma.repertoireNode.findUnique({ where: { id: childNode.id } });
            assert.strictEqual(oldChild, null);
            const oldDest = await prisma.repertoireNode.findUnique({ where: { id: destNode.id } });
            assert.strictEqual(oldDest, null);

            // New response is correct
            const newR = await prisma.repertoireMove.findUnique({ where: { id: result.responseId } });
            assert.strictEqual(newR!.uci, "e7e5");
            assert.strictEqual(newR!.san, "e5");
            assert.strictEqual(newR!.cp, -10);
            assert.strictEqual(newR!.source, "ChessDB");
            assert.strictEqual(newR!.selectionMethod, "Ordinary API");
            assert.strictEqual(newR!.moveOrigin, "Engine Move");
            assert.strictEqual(newR!.deepVerified, false);
            assert.strictEqual(newR!.localEvaluationProfile, null);

            // New destination exists
            const newDest = await prisma.repertoireNode.findUnique({ where: { id: result.destinationNodeId } });
            assert.strictEqual(newDest!.pgn, "e4 e5");
            const chess = new Chess(sourceNode.fullFen);
            chess.move({ from: "e7", to: "e5" });
            assert.strictEqual(newDest!.fullFen, parseFullFen(chess.fen()));
            assert.strictEqual(newDest!.positionKey, positionKeyFromFen(parseFullFen(chess.fen())));

            // Fresh stat was created
            const newStat = await prisma.repertoirePositionStat.findFirst({ where: { targetMoveId: newR!.id } });
            assert.ok(newStat);
            assert.strictEqual(newStat!.reps, 0); // Fresh start
            assert.strictEqual(newStat!.lapses, 0);
            assert.strictEqual(newStat!.stability, 0);
            assert.strictEqual(newStat!.difficulty, 0);
            assert.strictEqual(newStat!.state, 0);
            assert.strictEqual(newStat!.id, stat.id, "the history-specific card is reset in place");
        });

        it("preserves an externally owned transposition target while removing its obsolete incoming edge", async () => {
            const { sourceNode, responseMove, destNode } = await setupBase();
            await prisma.repertoireNode.update({ where: { id: destNode.id }, data: { pgn: "d4 c5" } });
            const childFen = "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
            const child = await createRepertoireNode(repertoire.id, childFen, "d4 c5 Nf3", 1);
            const safeEdge = await createRepertoireMove({
                repertoireId: repertoire.id, fromNodeId: destNode.id, toNodeId: child.id,
                uci: "g1f3", san: "Nf3", playerTurn: "OPPONENT"
            });
            const result = await reconcileExistingResponse({
                repertoireId: repertoire.id, sourceNodeId: sourceNode.id, cumulativeProb: 1,
                expectedStoredResponse: {
                    id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                    toNodeId: destNode.id, fullFen: sourceNode.fullFen
                },
                recomputed: {
                    selectedUci: "e7e5", selectedMoveSan: "e5", cp: 4, mate: null,
                    source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Human Move",
                    deepVerified: false, localEvaluationProfile: null, weightedCount: 12
                }
            });
            assert.equal(result.action, "REPLACED");
            assert.ok(await prisma.repertoireNode.findUnique({ where: { id: destNode.id } }));
            assert.ok(await prisma.repertoireMove.findUnique({ where: { id: safeEdge.id } }));
            assert.equal(await prisma.repertoireMove.findUnique({ where: { id: responseMove.id } }), null);
        });

        it("does not inherit correction provenance or verification when a corrected UCI changes", async () => {
            const { sourceNode, responseMove, destNode } = await setupBase();
            await prisma.localEngineBaseline.upsert({
                where: { fullFen_evaluationProfile: { fullFen: sourceNode.fullFen, evaluationProfile: "corrected-profile" } },
                update: { bestUci: "c7c5", san: "c5", cp: -30, mate: null },
                create: {
                    fullFen: sourceNode.fullFen, evaluationProfile: "corrected-profile",
                    bestUci: "c7c5", san: "c5", cp: -30, mate: null
                }
            });
            await prisma.repertoireMove.update({
                where: { id: responseMove.id },
                data: {
                    source: "Local Deep Stockfish", selectionMethod: "Corrected after Deep Verification",
                    moveOrigin: "Engine Move", deepVerified: true, localEvaluationProfile: "corrected-profile"
                }
            });
            const result = await reconcileExistingResponse({
                repertoireId: repertoire.id, sourceNodeId: sourceNode.id, cumulativeProb: 1,
                expectedStoredResponse: {
                    id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                    toNodeId: destNode.id, fullFen: sourceNode.fullFen
                },
                recomputed: {
                    selectedUci: "e7e5", selectedMoveSan: "e5", cp: 9, mate: null,
                    source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Human Move",
                    deepVerified: false, localEvaluationProfile: null, weightedCount: 25
                }
            });
            const replacement = await prisma.repertoireMove.findUniqueOrThrow({ where: { id: result.responseId } });
            assert.notEqual(replacement.id, responseMove.id);
            assert.equal(replacement.selectionMethod, "Ordinary API");
            assert.equal(replacement.source, "Lichess Cloud Evaluation");
            assert.equal(replacement.deepVerified, false);
            assert.equal(replacement.localEvaluationProfile, null);
            assert.equal(replacement.weightedCount, 25);
        });
    });

    describe("Stale/Race Behaviour", () => {
        it("throws if stored UCI changed before reconcile", async () => {
            const { sourceNode, responseMove } = await setupBase();
            await assert.rejects(
                reconcileExistingResponse({
                    repertoireId: repertoire.id,
                    sourceNodeId: sourceNode.id,
                    cumulativeProb: 1.0,
                    expectedStoredResponse: {
                        id: responseMove.id,
                        uci: "e7e6", // mismatch
                        fromNodeId: responseMove.fromNodeId,
                        toNodeId: responseMove.toNodeId,
                        fullFen: sourceNode.fullFen
                    },
                    recomputed: {
                        selectedUci: "e7e6", selectedMoveSan: "e6", cp: 0, mate: null,
                        source: "Lichess Cloud Evaluation", selectionMethod: "Ordinary API", moveOrigin: "Engine Move",
                        deepVerified: false, localEvaluationProfile: null, weightedCount: null
                    }
                }),
                /Stale stored RESPONSE: UCI changed/
            );
            assert.ok(await prisma.repertoireMove.findUnique({ where: { id: responseMove.id } }));
        });

        it("hard-errors with zero mutation when expected destination identity is stale", async () => {
            const { sourceNode, responseMove, destNode, stat } = await setupBase();
            await assert.rejects(reconcileExistingResponse({
                repertoireId: repertoire.id, sourceNodeId: sourceNode.id, cumulativeProb: 1,
                expectedStoredResponse: {
                    id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                    toNodeId: "stale-destination", fullFen: sourceNode.fullFen
                },
                recomputed: {
                    selectedUci: "e7e5", selectedMoveSan: "e5", cp: 1, mate: null,
                    source: "ChessDB", selectionMethod: "Ordinary API", moveOrigin: "Human Move",
                    deepVerified: false, localEvaluationProfile: null, weightedCount: 1
                }
            }), /toNodeId changed/);
            assert.ok(await prisma.repertoireMove.findUnique({ where: { id: responseMove.id } }));
            assert.ok(await prisma.repertoireNode.findUnique({ where: { id: destNode.id } }));
            assert.ok(await prisma.repertoirePositionStat.findUnique({ where: { id: stat.id } }));
        });

        it("hard-errors when the stored toNodeId changes after evaluation", async () => {
            const { sourceNode, responseMove, destNode } = await setupBase();
            const alternateDestination = await createRepertoireNode(repertoire.id, destNode.fullFen, "d4 c5", 1);
            await prisma.repertoireMove.update({ where: { id: responseMove.id }, data: { toNodeId: alternateDestination.id } });
            await assert.rejects(reconcileExistingResponse({
                repertoireId: repertoire.id, sourceNodeId: sourceNode.id, cumulativeProb: 1,
                expectedStoredResponse: {
                    id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                    toNodeId: destNode.id, fullFen: sourceNode.fullFen
                },
                recomputed: {
                    selectedUci: "e7e5", selectedMoveSan: "e5", cp: 1, mate: null,
                    source: "ChessDB", selectionMethod: "Ordinary API", moveOrigin: "Human Move",
                    deepVerified: false, localEvaluationProfile: null, weightedCount: 1
                }
            }), /toNodeId changed/);
            assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: responseMove.id } })).toNodeId, alternateDestination.id);
            assert.ok(await prisma.repertoireNode.findUnique({ where: { id: destNode.id } }));
        });

        it("hard-errors with zero mutation when source FullFen changed after evaluation", async () => {
            const { sourceNode, responseMove, destNode } = await setupBase();
            const changedFen = "rnbqkbnr/pppppppp/8/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3 0 2";
            await prisma.position.upsert({
                where: { positionKey: positionKeyFromFen(parseFullFen(changedFen)) }, update: {},
                create: { positionKey: positionKeyFromFen(parseFullFen(changedFen)) }
            });
            await prisma.repertoireNode.update({ where: { id: sourceNode.id }, data: {
                fullFen: changedFen, positionKey: positionKeyFromFen(parseFullFen(changedFen))
            } });
            await assert.rejects(reconcileExistingResponse({
                repertoireId: repertoire.id, sourceNodeId: sourceNode.id, cumulativeProb: 1,
                expectedStoredResponse: {
                    id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                    toNodeId: destNode.id, fullFen: sourceNode.fullFen
                },
                recomputed: {
                    selectedUci: "e7e5", selectedMoveSan: "e5", cp: 1, mate: null,
                    source: "ChessDB", selectionMethod: "Ordinary API", moveOrigin: "Human Move",
                    deepVerified: false, localEvaluationProfile: null, weightedCount: 1
                }
            }), /fullFen changed/);
            assert.ok(await prisma.repertoireMove.findUnique({ where: { id: responseMove.id } }));
            assert.ok(await prisma.repertoireNode.findUnique({ where: { id: destNode.id } }));
        });

        it("rejects a stored legal move pointing at the wrong destination before mutation", async () => {
            const { sourceNode, responseMove, destNode } = await setupBase();
            const wrongFen = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
            await prisma.position.upsert({
                where: { positionKey: positionKeyFromFen(parseFullFen(wrongFen)) }, update: {},
                create: { positionKey: positionKeyFromFen(parseFullFen(wrongFen)) }
            });
            await prisma.repertoireNode.update({ where: { id: destNode.id }, data: {
                fullFen: wrongFen, positionKey: positionKeyFromFen(parseFullFen(wrongFen))
            } });
            await assert.rejects(reconcileExistingResponse({
                repertoireId: repertoire.id, sourceNodeId: sourceNode.id, cumulativeProb: 1,
                expectedStoredResponse: {
                    id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                    toNodeId: destNode.id, fullFen: sourceNode.fullFen
                },
                recomputed: {
                    selectedUci: "e7e5", selectedMoveSan: "e5", cp: 1, mate: null,
                    source: "ChessDB", selectionMethod: "Ordinary API", moveOrigin: "Human Move",
                    deepVerified: false, localEvaluationProfile: null, weightedCount: 1
                }
            }), /destination FullFen/);
            assert.ok(await prisma.repertoireMove.findUnique({ where: { id: responseMove.id } }));
        });

        it("hard-errors when the stored fromNodeId changes after evaluation", async () => {
            const { sourceNode, responseMove, destNode } = await setupBase();
            const otherSource = await createRepertoireNode(repertoire.id, sourceNode.fullFen, "d4", 1);
            await prisma.repertoireMove.update({ where: { id: responseMove.id }, data: { fromNodeId: otherSource.id } });
            await assert.rejects(reconcileExistingResponse({
                repertoireId: repertoire.id, sourceNodeId: sourceNode.id, cumulativeProb: 1,
                expectedStoredResponse: {
                    id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                    toNodeId: destNode.id, fullFen: sourceNode.fullFen
                },
                recomputed: {
                    selectedUci: "e7e5", selectedMoveSan: "e5", cp: 1, mate: null,
                    source: "ChessDB", selectionMethod: "Ordinary API", moveOrigin: "Human Move",
                    deepVerified: false, localEvaluationProfile: null, weightedCount: 1
                }
            }), /fromNodeId changed/);
            assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: responseMove.id } })).fromNodeId, otherSource.id);
        });

        it("hard-errors without creating a replacement when the expected RESPONSE was deleted", async () => {
            const { sourceNode, responseMove, destNode } = await setupBase();
            await prisma.repertoireMove.delete({ where: { id: responseMove.id } });
            await assert.rejects(reconcileExistingResponse({
                repertoireId: repertoire.id, sourceNodeId: sourceNode.id, cumulativeProb: 1,
                expectedStoredResponse: {
                    id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                    toNodeId: destNode.id, fullFen: sourceNode.fullFen
                },
                recomputed: {
                    selectedUci: "e7e5", selectedMoveSan: "e5", cp: 1, mate: null,
                    source: "ChessDB", selectionMethod: "Ordinary API", moveOrigin: "Human Move",
                    deepVerified: false, localEvaluationProfile: null, weightedCount: 1
                }
            }), /not found/);
            assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: sourceNode.id } }), 0);
            assert.ok(await prisma.repertoireNode.findUnique({ where: { id: destNode.id } }));
        });

        it("hard-errors without touching the current row when the expected RESPONSE was replaced", async () => {
            const { sourceNode, responseMove, destNode } = await setupBase();
            await prisma.repertoireMove.delete({ where: { id: responseMove.id } });
            const currentResponse = await createResponseMove({
                fromNodeId: sourceNode.id, toNodeId: destNode.id, uci: "c7c5", san: "c5",
                cp: -22, mate: null, source: "ChessDB", selectionMethod: "Ordinary API",
                moveOrigin: "Human Move", deepVerified: false, localEvaluationProfile: null, weightedCount: 18
            });
            await prisma.repertoirePositionStat.update({
                where: { repertoireId_nodeId: { repertoireId: repertoire.id, nodeId: sourceNode.id } },
                data: { targetMoveId: currentResponse.id, targetUci: "c7c5", reps: 3 }
            });
            await assert.rejects(reconcileExistingResponse({
                repertoireId: repertoire.id, sourceNodeId: sourceNode.id, cumulativeProb: 1,
                expectedStoredResponse: {
                    id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                    toNodeId: destNode.id, fullFen: sourceNode.fullFen
                },
                recomputed: {
                    selectedUci: "e7e5", selectedMoveSan: "e5", cp: 1, mate: null,
                    source: "ChessDB", selectionMethod: "Ordinary API", moveOrigin: "Human Move",
                    deepVerified: false, localEvaluationProfile: null, weightedCount: 1
                }
            }), /not found/);
            const preserved = await prisma.repertoireMove.findUniqueOrThrow({ where: { id: currentResponse.id } });
            assert.equal(preserved.cp, -22);
            assert.equal((await prisma.repertoirePositionStat.findFirstOrThrow({ where: { targetMoveId: currentResponse.id } })).reps, 3);
        });

        it("hard-errors before mutation when repertoire ownership becomes inconsistent", async () => {
            const { sourceNode, responseMove, destNode } = await setupBase();
            const other = await prisma.repertoire.create({
                data: { title: "Other", color: "black", userId: user.id }
            });
            await prisma.repertoireMove.update({ where: { id: responseMove.id }, data: { repertoireId: other.id } });
            await assert.rejects(reconcileExistingResponse({
                repertoireId: repertoire.id, sourceNodeId: sourceNode.id, cumulativeProb: 1,
                expectedStoredResponse: {
                    id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                    toNodeId: destNode.id, fullFen: sourceNode.fullFen
                },
                recomputed: {
                    selectedUci: "e7e5", selectedMoveSan: "e5", cp: 1, mate: null,
                    source: "ChessDB", selectionMethod: "Ordinary API", moveOrigin: "Human Move",
                    deepVerified: false, localEvaluationProfile: null, weightedCount: 1
                }
            }), /wrong repertoire/);
            assert.equal((await prisma.repertoireMove.findUniqueOrThrow({ where: { id: responseMove.id } })).repertoireId, other.id);
        });
    });

    it("returns the Slice-15-style gap destination for normal queued continuation", async () => {
        const { sourceNode, responseMove, destNode } = await setupBase();
        assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: destNode.id } }), 0);
        const result = await reconcileExistingResponse({
            repertoireId: repertoire.id, sourceNodeId: sourceNode.id, cumulativeProb: 1,
            expectedStoredResponse: {
                id: responseMove.id, uci: "c7c5", fromNodeId: sourceNode.id,
                toNodeId: destNode.id, fullFen: sourceNode.fullFen
            },
            recomputed: {
                selectedUci: "c7c5", selectedMoveSan: "c5", cp: -12, mate: null,
                source: "ChessDB", selectionMethod: "Ordinary API", moveOrigin: "Human Move",
                deepVerified: false, localEvaluationProfile: null, weightedCount: 20
            }
        });
        const queue = [{ nodeId: result.destinationNodeId, fen: result.destinationFullFen }];
        const queued = queue.shift()!;
        assert.equal(queued.nodeId, destNode.id);
        const chess = new Chess(queued.fen);
        chess.move({ from: "g1", to: "f3" });
        const continuation = await createRepertoireNode(repertoire.id, chess.fen(), "e4 c5 Nf3", 1);
        await createRepertoireMove({
            repertoireId: repertoire.id, fromNodeId: queued.nodeId, toNodeId: continuation.id,
            uci: "g1f3", san: "Nf3", playerTurn: "OPPONENT"
        });
        assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: destNode.id } }), 1);
    });

    it("raises one already-queued canonical continuation when a later route raises 0.04 to 0.12", async () => {
        const setup = await setupProbabilityTransposition(0.04, 0.12);
        assert.notEqual(setup.transposingHistory.join(" "), setup.canonicalSource.pgn);
        const firstEffectiveNode = await persistCanonicalMaxCumulativeProbability({
            node: setup.canonicalSource,
            incomingPathProb: 0.04
        });
        const reconciled = await reconcileProbabilityTransposition(setup, firstEffectiveNode.cumulativeProb);
        const queue: GeneratorQueueItem[] = [];
        const pending: PendingCanonicalContinuations = new Map();
        enqueueCanonicalContinuation({
            queue,
            pendingByResponseSource: pending,
            responseSourceNodeId: setup.canonicalSource.id,
            item: buildCanonicalContinuationQueueItem({
                destinationNode: {
                    id: reconciled.destinationNodeId,
                    fullFen: reconciled.destinationFullFen,
                    pgn: reconciled.destinationPgn
                },
                cumulativeProb: firstEffectiveNode.cumulativeProb
            })
        });
        assert.equal(queue.length, 1);
        assert.equal(queue[0].cumulativeProb, 0.04);

        const laterEffectiveNode = await persistCanonicalMaxCumulativeProbability({
            node: firstEffectiveNode,
            incomingPathProb: 0.12
        });
        assert.equal(raisePendingCanonicalContinuationProbability({
            pendingByResponseSource: pending,
            responseSourceNodeId: setup.canonicalSource.id,
            effectiveCumulativeProb: laterEffectiveNode.cumulativeProb
        }), true);
        assert.equal((await prisma.repertoireNode.findUniqueOrThrow({ where: { id: setup.canonicalSource.id } })).cumulativeProb, 0.12);
        assert.equal(queue.length, 1);
        assert.equal(queue[0].cumulativeProb, 0.12);
        assert.deepEqual(queue[0].history, [...setup.canonicalHistory, "c5"]);
    });

    it("keeps one already-queued canonical continuation at 0.12 over a later 0.04 route", async () => {
        const setup = await setupProbabilityTransposition(0.12, 0.04);
        assert.notEqual(setup.transposingHistory.join(" "), setup.canonicalSource.pgn);
        const firstEffectiveNode = await persistCanonicalMaxCumulativeProbability({
            node: setup.canonicalSource,
            incomingPathProb: 0.12
        });
        const reconciled = await reconcileProbabilityTransposition(setup, firstEffectiveNode.cumulativeProb);
        const queue: GeneratorQueueItem[] = [];
        const pending: PendingCanonicalContinuations = new Map();
        enqueueCanonicalContinuation({
            queue,
            pendingByResponseSource: pending,
            responseSourceNodeId: setup.canonicalSource.id,
            item: buildCanonicalContinuationQueueItem({
                destinationNode: {
                    id: reconciled.destinationNodeId,
                    fullFen: reconciled.destinationFullFen,
                    pgn: reconciled.destinationPgn
                },
                cumulativeProb: firstEffectiveNode.cumulativeProb
            })
        });
        assert.equal(queue.length, 1);
        assert.equal(queue[0].cumulativeProb, 0.12);

        const laterEffectiveNode = await persistCanonicalMaxCumulativeProbability({
            node: firstEffectiveNode,
            incomingPathProb: 0.04
        });
        assert.equal(raisePendingCanonicalContinuationProbability({
            pendingByResponseSource: pending,
            responseSourceNodeId: setup.canonicalSource.id,
            effectiveCumulativeProb: laterEffectiveNode.cumulativeProb
        }), true);
        assert.equal((await prisma.repertoireNode.findUniqueOrThrow({ where: { id: setup.canonicalSource.id } })).cumulativeProb, 0.12);
        assert.equal(queue.length, 1);
        assert.equal(queue[0].cumulativeProb, 0.12);
        assert.deepEqual(queue[0].history, [...setup.canonicalHistory, "c5"]);
    });

    it("a transposing route encountered first evaluates and queues the canonical progression", async () => {
        const canonicalHistory = ["Nf3", "Nf6", "g3", "g6", "Bg2", "Bg7", "d4"];
        const transposingHistory = ["g3", "g6", "Bg2", "Bg7", "Nf3", "Nf6", "d4"];
        const transposingParentHistory = transposingHistory.slice(0, -1);

        const play = (history: string[]) => {
            const chess = new Chess();
            for (const san of history) chess.move(san);
            return chess;
        };
        const canonicalPosition = play(canonicalHistory);
        const transposingPosition = play(transposingHistory);
        assert.equal(positionKeyFromFen(parseFullFen(canonicalPosition.fen())), positionKeyFromFen(parseFullFen(transposingPosition.fen())));
        assert.equal(parseFullFen(canonicalPosition.fen()), parseFullFen(transposingPosition.fen()));

        const canonicalSource = await createRepertoireNode(
            repertoire.id, canonicalPosition.fen(), canonicalHistory.join(" "), 1
        );
        const transposingParent = await createRepertoireNode(
            repertoire.id, play(transposingParentHistory).fen(), transposingParentHistory.join(" "), 1
        );
        await createRepertoireMove({
            repertoireId: repertoire.id,
            fromNodeId: transposingParent.id,
            toNodeId: canonicalSource.id,
            uci: "d2d4",
            san: "d4",
            playerTurn: "OPPONENT"
        });

        const destinationChess = new Chess(canonicalSource.fullFen);
        destinationChess.move({ from: "c7", to: "c5" });
        const canonicalDestination = await createRepertoireNode(
            repertoire.id,
            destinationChess.fen(),
            `${canonicalSource.pgn} c5`,
            1
        );
        const storedResponse = await createResponseMove({
            fromNodeId: canonicalSource.id,
            toNodeId: canonicalDestination.id,
            uci: "c7c5",
            san: "c5",
            cp: -20,
            mate: null,
            source: "ChessDB",
            selectionMethod: "Ordinary API",
            moveOrigin: "Human Move",
            deepVerified: false,
            localEvaluationProfile: null,
            weightedCount: 20
        });
        await prisma.repertoirePositionStat.create({
            data: { repertoireId: repertoire.id, nodeId: canonicalSource.id, targetMoveId: storedResponse.id }
        });

        let evaluatorCalls = 0;
        let evaluatorFen = "";
        let evaluatorMoveNumber = 0;
        let evaluatorHistory: string[] = [];
        const selection = await evaluateCanonicalResponse({
            responseNode: canonicalSource,
            routePgn: transposingHistory.join(" "),
            snapshotId: "test-snapshot",
            evaluator: async (fen, chess, moveNumber, previousMovesSan) => {
                evaluatorCalls++;
                evaluatorFen = fen;
                evaluatorMoveNumber = moveNumber;
                evaluatorHistory = [...previousMovesSan];
                assert.equal(chess.fen(), canonicalSource.fullFen);
                return {
                    selectedUci: "c7c5",
                    selectedMoveSan: "c5",
                    cp: -12,
                    mate: null,
                    source: "Lichess Cloud Evaluation",
                    selectionMethod: "Ordinary API",
                    moveOrigin: "Human Move",
                    deepVerified: false,
                    localEvaluationProfile: null,
                    selectedStats: { weightedGames: 40, blackScore: 0.5 },
                    candidateMoves: [],
                    enginePvs: [],
                    evalSource: "Lichess Cloud Evaluation",
                    selectedEngineCp: -12,
                    selectedMate: null
                };
            }
        });

        assert.equal(selection.routeIsCanonicalOwner, false);
        assert.equal(evaluatorCalls, 1);
        assert.equal(evaluatorFen, canonicalSource.fullFen);
        assert.equal(evaluatorMoveNumber, 4);
        assert.deepEqual(evaluatorHistory, canonicalHistory);

        const reconciled = await reconcileExistingResponse({
            repertoireId: repertoire.id,
            sourceNodeId: canonicalSource.id,
            cumulativeProb: 1,
            expectedStoredResponse: {
                id: storedResponse.id,
                uci: "c7c5",
                fromNodeId: canonicalSource.id,
                toNodeId: canonicalDestination.id,
                fullFen: canonicalSource.fullFen
            },
            recomputed: {
                selectedUci: selection.result.selectedUci,
                selectedMoveSan: selection.result.selectedMoveSan,
                cp: selection.result.cp,
                mate: selection.result.mate,
                source: selection.result.source,
                selectionMethod: selection.result.selectionMethod,
                moveOrigin: selection.result.moveOrigin,
                deepVerified: selection.result.deepVerified,
                localEvaluationProfile: selection.result.localEvaluationProfile,
                weightedCount: selection.result.selectedStats.weightedGames
            }
        });
        const queued = buildCanonicalContinuationQueueItem({
            destinationNode: {
                id: reconciled.destinationNodeId,
                fullFen: reconciled.destinationFullFen,
                pgn: reconciled.destinationPgn
            },
            cumulativeProb: 1
        });
        assert.equal(queued.nodeId, canonicalDestination.id);
        assert.deepEqual(queued.history, [...canonicalHistory, "c5"]);
        assert.notDeepEqual(queued.history, [...transposingHistory, "c5"]);
        assert.equal(queued.history.join(" "), canonicalDestination.pgn);
    });
});
