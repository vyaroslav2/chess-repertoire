import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Chess } from "chess.js";
import { generateRepertoire } from "../src/lib/core/generator";
import { parseFullFen, positionKeyFromFen } from "../src/lib/core/fen";
import { prisma } from "../src/lib/db/operations";

type ScriptedPly = {
  san: string;
  uci: string;
  fullFen: string;
  positionKey: string;
};

function argument(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function parseLine(pgn: string): ScriptedPly[] {
  const parsed = new Chess();
  parsed.loadPgn(pgn);
  const sanMoves = parsed.history();
  if (sanMoves.length === 0) throw new Error("The scenario line contains no moves");

  const replay = new Chess();
  return sanMoves.map(san => {
    const move = replay.move(san);
    if (!move) throw new Error(`Illegal scripted move ${san}`);
    return {
      san: move.san,
      uci: move.lan,
      fullFen: replay.fen(),
      positionKey: positionKeyFromFen(parseFullFen(replay.fen()))
    };
  });
}

function historyKey(moves: ScriptedPly[], plyCount: number): string {
  return moves.slice(0, plyCount).map(move => move.uci).join(" ");
}

/**
 * Builds the scripted generator dependencies shared by every scenario: a `fetchDatabases`
 * mock that always returns the one scripted White (OPPONENT) move for the current position,
 * and a `responseEvaluator` mock that always returns the one scripted Black (RESPONSE) move.
 * Both are driven purely by position/ply matching, so they work for any line length or parity.
 */
function buildScriptedDependencies(moves: ScriptedPly[], options: { mateOnFinalResponse?: boolean } = {}) {
  return {
    fetchDatabases: (async (fen: string) => {
      const currentPositionKey = positionKeyFromFen(parseFullFen(fen));
      const whitePly = [0, ...moves.map((_, index) => index + 1)]
        .find(ply => ply % 2 === 0 &&
          (ply === 0 ? positionKeyFromFen(parseFullFen(new Chess().fen())) : moves[ply - 1].positionKey) === currentPositionKey);
      if (whitePly === undefined || whitePly >= moves.length) {
        throw new Error(`No scripted White move for position ${currentPositionKey}`);
      }
      const scripted = moves[whitePly];
      const amateurMove = { uci: scripted.uci, san: scripted.san, games: 100, white: 50, draws: 10, black: 40 };
      return [
        { moves: [], totalGames: 0, opening: null, retrieval: "FRESH" },
        { moves: [], totalGames: 0, opening: null, retrieval: "FRESH" },
        { moves: [amateurMove], totalGames: 100, opening: null, retrieval: "FRESH" }
      ];
    }) as never,
    fetchOpeningMetadata: async () => null,
    responseEvaluator: (async (_fen: string, chess: Chess, _moveNumber: number, previousMovesSan: string[]) => {
      const blackPly = previousMovesSan.length;
      const scripted = moves[blackPly];
      if (!scripted || blackPly % 2 !== 1) throw new Error(`No scripted Black response after ${previousMovesSan.join(" ")}`);
      const legal = chess.move({ from: scripted.uci.slice(0, 2), to: scripted.uci.slice(2, 4), promotion: scripted.uci[4] });
      if (!legal || legal.lan !== scripted.uci) throw new Error(`Scripted Black move ${scripted.uci} is illegal`);
      chess.undo();
      const isMateResponse = options.mateOnFinalResponse === true && blackPly === moves.length - 1;
      return {
        selectedUci: scripted.uci,
        selectedMoveSan: scripted.san,
        cp: isMateResponse ? null : 0,
        mate: isMateResponse ? -1 : null,
        source: "Lichess Cloud Evaluation",
        selectionMethod: isMateResponse ? "Ordinary API" : "Hardcoded Opening",
        moveOrigin: isMateResponse ? "Engine Move" : "Hardcoded Move",
        deepVerified: false,
        localEvaluationProfile: null,
        selectedStats: null,
        candidateMoves: [],
        enginePvs: isMateResponse ? [{ uci: scripted.uci, moves: scripted.uci, cp: null, mate: -1 }] : [],
        openingMetadata: null,
        openingMetadataRetrieval: "FRESH",
        evalSource: "Lichess Cloud Evaluation",
        selectedEngineCp: isMateResponse ? null : 0,
        selectedMate: isMateResponse ? -1 : null
      };
    }) as never,
    ensurePositionCache: (async () => ({})) as never,
    ensureNodeWikibooks: async () => ({ status: "CACHED" as const, text: null }),
    wait: async () => undefined
  };
}

async function runScriptedRepetition(line: string) {
  const moves = parseLine(line);
  if (moves.length % 2 !== 0) throw new Error("A Black-response repetition scenario must end with Black's move");
  const final = moves.at(-1)!;
  const earlierRepeatedPly = moves.slice(0, -1).findIndex((move, index) =>
    index % 2 === 1 && move.positionKey === final.positionKey
  );
  const repeatsRoot = final.positionKey === positionKeyFromFen(parseFullFen(new Chess().fen()));
  if (!repeatsRoot && earlierRepeatedPly < 0) {
    throw new Error("The supplied line does not end in a same-route repeated position");
  }

  const user = await prisma.user.create({ data: { username: `scenario-${randomUUID()}` } });
  const repertoire = await prisma.repertoire.create({
    data: { title: "Generator scenario", color: "black", userId: user.id }
  });
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => {
    const rendered = values.map(value => typeof value === "string" ? value : String(value)).join(" ");
    logs.push(rendered);
    originalLog(...values);
  };

  try {
    const summary = await generateRepertoire(new Chess().fen(), moves.length / 2, {
      repertoireId: repertoire.id,
      ...buildScriptedDependencies(moves)
    });

    const completeHistory = historyKey(moves, moves.length);
    const sourceHistory = historyKey(moves, moves.length - 1);
    const response = await prisma.repertoireMove.findFirstOrThrow({
      where: { repertoireId: repertoire.id, playerTurn: "RESPONSE", uci: final.uci }
    });
    const sourceNode = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: response.fromNodeId } });
    const flashcard = await prisma.repertoirePositionStat.findFirst({
      where: { repertoireId: repertoire.id, nodeId: sourceNode.id, targetMoveId: response.id }
    });
    const root = await prisma.repertoireNode.findFirstOrThrow({ where: { repertoireId: repertoire.id, history: "" } });
    const incomingToRoot = await prisma.repertoireMove.count({ where: { repertoireId: repertoire.id, toNodeId: root.id } });

    assert.equal(sourceNode.history, sourceHistory);
    assert.equal(response.stopReason, "Repetition");
    assert.equal(response.toNodeId, null);
    assert.equal(response.routeHistory, completeHistory);
    assert.equal(sourceNode.cumulativeProb, 1, "the repeating response source must retain the route probability");
    assert.equal(response.routeProbability, 1, "the terminal repetition must record the probability that reached it");
    assert.ok(flashcard, "the repeating Black response must remain learnable");
    assert.equal(await prisma.repertoireNode.count({ where: { repertoireId: repertoire.id, history: completeHistory } }), 0);
    assert.equal(incomingToRoot, 0, "the repetition must not create a graph edge back to root");
    assert.equal(root.cumulativeProb, 1, "the repeated route must not add probability to root");
    assert.equal(summary.totalRepetitionStops, 1);
    assert.equal(summary.totalTranspositions, 0);
    assert.ok(logs.some(log => log.includes("[REPETITION STOP]") && log.includes(`repeatingMove=${final.san}`)));

    originalLog("\nSCENARIO RESULT");
    originalLog(`PASS: repetition detected after ${line}`);
    originalLog(`PASS: ${final.san} response and flashcard retained`);
    originalLog("PASS: route stopped without destination edge or continuation node");
    originalLog("PASS: root probability unchanged; transpositions remain zero");
    originalLog("PASS: repetition event was logged");
  } finally {
    console.log = originalLog;
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

/**
 * Mirrors runScriptedRepetition, but for the OPPONENT side: the scripted line ends on a
 * White move (OPPONENT, for this Black repertoire) that returns to a PositionKey already
 * seen earlier on the same route. This exercises reconcileOpponentBranches's repetition
 * handling rather than generator.ts's Black-RESPONSE repetition branch.
 */
async function runScriptedOpponentRepetition(line: string) {
  const moves = parseLine(line);
  if (moves.length % 2 !== 1) throw new Error("An OPPONENT-repetition scenario must end with White's move");
  const final = moves.at(-1)!;
  const earlierRepeatedPly = moves.slice(0, -1).findIndex((move, index) =>
    index % 2 === 0 && move.positionKey === final.positionKey
  );
  if (earlierRepeatedPly < 0) {
    throw new Error("The supplied line does not end in a same-route repeated position");
  }

  const user = await prisma.user.create({ data: { username: `scenario-${randomUUID()}` } });
  const repertoire = await prisma.repertoire.create({
    data: { title: "Generator scenario", color: "black", userId: user.id }
  });
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => {
    const rendered = values.map(value => typeof value === "string" ? value : String(value)).join(" ");
    logs.push(rendered);
    originalLog(...values);
  };

  try {
    const summary = await generateRepertoire(new Chess().fen(), Math.ceil(moves.length / 2), {
      repertoireId: repertoire.id,
      ...buildScriptedDependencies(moves)
    });

    const completeHistory = historyKey(moves, moves.length);
    const sourceHistory = historyKey(moves, moves.length - 1);
    const ancestorHistory = historyKey(moves, earlierRepeatedPly + 1);

    const sourceNode = await prisma.repertoireNode.findFirstOrThrow({
      where: { repertoireId: repertoire.id, history: sourceHistory }
    });
    const edge = await prisma.repertoireMove.findFirstOrThrow({
      where: { repertoireId: repertoire.id, playerTurn: "OPPONENT", fromNodeId: sourceNode.id, uci: final.uci }
    });
    const ancestorNode = await prisma.repertoireNode.findFirstOrThrow({
      where: { repertoireId: repertoire.id, history: ancestorHistory }
    });
    const incomingToAncestor = await prisma.repertoireMove.count({
      where: { repertoireId: repertoire.id, toNodeId: ancestorNode.id }
    });
    const flashcard = await prisma.repertoirePositionStat.findFirst({
      where: { repertoireId: repertoire.id, targetMoveId: edge.id }
    });

    assert.equal(edge.stopReason, "Repetition");
    assert.equal(edge.toNodeId, null);
    assert.equal(edge.routeHistory, completeHistory);
    assert.equal(ancestorNode.cumulativeProb, 1, "the repeated ancestor must retain its original route probability");
    assert.equal(incomingToAncestor, 1, "the repetition must not add a second incoming edge to the repeated ancestor");
    assert.equal(edge.routeProbability, 1, "the terminal repetition must record the probability that reached it, not zero");
    assert.equal(edge.trueProbability, 1, "the terminal repetition must record the probability that reached it, not zero");
    assert.equal(flashcard, null, "an OPPONENT move must never own a flashcard");
    assert.equal(await prisma.repertoireNode.count({ where: { repertoireId: repertoire.id, history: completeHistory } }), 0);
    assert.equal(summary.totalRepetitionStops, 1);
    assert.equal(summary.totalTranspositions, 0);
    assert.ok(logs.some(log => log.includes("[REPETITION STOP]") && log.includes(`repeatingMove=${final.san}`)));

    originalLog("\nSCENARIO RESULT");
    originalLog(`PASS: OPPONENT repetition detected after ${line}`);
    originalLog(`PASS: ${final.san} move retained without a destination edge or continuation node`);
    originalLog("PASS: repeated ancestor probability unchanged; transpositions remain zero");
    originalLog("PASS: terminal probability recorded (not zeroed) and no flashcard was created");
    originalLog("PASS: repetition event was logged");
  } finally {
    console.log = originalLog;
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

/**
 * Simulates a Lichess mate evaluation on the final scripted Black response while
 * leaving generator persistence, flashcard creation, terminal-position storage,
 * counters, and output formatting on their production paths.
 */
async function runScriptedMate(line: string) {
  const moves = parseLine(line);
  if (moves.length % 2 !== 0) throw new Error("A Black mate scenario must end with Black's move");
  const final = moves.at(-1)!;
  if (!new Chess(final.fullFen).isCheckmate()) {
    throw new Error("The supplied mate scenario does not end in checkmate");
  }

  const user = await prisma.user.create({ data: { username: `scenario-${randomUUID()}` } });
  const repertoire = await prisma.repertoire.create({
    data: { title: "Generator scenario", color: "black", userId: user.id }
  });
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => {
    const rendered = values.map(value => typeof value === "string" ? value : String(value)).join(" ");
    logs.push(rendered);
    originalLog(...values);
  };

  try {
    const summary = await generateRepertoire(new Chess().fen(), moves.length / 2, {
      repertoireId: repertoire.id,
      ...buildScriptedDependencies(moves, { mateOnFinalResponse: true })
    });

    const completeHistory = historyKey(moves, moves.length);
    const sourceHistory = historyKey(moves, moves.length - 1);
    const sourceNode = await prisma.repertoireNode.findFirstOrThrow({
      where: { repertoireId: repertoire.id, history: sourceHistory }
    });
    const response = await prisma.repertoireMove.findFirstOrThrow({
      where: { repertoireId: repertoire.id, playerTurn: "RESPONSE", fromNodeId: sourceNode.id, uci: final.uci }
    });
    const flashcard = await prisma.repertoirePositionStat.findFirst({
      where: { repertoireId: repertoire.id, nodeId: sourceNode.id, targetMoveId: response.id }
    });

    assert.equal(response.stopReason, null);
    assert.equal(response.cp, null);
    assert.equal(response.mate, -1);
    assert.equal(response.source, "Lichess Cloud Evaluation");
    assert.equal(response.selectionMethod, "Ordinary API");
    assert.equal(response.moveOrigin, "Engine Move");
    assert.ok(response.toNodeId, "the checkmated destination position must be stored");
    assert.ok(flashcard, "the mating Black response must remain learnable");

    const destination = await prisma.repertoireNode.findUniqueOrThrow({ where: { id: response.toNodeId } });
    assert.equal(destination.history, completeHistory);
    assert.equal(new Chess(destination.fullFen).isCheckmate(), true);
    assert.equal(await prisma.repertoireMove.count({ where: { fromNodeId: destination.id } }), 0);
    assert.equal(summary.totalRepetitionStops, 0);
    assert.equal(summary.totalTranspositions, 0);
    assert.ok(logs.some(log => log.includes(`Black responds with: ${final.san}`) && log.includes("Eval: M1")));
    assert.ok(logs.some(log => log.includes("Black Responses Without CP: 1")));
    assert.ok(logs.some(log => log.includes("[TERMINAL] Game-over position reached")));
    assert.ok(!logs.some(log => log.includes("[ABORTED]") && log.includes(completeHistory)));

    originalLog("\nSCENARIO RESULT");
    originalLog(`PASS: simulated Lichess mate persisted after ${line}`);
    originalLog(`PASS: ${final.san} is stored as mate -1 and remains learnable`);
    originalLog("PASS: checkmated destination stored and terminated as game-over with no continuation");
    originalLog("PASS: mate evaluation and null-CP counter were logged");
  } finally {
    console.log = originalLog;
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

export async function runScenarioCli(args: string[]) {
  const line = argument(args, "--line");
  const expectation = argument(args, "--expect") ?? "repetition";
  if (!line) {
    throw new Error('Usage: npm run scenario -- --line "1. Nf3 Nf6 2. Ng1 Ng8" --expect repetition|opponent-repetition|mate');
  }
  if (expectation === "repetition") {
    await runScriptedRepetition(line);
  } else if (expectation === "opponent-repetition") {
    await runScriptedOpponentRepetition(line);
  } else if (expectation === "mate") {
    await runScriptedMate(line);
  } else {
    throw new Error(`Unsupported scenario expectation ${expectation}`);
  }
}
