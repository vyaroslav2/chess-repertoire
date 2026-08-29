import { format } from "node:util";
import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";
import { Chess } from "chess.js";

if (fs.existsSync("C:\\Files\\.env")) dotenv.config({ path: "C:\\Files\\.env" });
else dotenv.config();

import { generateRepertoire } from "../src/lib/core/generator";
import { evaluateBlackMove, shouldIncludeWhiteMove, type SelectedResponseResult } from "../src/lib/core/evaluator";
import { fetchAllDatabases, fetchMastersOpeningMetadata } from "../src/lib/api/lichess";
import {
  ensureRepertoireNodeWikibooks,
  prisma,
  readHumanExplorerBucket,
  readRemoteEngineResult,
  type HumanDatabaseType,
  type RemoteEngineEvaluation
} from "../src/lib/db/operations";
import { buildBlackHumanShortlist } from "../src/lib/core/black-human-shortlist";
import {
  computeRemoteEngineEvaluationProfile,
  computeLocalEngineEvaluationProfile,
  defaultConfig,
  getMoveBand
} from "../src/lib/core/config";
import { getCpTolerance, verifyOrdinaryCpSnapshot, type OrdinaryCpSnapshotEntry } from "../src/lib/core/verifier";
import { analyseLichessMateSnapshot, verifyCandidateAgainstLichessMate } from "../src/lib/core/lichess-mate";
import { parseFullFen, positionKeyFromFen } from "../src/lib/core/fen";
import { acquireLock, type LockHandle } from "../src/lib/core/lockfile";
import { UserRequestedStopError } from "../src/lib/api/retry";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const PROJECT_ROOT = path.resolve(__dirname, "..");
const originalFetch = globalThis.fetch;
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
let currentChessFullMove = 0;
let candidateBranch = 0;
let movePairNumber = 0;
let currentMovePairNumber = 0;
let pendingCandidate = false;
let currentHistorySan = "";
const liveCounters = {
  workItemsExamined: 0,
  positionsExpanded: 0,
  depthLimitedStops: 0,
  whiteMoves: 0,
  blackResponses: 0,
  transpositions: 0,
  repetitions: 0,
  missingWhite: 0,
  nullCp: 0
};
type ExplorerBucket = NonNullable<Awaited<ReturnType<typeof fetchAllDatabases>>[number]>;
type ExplorerResultSet = [ExplorerBucket, ExplorerBucket, ExplorerBucket];

function line(char = "=", width = 92): string {
  return char.repeat(width);
}

