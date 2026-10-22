import mysql from "mysql2/promise";
import { readGames, gameRecord, type GameRecord } from "./pgn";
import { sampledMoves } from "./dots";

// Connection details come from HE_MYSQL_URL (mysql://he:<password>@127.0.0.1:3306/he),
// so no password lives in the code. Error messages never repeat the URL.
export function mysqlUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.HE_MYSQL_URL;
  if (!url) throw new Error("HE_MYSQL_URL is not set; see the README's MySQL section.");
  if (!/^mysql:\/\/[^:@/]+:[^@]+@[^:/]+:\d+\/\w+$/.test(url)) throw new Error("HE_MYSQL_URL must look like mysql://user:password@host:port/database.");
  return url;
}

export async function connect() {
  // Dates come back as "2024-01-01", not as local-time Date objects that can shift by a day.
  return mysql.createConnection({ uri: mysqlUrl(), dateStrings: true });
}

export async function checkConnection() {
  const connection = await connect();
  try {
    const [rows] = await connection.query("SELECT VERSION() AS version, CURRENT_USER() AS user, DATABASE() AS db");
    return (rows as { version: string; user: string; db: string }[])[0];
  } finally { await connection.end(); }
}

// Why the game stopped, filled in by MySQL from the other columns. Only "time" comes from
// Lichess directly. "resigned" is inferred (decisive, no mate, no flag) and may include
// players who left; "drawn" is an agreed draw, repetition or the 50-move rule.
export const STOP_REASON = `ENUM('checkmate','stalemate','insufficient','time','drawn','resigned') AS (CASE
    WHEN final_state <> 'undefined' THEN final_state
    WHEN termination = 'Time forfeit' THEN 'time'
    WHEN result = '1/2-1/2' THEN 'drawn'
    ELSE 'resigned' END) STORED`;
// One row per game. The full mainline is kept; queries can show only the opening.
// IDs and moves compare case-sensitively: Lichess IDs mix cases, and bxc4 is not Bxc4.
export const GAMES_TABLE = `CREATE TABLE IF NOT EXISTS games (
  game_id   CHAR(8) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  game_date DATE NOT NULL,
  white_elo SMALLINT NOT NULL,
  black_elo SMALLINT NOT NULL,
  result    ENUM('1-0','0-1','1/2-1/2') NOT NULL,
  termination VARCHAR(20) NOT NULL,                       -- Lichess's reason: Normal, Time forfeit…
  final_state ENUM('checkmate','stalemate','insufficient','undefined') NOT NULL,  -- undefined when the board settles nothing
  stop_reason ${STOP_REASON},
  eco       CHAR(3) CHARACTER SET ascii NOT NULL,             -- Lichess's ECO code, e.g. D30; ? if missing
  opening   VARCHAR(150) NOT NULL,                          -- Lichess's opening name for the whole game; ? if missing
  uci_moves TEXT CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  san_moves TEXT CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  INDEX (uci_moves(100)),
  INDEX (san_moves(100))
)`;

// One row per game: its sampled Black move (HER.12) and that move's eval. Joins games by game_id.
// A move has a cp score or a mate score, never both, never neither.
export const SAMPLED_MOVES_TABLE = `CREATE TABLE IF NOT EXISTS sampled_moves (
  game_id     CHAR(8) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  run         VARCHAR(80) NOT NULL,                         -- the HE run it came from, e.g. 2024-02-3000mb
  move_number TINYINT NOT NULL,                             -- Black's move number, 2–15
  san         VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  uci         VARCHAR(5) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  fen         VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,  -- the position before the move
  group_id    INT NOT NULL,                                 -- the group's job id in jobs-a/b and results-a/b
  results     ENUM('a','b') NOT NULL,                       -- which results file holds the search
  group_games INT NOT NULL,                                 -- games in the group (same position and move)
  cp_white    SMALLINT,                                     -- Stockfish 19, 2M nodes, White's view
  mate_white  SMALLINT,                                     -- + White mates, − Black mates
  depth       SMALLINT NOT NULL,
  CHECK ((cp_white IS NULL) <> (mate_white IS NULL)),
  INDEX (cp_white),
  INDEX (move_number)
)`;

// Loading is safe to repeat: a row already in the table is overwritten, never doubled.
export async function loadSampledMoves(run: string) {
  const connection = await connect();
  try {
    await connection.query(SAMPLED_MOVES_TABLE);
    const rows = await sampledMoves(run);
    for (let start = 0; start < rows.length; start += 1000)
      await connection.query(`INSERT INTO sampled_moves (game_id, run, move_number, san, uci, fen, group_id, results,
        group_games, cp_white, mate_white, depth) VALUES ? AS new ON DUPLICATE KEY UPDATE run = new.run,
        move_number = new.move_number, san = new.san, uci = new.uci, fen = new.fen, group_id = new.group_id,
        results = new.results, group_games = new.group_games, cp_white = new.cp_white, mate_white = new.mate_white, depth = new.depth`,
        [rows.slice(start, start + 1000).map(row => [row.gameId, run, row.moveNumber, row.san, row.uci, row.fen,
          row.groupId, row.results, row.groupGames, row.cpWhite, row.mateWhite, row.depth])]);
    const [counts] = await connection.query(`SELECT COUNT(*) AS rows_in_table,
      SUM(game_id NOT IN (SELECT game_id FROM games)) AS without_game FROM sampled_moves WHERE run = ?`, [run]);
    return { run, loaded: rows.length, ...(counts as { rows_in_table: number; without_game: number }[])[0] };
  } finally { await connection.end(); }
}

// Loading is safe to repeat: a game already in the table is overwritten, never doubled.
export async function loadGames(file: string, limit?: number) {
  const connection = await connect();
  const rejected: Record<string, number> = {};
  let read = 0, loaded = 0, batch: GameRecord[] = [];
  const flush = async () => {
    if (!batch.length) return;
    await connection.query(`INSERT INTO games (game_id, game_date, white_elo, black_elo, result, termination, final_state, eco, opening, uci_moves, san_moves)
      VALUES ? AS new ON DUPLICATE KEY UPDATE game_date = new.game_date, white_elo = new.white_elo,
      black_elo = new.black_elo, result = new.result, termination = new.termination,
      final_state = new.final_state, eco = new.eco, opening = new.opening, uci_moves = new.uci_moves, san_moves = new.san_moves`,
      [batch.map(game => [game.gameId, game.gameDate, game.whiteElo, game.blackElo, game.result,
        game.termination, game.finalState, game.eco, game.opening, game.uciMoves, game.sanMoves])]);
    loaded += batch.length; batch = [];
  };
  try {
    await connection.query(GAMES_TABLE);
    for await (const pgn of readGames(file)) {
      if (limit !== undefined && read >= limit) break;
      read++;
      const parsed = gameRecord(pgn);
      if ("rejected" in parsed) rejected[parsed.rejected] = (rejected[parsed.rejected] ?? 0) + 1;
      else { batch.push(parsed.record); if (batch.length === 1000) await flush(); }
    }
    await flush();
    const [rows] = await connection.query("SELECT COUNT(*) AS games FROM games");
    return { read, loaded, rejected, tableRows: (rows as { games: number }[])[0].games };
  } finally { await connection.end(); }
}
