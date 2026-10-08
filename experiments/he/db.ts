import mysql from "mysql2/promise";
import { readGames, gameRecord, type GameRecord } from "./pgn";

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

// One row per game. The full mainline is kept; queries can show only the opening.
// IDs and moves compare case-sensitively: Lichess IDs mix cases, and bxc4 is not Bxc4.
export const GAMES_TABLE = `CREATE TABLE IF NOT EXISTS games (
  game_id   CHAR(8) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  played_on DATE NOT NULL,
  white_elo SMALLINT NOT NULL,
  black_elo SMALLINT NOT NULL,
  result    ENUM('1-0','0-1','1/2-1/2') NOT NULL,
  termination VARCHAR(20) NOT NULL,                       -- Lichess's reason: Normal, Time forfeit…
  final_state ENUM('checkmate','stalemate','insufficient') NULL,  -- empty when the board settles nothing
  uci_moves TEXT CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  san_moves TEXT CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  INDEX (uci_moves(100)),
  INDEX (san_moves(100))
)`;

// Loading is safe to repeat: a game already in the table is overwritten, never doubled.
export async function loadGames(file: string, limit?: number) {
  const connection = await connect();
  const rejected: Record<string, number> = {};
  let read = 0, loaded = 0, batch: GameRecord[] = [];
  const flush = async () => {
    if (!batch.length) return;
    await connection.query(`INSERT INTO games (game_id, played_on, white_elo, black_elo, result, termination, final_state, uci_moves, san_moves)
      VALUES ? AS new ON DUPLICATE KEY UPDATE played_on = new.played_on, white_elo = new.white_elo,
      black_elo = new.black_elo, result = new.result, termination = new.termination,
      final_state = new.final_state, uci_moves = new.uci_moves, san_moves = new.san_moves`,
      [batch.map(game => [game.gameId, game.playedOn, game.whiteElo, game.blackElo, game.result,
        game.termination, game.finalState, game.uciMoves, game.sanMoves])]);
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
