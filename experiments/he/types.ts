export type Period = "fit" | "tune" | "test";
export type Counts = { wins: number; draws: number; losses: number };
export type Observation = {
  gameId: string; date: string; period: Period; opening: "d4-d5" | "caro-kann";
  speed: "rapid" | "classical"; white: string; black: string;
  whiteRating: number; blackRating: number; averageRating: number; ratingGap: number;
  gapBand: "0-49" | "50-99" | "100-199"; moveNumber: number;
  fen: string; positionKey: string; uci: string; san: string; outcome: keyof Counts;
};
export type MoveGroup = Counts & {
  period: Period; positionKey: string; uci: string; fens: string[];
  games: number; moveNumbers: Record<string, number>;
};
export const POLICY = {
  schemaVersion: 2,
  rating: { minimum: 1600, maximumExclusive: 2200, basis: "players-average" },
  speeds: ["rapid", "classical"], ratedOnly: true,
  openings: ["d2d4 d7d5", "e2e4 c7c6"],
  moves: { minimum: 2, maximum: 15, side: "black" },
  excludedTerminations: ["Rules infraction"],
  periods: { fit: [2023, 2024], tune: [2025], test: [2026] },
  sampling: "sha256(seed:gameId), one fixed Black move number per game; missing moves excluded",
  evaluation: { engine: "Stockfish 19", depth: 24, multiPv: 1, view: "white" },
} as const;