function elapsed(started: number): string {
  return `${((Date.now() - started) / 1000).toFixed(3)}s`;
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function evaluationText(evaluation: { cp: number | null; mate: number | null }): string {
  if (evaluation.mate !== null) return `mate ${evaluation.mate}`;
  const pawns = (evaluation.cp ?? 0) / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function percentage(part: number, total: number): string {
  return total > 0 ? `${(part / total * 100).toFixed(2)}%` : "0.00%";
}

function printConfiguration(): void {
  console.log(`\n${line()}\nDIAGNOSTIC RUN CONFIGURATION\n${line()}`);
  console.log("Generation depth cap: 3 full moves (testing run).");
  console.log(`Dynamic depth budgets: common=${defaultConfig.generation.commonDepthBudget}, uncommon=${defaultConfig.generation.uncommonDepthBudget}, rare=${defaultConfig.generation.rareDepthBudget} full moves.`);
  console.log(`Dynamic probability bands: common >= ${(defaultConfig.generation.commonProbability * 100).toFixed(2)}%; uncommon >= ${(defaultConfig.generation.uncommonProbability * 100).toFixed(2)}% and < ${(defaultConfig.generation.commonProbability * 100).toFixed(2)}%; rare < ${(defaultConfig.generation.uncommonProbability * 100).toFixed(2)}%.`);
  console.log(`Move-number bands: early through ${defaultConfig.moveBands.earlyThrough}; middle through ${defaultConfig.moveBands.middleThrough}; later moves use the late band.`);
  console.log(`White Amateur popularity thresholds: early=${(defaultConfig.whiteMoveFiltering.mainlinePopularity.early * 100).toFixed(2)}%, middle=${(defaultConfig.whiteMoveFiltering.mainlinePopularity.middle * 100).toFixed(2)}%, late=${(defaultConfig.whiteMoveFiltering.mainlinePopularity.late * 100).toFixed(2)}%.`);
  console.log(`API CP tolerances: early=${defaultConfig.engineVerification.apiToleranceCp.early}, middle=${defaultConfig.engineVerification.apiToleranceCp.middle}, late=${defaultConfig.engineVerification.apiToleranceCp.late}.`);
  console.log(`Local CP tolerances: early=${defaultConfig.engineVerification.localToleranceCp.early}, middle=${defaultConfig.engineVerification.localToleranceCp.middle}, late=${defaultConfig.engineVerification.localToleranceCp.late}.`);
  console.log(`Black minimum weighted games: ${defaultConfig.humanMoves.minimumWeightedGames}; Masters weight: ${defaultConfig.humanMoves.mastersWeight}.`);
  console.log(`Repertoire-side smoothing: anchor games=${defaultConfig.smoothing.anchorGames}; cautious prior score=${(defaultConfig.smoothing.repertoireSidePrior * 100).toFixed(2)}%. In this Black repertoire, that is a ${(defaultConfig.smoothing.repertoireSidePrior * 100).toFixed(2)}% Black score (equivalently ${(100 - defaultConfig.smoothing.repertoireSidePrior * 100).toFixed(2)}% White score).`);
  console.log(`Lichess Cloud: MultiPV=${defaultConfig.api.lichessCloudEval.multiPv}; retries=${defaultConfig.api.lichessCloudEval.retryAttempts}. ChessDB retries=${defaultConfig.api.chessDb.retryAttempts}.`);
  console.log(`Lichess request gate: one in-flight request at a time; minimum ${defaultConfig.api.betweenRequestDelayMs}ms between request starts; any HTTP 429 pauses all Lichess requests for at least ${defaultConfig.api.rateLimitRetryDelayMs}ms.`);
  console.log(`Local Deep Stockfish: depth=${defaultConfig.engine.deepVerification.depth}; MultiPV=${defaultConfig.engine.deepVerification.multiPv}.`);
  console.log(`Explorer filters (fixed for this run): Elite speeds=${defaultConfig.humanExplorerRequest.elite.speeds.join(",")}, ratings=${defaultConfig.humanExplorerRequest.elite.ratings.join(",")}; Amateur speeds=${defaultConfig.humanExplorerRequest.amateur.speeds.join(",")}, ratings=${defaultConfig.humanExplorerRequest.amateur.ratings.join(",")}.`);
  console.log("Masters, Elite, and Amateur are separate cached source buckets and may require separate HTTP requests. White selection uses only Amateur; Masters supplies opening metadata; Masters plus Elite supply Black-response statistics.");
  console.log(`Move-number band endpoints are inclusive: full move ${defaultConfig.moveBands.earlyThrough} is early and full move ${defaultConfig.moveBands.middleThrough} is middle.`);
  console.log("All engine evaluations use White's point of view: positive is better for White, negative is better for Black. Example: +0.32 means +32 cp for White.");
  console.log("A remote-engine cache stores the complete move/evaluation snapshot returned by one source for one exact Full FEN and request profile.");
  console.log(`Our application—not Stockfish—hashes role=deep-local, depth=${defaultConfig.engine.deepVerification.depth}, and MultiPV=${defaultConfig.engine.deepVerification.multiPv} with SHA-256 to produce the local-engine profile ID.`);
  console.log("The profile hash is a non-reversible fingerprint of those settings only. Full FEN and candidate UCI are separate database-key fields; they are not inside the profile hash.");
  console.log("Baseline cache identity = exact Full FEN + profile ID. Exact-candidate cache identity = exact Full FEN + candidate UCI + profile ID.");
  console.log("The profile does not currently distinguish Stockfish version/binary build, Threads (parallel CPU workers), Hash (transposition-table memory), neural-network file, or other engine options.");
  console.log("A baseline is Stockfish's unrestricted top move; an exact candidate entry is a search restricted to one human candidate.");
  console.log("Local verification finds or reuses one baseline, then sequentially finds or reuses a separate single-PV searchmoves evaluation for each human candidate that still needs verification. Every candidate is compared with the same baseline; if the candidate is the baseline move, no restricted search is needed.");
  console.log("Local verification example: baseline d5=+0.20; restricted candidate g6=+1.30, loss=110cp => REJECT; restricted candidate Nf6=+0.65, loss=45cp => ACCEPT.");
  console.log("\nFORMULAS USED THROUGHOUT THE RUN");
  console.log("White conditional popularity = Amateur games for the move / total Amateur games.");
  console.log("Resulting route probability = route probability before White move × White move share at this position. Black's deterministic response does not multiply it again.");
  console.log(`Black weighted games = Masters games × ${defaultConfig.humanMoves.mastersWeight} + Elite games.`);
  console.log(`Black score = (weighted Black wins + 0.5 × weighted draws + ${defaultConfig.smoothing.anchorGames} × ${defaultConfig.smoothing.repertoireSidePrior}) / (weighted games + ${defaultConfig.smoothing.anchorGames}).`);
  console.log(`Smoothing adds ${(defaultConfig.smoothing.anchorGames * defaultConfig.smoothing.repertoireSidePrior).toFixed(0)} result points—not wins—from ${defaultConfig.smoothing.anchorGames} imaginary games. A win is 1 point, a draw is 0.5, and a loss is 0; small samples stay near ${(defaultConfig.smoothing.repertoireSidePrior * 100).toFixed(2)}%, while large samples dominate the prior.`);
  console.log("Evaluations use White's perspective, so Black prefers the lowest number: negative favors Black and positive favors White.");
  console.log("CP loss = candidate evaluation − best evaluation. Example: g6=-10cp is better for Black than d5=+20cp because -10 is lower; d5's loss is 20-(-10)=30cp, so it passes an 80cp tolerance and fails a 20cp tolerance.");
  console.log("\nCOUNTER DEFINITIONS");
  console.log("Missing White Moves: a non-terminal position for which the required Amateur Explorer request succeeded but returned zero moves: no games match the configured speed/rating filters. API failure is a hard error; existing Amateur moves all below threshold are PRUNED instead.");
  console.log("Black Responses Without CP: selected Black responses with no centipawn value because a valid mate value is stored instead. The evaluation is available as mate distance; this can come from a Lichess mate candidate/fallback, a supported ChessDB mate result, a local Stockfish mate fallback, or an engine-evaluated hardcoded response.");
  console.log("Transpositions: a different route reached a canonical response position already processed in this run. Its incoming route probability is reconciled into the canonical position, while the canonical Black response and continuation are reused.");
  console.log("Repetition Stops: the current route returned to one of its own ancestor positions; the terminal move is retained and expansion stops.");
  console.log(`${line()}\n`);
}

function fullmoveNumber(fullFen: string): number {
  return Number(parseFullFen(fullFen).split(" ")[5]);
}

function installHttpObserver(): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const started = Date.now();
    console.log(`\n[HTTP REQUEST] ${method} ${url}`);
    console.log("  Authentication values are deliberately not printed.");
    try {
      const response = await originalFetch(input, init);
      console.log(`[HTTP RESPONSE] ${response.status} ${response.statusText || ""} in ${elapsed(started)}`);
      if (!response.ok) console.warn(`[HTTP WARNING] ${url} failed with HTTP ${response.status}; retry/fallback handling follows below.`);
      try {
        const clone = response.clone();
        const contentType = clone.headers.get("content-type") ?? "";
        const body = contentType.includes("json") ? await clone.json() : await clone.text();
        console.log("[HTTP RESPONSE BODY]");
        console.log(typeof body === "string" ? body : pretty(body));
      } catch (observerError) {
        console.log(`[HTTP BODY OBSERVER] Could not display the cloned body: ${observerError instanceof Error ? observerError.message : String(observerError)}`);
      }
      return response;
    } catch (error) {
      console.log(`[HTTP FAILURE] after ${elapsed(started)}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }) as typeof fetch;
}

function logExplorerRows(label: string, data: ExplorerBucket): void {
  console.log(`\n[${label}] total games: ${data.totalGames}; returned moves: ${data.moves.length}`);
  for (const move of [...data.moves].sort((a, b) => b.games - a.games || a.uci.localeCompare(b.uci))) {
    console.log(`  ${move.san} (${move.uci}): games=${move.games}; White=${move.white} (${percentage(move.white, move.games)}); draws=${move.draws} (${percentage(move.draws, move.games)}); Black=${move.black} (${percentage(move.black, move.games)})`);
  }
  if (data.moves.length === 0) console.log("  Successful empty bucket: no moves returned.");
}

async function diagnosticFetchAllDatabases(fen: string, snapshotId: string) {
  const started = Date.now();
  const fullFen = parseFullFen(fen);
  const positionKey = positionKeyFromFen(fullFen);
  console.log(`\n[HUMAN EXPLORER INPUT] Full FEN: ${fullFen}`);
  console.log(`[HUMAN EXPLORER CACHE KEY] snapshot=${snapshotId}; position=${positionKey}`);
  for (const databaseType of ["MASTERS", "ELITE", "AMATEUR"] as HumanDatabaseType[]) {
    const cached = await readHumanExplorerBucket(snapshotId, positionKey, databaseType);
    const status = cached.status === "empty" ? "VALID_ABSENCE" : cached.status === "success" ? "PRESENT" : "UNCHECKED";
    console.log(`[CACHE ${databaseType}] retrieval=${cached.status === "missing" ? "MISS" : "HIT"}; status=${status}; API request required=${cached.status === "missing" ? "yes" : "no"}`);
  }

  const result = await fetchAllDatabases(fullFen, snapshotId) as ExplorerResultSet;
  logExplorerRows("AMATEUR RAW DATA — LICHESS OPENING EXPLORER", result[2]);

  const storedOpening = await prisma.repertoireNode.findFirst({
    where: { fullFen, pgn: currentHistorySan },
    select: { eco: true, openingName: true, openingMetadataStatus: true, openingMetadataSource: true }
  });
  const fetchedOpening = result[0].opening;
  const retrieval = fetchedOpening ? "fresh Masters response" : storedOpening?.openingMetadataStatus ? "exact-history stored metadata" : "not yet available";
  const source = fetchedOpening ? "Lichess Opening Explorer — Masters metadata" : storedOpening?.openingMetadataSource === "LICHESS_MASTERS" ? "Lichess Opening Explorer — Masters metadata" : "unavailable";
  console.log(`\n[OPENING METADATA] history=${currentHistorySan || "(root)"}; retrieval=${retrieval}; source=${source}; status=${fetchedOpening || storedOpening?.openingMetadataStatus === "PRESENT" ? "PRESENT" : storedOpening?.openingMetadataStatus ?? "UNCHECKED"}; ECO=${fetchedOpening?.eco ?? storedOpening?.eco ?? "unavailable"}; name=${fetchedOpening?.name ?? storedOpening?.openingName ?? "unavailable"}`);

  const moveNumber = fullmoveNumber(fullFen);
  const band = getMoveBand(moveNumber, defaultConfig);
  const threshold = defaultConfig.whiteMoveFiltering.mainlinePopularity[band];
  const amateurSan = new Set(result[2].moves.map(move => move.san));
  const whiteDecisions = [...amateurSan].map(san => ({
    san,
    decision: shouldIncludeWhiteMove(san, moveNumber, result[2].moves, result[2].totalGames)
  })).sort((a, b) => b.decision.amateurGames - a.decision.amateurGames || a.san.localeCompare(b.san));
  console.log(`\n[WHITE FILTER] full move=${moveNumber}; band=${band}; minimum Amateur share=${(threshold * 100).toFixed(2)}%`);
  if (result[2].moves.length === 0) {
    console.log("  Result: MISSING WHITE MOVES — the required Amateur request succeeded with zero moves, so Amateur-only White selection cannot continue this non-terminal branch.");
  }
  for (const { san, decision } of whiteDecisions) {
    console.log(`  ${san}: Amateur games=${decision.amateurGames}/${result[2].totalGames}; share=${(decision.probability * 100).toFixed(3)}%; ${decision.include ? "KEEP" : "ABORT"}`);
    console.log(decision.include
      ? `    Reason: share meets the ${(threshold * 100).toFixed(2)}% threshold.`
      : `    Reason: share is below the ${(threshold * 100).toFixed(2)}% threshold.`);
  }
  console.log(`[HUMAN EXPLORER COMPLETE] ${elapsed(started)}`);
  return result;
}

async function diagnosticFetchOpeningMetadata(fen: string) {
  const opening = await fetchMastersOpeningMetadata(fen);
  console.log(opening
    ? `[OPENING METADATA FETCH] retrieval=fresh Masters response; source=Lichess Opening Explorer — Masters metadata; status=PRESENT; ECO=${opening.eco}; name=${opening.name}`
    : "[OPENING METADATA FETCH] retrieval=fresh Masters response; source=Lichess Opening Explorer — Masters metadata; status=VALID_ABSENCE");
  return opening;
}

function logRemoteSnapshot(source: string, result: Awaited<ReturnType<typeof readRemoteEngineResult>>): void {
  console.log(`\n[${source} SNAPSHOT] cache status=${result.status.toUpperCase()}`);
  if (result.status === "empty") console.log("  Successful empty snapshot: this source has no usable moves.");
  if (result.status === "success") {
    const evaluations = source === "LICHESS"
      ? [...result.evaluations].sort(compareBlackEvaluations)
      : result.evaluations;
    for (const evaluation of evaluations) {
      console.log(`  ${evaluation.san ?? "?"} (${evaluation.uci}): ${evaluationText(evaluation)}`);
    }
  }
}

function compareBlackEvaluations(a: RemoteEngineEvaluation, b: RemoteEngineEvaluation): number {
  const category = (evaluation: RemoteEngineEvaluation): number => {
    if (evaluation.mate !== null && evaluation.mate < 0) return 0;
    if (evaluation.cp !== null) return 1;
    if (evaluation.mate !== null && evaluation.mate > 0) return 2;
    return 3;
  };
  const categoryDifference = category(a) - category(b);
  if (categoryDifference !== 0) return categoryDifference;
  if (a.cp !== null && b.cp !== null) return a.cp - b.cp || a.uci.localeCompare(b.uci);
  if (a.mate !== null && b.mate !== null) return b.mate - a.mate || a.uci.localeCompare(b.uci);
  return a.uci.localeCompare(b.uci);
}

function ordinaryEntries(evaluations: RemoteEngineEvaluation[]): OrdinaryCpSnapshotEntry[] | null {
  if (evaluations.some(item => item.mate !== null)) return null;
  return evaluations.map(item => ({ uci: item.uci, cp: item.cp as number, san: item.san, mate: null }));
}

function explainOrdinaryCandidate(
  source: string,
  candidateUci: string,
  evaluations: RemoteEngineEvaluation[],
  tolerance: number
): "ACCEPT" | "REJECT" | "INCONCLUSIVE" {
  const snapshot = ordinaryEntries(evaluations);
  if (!snapshot || snapshot.length === 0) {
    console.log(`    ${source}: INCONCLUSIVE because the snapshot is empty or contains mate evaluations.`);
    return "INCONCLUSIVE";
  }
  const ordered = [...snapshot].sort((a, b) => a.cp - b.cp || a.uci.localeCompare(b.uci));
  const best = ordered[0];
  const candidate = ordered.find(item => item.uci === candidateUci);
  const decision = verifyOrdinaryCpSnapshot(candidateUci, snapshot, tolerance);
  if (candidate) {
    const loss = candidate.cp - best.cp;
    console.log(`    ${source}: best=${best.uci} ${best.cp}cp; candidate=${candidate.cp}cp; loss=${loss}cp; allowed=${tolerance}cp => ${decision}`);
  } else {
    const boundary = ordered[ordered.length - 1];
    const boundaryLoss = boundary.cp - best.cp;
    console.log(`    ${source}: candidate absent; last returned move=${boundary.uci} at loss=${boundaryLoss}cp; allowed=${tolerance}cp => ${decision}`);
    console.log(decision === "REJECT"
      ? "      The returned boundary is already outside tolerance, so an absent move cannot survive."
      : "      The returned boundary is still inside tolerance, so this source cannot decide; fall through.");
  }
  return decision;
}

async function diagnosticEvaluateBlackMove(
  fen: string,
  chess: Chess,
  moveNumber: number,
  previousMovesSan: string[],
  snapshotId: string
): Promise<SelectedResponseResult> {
  const started = Date.now();
  const fullFen = parseFullFen(fen);
  const [masters, elite] = await fetchAllDatabases(fullFen, snapshotId) as ExplorerResultSet;
  const candidates = buildBlackHumanShortlist(masters.moves, elite.moves, defaultConfig);
  const lichessProfile = computeRemoteEngineEvaluationProfile("LICHESS", defaultConfig);
  const chessDbProfile = computeRemoteEngineEvaluationProfile("CHESSDB", defaultConfig);
  const lichessBefore = await readRemoteEngineResult(fullFen, "LICHESS", lichessProfile);
  const chessDbBefore = await readRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile);
  const localProfile = computeLocalEngineEvaluationProfile(defaultConfig);
  const [localBaselineBefore, localCandidatesBefore] = await Promise.all([
    prisma.localEngineBaseline.findUnique({ where: { fullFen_evaluationProfile: { fullFen, evaluationProfile: localProfile } } }),
    prisma.localEngineCandidate.findMany({ where: { fullFen, evaluationProfile: localProfile } })
  ]);

  console.log(`\n[BLACK RESPONSE INPUT] history=${previousMovesSan.join(" ")}; Full FEN=${fullFen}`);
  logExplorerRows("BLACK MASTERS RAW DATA — LICHESS OPENING EXPLORER", masters);
  logExplorerRows("BLACK ELITE RAW DATA — LICHESS OPENING EXPLORER", elite);
  console.log(`[REMOTE CACHE BEFORE] Lichess=${lichessBefore.status}; ChessDB=${chessDbBefore.status}`);
  console.log(`[LOCAL CACHE BEFORE] baseline=${localBaselineBefore ? "hit" : "miss"}; exact candidates=${localCandidatesBefore.length}; role=available only if local fallback or verification is needed.`);
  console.log(`[MINIMUM WEIGHTED GAMES] ${defaultConfig.humanMoves.minimumWeightedGames}`);
  const survivingUci = new Set(candidates.map(candidate => candidate.uci));
  const rawByUci = new Map<string, { san: string; masters: number; elite: number }>();
  for (const move of masters.moves) rawByUci.set(move.uci, { san: move.san, masters: move.games, elite: 0 });
  for (const move of elite.moves) {
    const raw = rawByUci.get(move.uci) ?? { san: move.san, masters: 0, elite: 0 };
    raw.elite = move.games;
    rawByUci.set(move.uci, raw);
  }
  for (const [uci, raw] of rawByUci) {
    if (survivingUci.has(uci)) continue;
    const weighted = raw.masters * defaultConfig.humanMoves.mastersWeight + raw.elite;
    console.log(`  ${raw.san} (${uci}): Masters=${raw.masters}, Elite=${raw.elite}, weighted=${weighted} => ABORT`);
    console.log(`    Reason: ${weighted} weighted games is below the required ${defaultConfig.humanMoves.minimumWeightedGames}.`);
  }
  for (const candidate of candidates) {
    console.log(`  ${candidate.san} (${candidate.uci}): Black score=${(candidate.blackScore * 100).toFixed(3)}%; Masters=${candidate.mastersGames}, Elite=${candidate.eliteGames}, weighted=${candidate.weightedGames}, weighted Black wins=${candidate.weightedBlackWins}, weighted draws=${candidate.weightedDraws}`);
  }
  if (candidates.length === 0) console.log("  No human response survived the weighted-games threshold; local fallback will be required.");

  const result = await evaluateBlackMove(fullFen, chess, moveNumber, previousMovesSan, snapshotId);
  const lichessAfter = await readRemoteEngineResult(fullFen, "LICHESS", lichessProfile);
  const chessDbAfter = await readRemoteEngineResult(fullFen, "CHESSDB", chessDbProfile);
  const [localBaselineAfter, localCandidatesAfter] = await Promise.all([
    prisma.localEngineBaseline.findUnique({ where: { fullFen_evaluationProfile: { fullFen, evaluationProfile: localProfile } } }),
    prisma.localEngineCandidate.findMany({ where: { fullFen, evaluationProfile: localProfile }, orderBy: { candidateUci: "asc" } })
  ]);
  logRemoteSnapshot("LICHESS", lichessAfter);
  logRemoteSnapshot("CHESSDB", chessDbAfter);
  console.log(`\n[LOCAL ENGINE SNAPSHOT] profile=${localProfile}`);
  console.log(localBaselineAfter
    ? `  baseline ${localBaselineAfter.san ?? "?"} (${localBaselineAfter.bestUci}): ${evaluationText(localBaselineAfter)}${localBaselineBefore ? " [CACHE HIT]" : " [CALCULATED THIS CALL]"}`
    : "  No local baseline was needed.");
  for (const candidate of localCandidatesAfter) {
    const wasCached = localCandidatesBefore.some(before => before.candidateUci === candidate.candidateUci);
    console.log(`  exact candidate ${candidate.san ?? "?"} (${candidate.candidateUci}): ${evaluationText(candidate)}${wasCached ? " [CACHE HIT]" : " [CALCULATED THIS CALL]"}`);
  }
  const localWasUsed = result.source === "Local Deep Stockfish" || result.deepVerified;
  console.log(`[LOCAL ENGINE USAGE] used=${localWasUsed ? "yes" : "no"}; ${localWasUsed ? "local fallback or verification contributed to this decision." : "cached local entries were not used because remote evidence or an opening rule decided this response."}`);

  const tolerance = getCpTolerance(moveNumber, false);
  console.log(`\n[WATERFALL EXPLANATION] API tolerance=${tolerance}cp`);
  const hardcoded = moveNumber === 1 && previousMovesSan.length === 1 && (previousMovesSan[0] === "e4" || previousMovesSan[0] === "d4");
  if (hardcoded) {
    console.log(`  Opening rule fixes Black's response as ${result.selectedMoveSan}. Engines provide evidence but do not choose a competing move.`);
  } else {
    for (const candidate of candidates) {
      console.log(`  Candidate ${candidate.san} (${candidate.uci}):`);
      let lichessDecision: "ACCEPT" | "REJECT" | "INCONCLUSIVE" = "INCONCLUSIVE";
      if (lichessAfter.status === "success") {
        const mateContext = analyseLichessMateSnapshot(lichessAfter.evaluations);
        if (mateContext.kind === "FORCED_MATE") {
          lichessDecision = verifyCandidateAgainstLichessMate(candidate.uci, mateContext);
          console.log(`    Lichess mate line => ${lichessDecision}. A mate rejection is final for this candidate.`);
        } else {
          lichessDecision = explainOrdinaryCandidate("Lichess", candidate.uci, lichessAfter.evaluations, tolerance);
        }
      } else console.log("    Lichess unavailable/empty => fall through to ChessDB.");
      if (lichessDecision === "REJECT") continue;
      if (lichessDecision === "ACCEPT") break;

      let chessDecision: "ACCEPT" | "REJECT" | "INCONCLUSIVE" = "INCONCLUSIVE";
      if (chessDbAfter.status === "success") chessDecision = explainOrdinaryCandidate("ChessDB", candidate.uci, chessDbAfter.evaluations, tolerance);
      else console.log("    ChessDB unavailable/empty => fall through to Local Deep Stockfish.");
      if (chessDecision === "REJECT") continue;
      if (chessDecision === "ACCEPT") break;
      console.log(`    Local Deep Stockfish is required; local tolerance=${getCpTolerance(moveNumber, true)}cp, depth=${defaultConfig.engine.deepVerification.depth}, MultiPV=${defaultConfig.engine.deepVerification.multiPv}.`);
      if (candidate.uci === result.selectedUci) break;
    }
  }
  console.log(`\n[FINAL BLACK DECISION] ${result.selectedMoveSan} (${result.selectedUci})`);
  console.log(`  source=${result.source}; evaluation=${evaluationText(result)}; selection method=${result.selectionMethod}; origin=${result.moveOrigin}; deep verified=${result.deepVerified}`);
  console.log(`  human statistics=${result.selectedStats ? pretty(result.selectedStats) : "none (engine-origin fallback)"}`);
  console.log(`[BLACK RESPONSE COMPLETE] ${elapsed(started)}`);
  return { ...result, openingMetadata: masters.opening, openingMetadataRetrieval: masters.retrieval };
}

async function diagnosticWikibooks(nodeId: string) {
  const before = await prisma.repertoireNode.findUniqueOrThrow({
    where: { id: nodeId },
    select: { history: true, wikibooksChecked: true, wikiText: true, eco: true, openingName: true, openingMetadataStatus: true, openingMetadataSource: true }
  });
  const started = Date.now();
  const result = await ensureRepertoireNodeWikibooks(nodeId);
  const after = await prisma.repertoireNode.findUniqueOrThrow({
    where: { id: nodeId },
    select: { wikibooksChecked: true, wikiText: true }
  });
  console.log(`\n[OPENING METADATA] history=${before.history || "(root)"}; retrieval=stored node metadata; source=${before.openingMetadataSource === "LICHESS_MASTERS" ? "Lichess Opening Explorer — Masters metadata" : "unavailable"}; status=${before.openingMetadataStatus ?? "UNCHECKED"}; ECO=${before.eco ?? "unavailable"}; name=${before.openingName ?? "unavailable"}`);
  console.log(`[WIKIBOOKS] history=${before.history || "(root)"}; retrieval=${before.wikibooksChecked ? "CACHE" : "FRESH"}; status=${after.wikiText === null ? "VALID_ABSENCE" : "PRESENT"}; source=Wikibooks; lookup performed=${before.wikibooksChecked ? "no" : "yes"}; characters=${after.wikiText?.length ?? 0}; elapsed=${elapsed(started)}`);
  return result;
}

function installBlockFormatter(write: (...args: unknown[]) => void): () => void {
  const diagnosticLog = (...args: unknown[]) => {
    const text = format(...args);
    const normalized = text.trim();
    const queue = normalized.match(/^--- Queue Size: (\d+) \| Maximum: (\d+) \| Move: (\d+) ---$/);
    if (queue) {
      currentChessFullMove = Number(queue[3]);
      candidateBranch = 0;
      pendingCandidate = false;
      liveCounters.workItemsExamined++;
      write(`\n${line()}\nMOVE ${queue[3]}\nPositions still waiting after this one was dequeued: ${queue[1]}\nMaximum work items observed at once, including the position being processed: ${queue[2]}\n${line()}`);
      write(`[LIVE COUNTER] Work items examined: ${liveCounters.workItemsExamined} (the root is work item 1).`);
      return;
    }
    if (normalized.includes("--- [CHECKPOINT] Node Finished ---")) {
      if (pendingCandidate) {
        liveCounters.transpositions++;
        pendingCandidate = false;
        write(`[LIVE COUNTER] Transpositions: +1 => ${liveCounters.transpositions} total.`);
      }
      write(`\n${line("-")}\nMOVE ${currentChessFullMove} NODE EXPANSION COMPLETE`);
      return;
    }
    if (normalized.startsWith("History:")) {
      currentHistorySan = normalized.slice("History:".length).trim();
      write(...args);
      return;
    }
    if (normalized.startsWith("[HUMAN EXPLORER INPUT]")) {
      liveCounters.positionsExpanded++;
      write(`[LIVE COUNTER] Positions expanded: ${liveCounters.positionsExpanded}.`);
      write(...args);
      return;
    }
    if (normalized === "--------------------------------------------") return;
    const found = normalized.match(/^Found (\d+) White moves to process\.$/);
    if (found) {
      liveCounters.whiteMoves += Number(found[1]);
      write(...args);
      write(`[LIVE COUNTER] White moves found: +${found[1]} => ${liveCounters.whiteMoves} total.`);
      return;
    }
    const evaluating = normalized.match(/^Evaluating White Move: (.+?) \(Reason:/);
    if (evaluating) {
      if (pendingCandidate) {
        liveCounters.transpositions++;
        write(`[LIVE COUNTER] Transpositions: +1 => ${liveCounters.transpositions} total.`);
      }
      candidateBranch++;
      movePairNumber++;
      currentMovePairNumber = movePairNumber;
      pendingCandidate = true;
      write(`\n${line("=")}\nMOVE PAIR ${currentMovePairNumber} — MOVE ${currentChessFullMove} — BRANCH ${candidateBranch}\nWhite half-move: ${evaluating[1]}\n${line("=")}`);
      write(normalized);
      return;
    }
    if (normalized.startsWith("Black responds with:")) {
      liveCounters.blackResponses++;
      if (normalized.includes("Eval: M")) liveCounters.nullCp++;
      pendingCandidate = false;
      write(normalized);
      write(`[LIVE COUNTER] Black responses evaluated: +1 => ${liveCounters.blackResponses} total.`);
      write(`[MOVE PAIR ${currentMovePairNumber} COMPLETE] White and Black half-moves are now selected for MOVE ${currentChessFullMove}, BRANCH ${candidateBranch}.\n${line("=")}`);
      return;
    }
    if (normalized.startsWith("[TRANSPOSITION]")) {
      liveCounters.transpositions++;
      pendingCandidate = false;
      write(normalized);
      write(`[LIVE COUNTER] Transpositions: +1 => ${liveCounters.transpositions} total.`);
      return;
    }
    if (normalized.startsWith("[REPETITION STOP]")) {
      liveCounters.repetitions++;
      pendingCandidate = false;
      write(normalized);
      write(`[LIVE COUNTER] Repetition Stops: +1 => ${liveCounters.repetitions} total.`);
      return;
    }
    if (normalized.startsWith("[DEPTH-LIMIT STOP]")) {
      liveCounters.depthLimitedStops++;
      write(normalized);
      write(`[LIVE COUNTER] Depth-limited stops: +1 => ${liveCounters.depthLimitedStops} total.`);
      return;
    }
    if (normalized.startsWith("[MISSING WHITE MOVES]")) {
      liveCounters.missingWhite++;
      write(normalized);
      write(`[LIVE COUNTER] Missing White moves: +1 => ${liveCounters.missingWhite} total.`);
      return;
    }
    if (normalized.startsWith("[Run totals] Elapsed:")) {
      write(`${normalized}\n  “Work Items Examined” includes the starting/root position before any move has been played.`);
      return;
    }
    write(...args);
  };
  console.log = diagnosticLog;
  console.warn = (...args: unknown[]) => diagnosticLog("[WARNING]", ...args);
  console.error = (...args: unknown[]) => diagnosticLog("[ERROR]", ...args);
  return () => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  };
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const localOffsetMinutes = -startedAt.getTimezoneOffset();
  const offsetSign = localOffsetMinutes >= 0 ? "+" : "-";
  const offset = `${offsetSign}${String(Math.floor(Math.abs(localOffsetMinutes) / 60)).padStart(2, "0")}:${String(Math.abs(localOffsetMinutes) % 60).padStart(2, "0")}`;
  const localStarted = `${startedAt.getFullYear()}-${String(startedAt.getMonth() + 1).padStart(2, "0")}-${String(startedAt.getDate()).padStart(2, "0")}T${String(startedAt.getHours()).padStart(2, "0")}:${String(startedAt.getMinutes()).padStart(2, "0")}:${String(startedAt.getSeconds()).padStart(2, "0")}.${String(startedAt.getMilliseconds()).padStart(3, "0")}${offset}`;
  const stamp = localStarted.replace(/:/g, "").replace(/\.\d{3}/, "").replace("+", "plus");
  const logPath = path.join(PROJECT_ROOT, "docs", "logs", `treegen-diagnostic-${stamp}.md`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, `# Detailed Tree Generator Diagnostic\n\nStarted (local): ${localStarted}\nStarted (UTC): ${startedAt.toISOString()}\n\n\`\`\`text\n`);
  const write = (...args: unknown[]) => {
    originalLog(...args);
    fs.appendFileSync(logPath, `${format(...args)}\n`);
  };
  const restoreConsole = installBlockFormatter(write);
  let lock: LockHandle | null = null;
  let stopRequested = false;
  const requestStop = () => {
    stopRequested = true;
    write("Stop requested; diagnostic generation will stop after the current position.");
  };
  let failure: unknown = null;

  try {
    process.on("SIGINT", requestStop);
    lock = acquireLock("treegen-diagnostic");
    installHttpObserver();
    console.log("DETAILED DIAGNOSTIC MODE — the production generator and decision functions are unchanged.");
    console.log(`Diagnostic log: ${logPath}`);
    printConfiguration();
    await generateRepertoire(START_FEN, 3, {
      fetchDatabases: diagnosticFetchAllDatabases,
      fetchOpeningMetadata: diagnosticFetchOpeningMetadata,
      responseEvaluator: diagnosticEvaluateBlackMove,
      ensureNodeWikibooks: diagnosticWikibooks,
      shouldStop: () => stopRequested
    });
  } catch (error) {
    failure = error;
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  } finally {
    globalThis.fetch = originalFetch;
    process.off("SIGINT", requestStop);
    try { await prisma.$disconnect(); } catch (error) { if (!failure) failure = error; }
    try { lock?.release(); } catch (error) { if (!failure) failure = error; }
    const finished = new Date();
    fs.appendFileSync(logPath, `\n${failure ? "[FAILED/STOPPED]" : "[FINISHED]"} ${failure instanceof Error ? failure.message : failure ?? "Detailed generation completed"}\nFinished: ${finished.toISOString()}\nElapsed: ${finished.getTime() - startedAt.getTime()}ms\n\`\`\`\n`);
    restoreConsole();
  }

  if (failure) throw failure;
}

if (require.main === module) {
  main().catch(error => {
    if (error instanceof UserRequestedStopError) originalError(`Diagnostic generation stopped: ${error.message}`);
    else originalError("Detailed diagnostic generation failed:", error);
    process.exitCode = 1;
  });
}
