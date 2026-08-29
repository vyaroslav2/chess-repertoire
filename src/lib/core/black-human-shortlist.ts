import { Config } from "./config";
import { isValidUciMove } from "./uci";

export interface BlackHumanCandidate {
  uci: string;
  san: string;

  mastersGames: number;
  mastersBlackWins: number;
  mastersDraws: number;
  mastersWhiteWins: number;

  eliteGames: number;
  eliteBlackWins: number;
  eliteDraws: number;
  eliteWhiteWins: number;

  weightedGames: number;
  weightedBlackWins: number;
  weightedDraws: number;

  blackScore: number;
}

export type ExplorerMoveInput = {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  games: number;
};

export function buildBlackHumanShortlist(
  mastersMoves: ExplorerMoveInput[],
  eliteMoves: ExplorerMoveInput[],
  config: Config
): BlackHumanCandidate[] {
  const candidatesByUci = new Map<string, BlackHumanCandidate>();

  function processMoves(moves: ExplorerMoveInput[], isMasters: boolean) {
    for (const m of moves) {
      if (typeof m.games !== "number" || !Number.isInteger(m.games) || m.games < 0 ||
          typeof m.white !== "number" || !Number.isInteger(m.white) || m.white < 0 ||
          typeof m.draws !== "number" || !Number.isInteger(m.draws) || m.draws < 0 ||
          typeof m.black !== "number" || !Number.isInteger(m.black) || m.black < 0) {
        throw new Error("Invalid human statistics: negative, NaN or non-integer counts");
      }
      
      if (!m.uci || !isValidUciMove(m.uci)) {
        throw new Error("Candidate must have a valid authoritative uci identity");
      }
      const identity = m.uci;

      let candidate = candidatesByUci.get(identity);
      if (!candidate) {
        candidate = {
          uci: m.uci,
          san: m.san,
          mastersGames: 0,
          mastersBlackWins: 0,
          mastersDraws: 0,
          mastersWhiteWins: 0,
          eliteGames: 0,
          eliteBlackWins: 0,
          eliteDraws: 0,
          eliteWhiteWins: 0,
          weightedGames: 0,
          weightedBlackWins: 0,
          weightedDraws: 0,
          blackScore: 0
        };
        candidatesByUci.set(identity, candidate);
      }

      if (candidate.san !== m.san) {
        throw new Error(`Conflicting SAN for same UCI: ${candidate.san} vs ${m.san}`);
      }

      if (isMasters) {
        candidate.mastersGames = m.games;
        candidate.mastersBlackWins = m.black;
        candidate.mastersDraws = m.draws;
        candidate.mastersWhiteWins = m.white;
      } else {
        candidate.eliteGames = m.games;
        candidate.eliteBlackWins = m.black;
        candidate.eliteDraws = m.draws;
        candidate.eliteWhiteWins = m.white;
      }
    }
  }

  processMoves(mastersMoves, true);
  processMoves(eliteMoves, false);

  const shortlist: BlackHumanCandidate[] = [];
  const minGames = config.humanMoves.minimumWeightedGames;
  const weight = config.humanMoves.mastersWeight;
  const anchorGames = config.smoothing.anchorGames;
  const repertoireSidePrior = config.smoothing.repertoireSidePrior;

  for (const candidate of Array.from(candidatesByUci.values())) {
    candidate.weightedGames = (candidate.mastersGames * weight) + candidate.eliteGames;
    candidate.weightedBlackWins = (candidate.mastersBlackWins * weight) + candidate.eliteBlackWins;
    candidate.weightedDraws = (candidate.mastersDraws * weight) + candidate.eliteDraws;

    if (candidate.weightedGames < minGames) {
      continue;
    }

    const priorBlackPoints = anchorGames * repertoireSidePrior;
    candidate.blackScore = (candidate.weightedBlackWins + (0.5 * candidate.weightedDraws) + priorBlackPoints) / (candidate.weightedGames + anchorGames);
    
    // Validate final score is a real number
    if (isNaN(candidate.blackScore) || !isFinite(candidate.blackScore)) {
      throw new Error("Invalid arithmetic produced NaN or non-finite blackScore");
    }

    shortlist.push(candidate);
  }

  shortlist.sort((a, b) => {
    if (a.blackScore !== b.blackScore) {
      return b.blackScore - a.blackScore;
    }
    return a.uci.localeCompare(b.uci);
  });

  return shortlist;
}
