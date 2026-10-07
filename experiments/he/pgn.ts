import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { Chess } from "chess.js";
import type { Observation, Period } from "./types";
export type ImportOptions = { seed: string; maxGap: 100 | 200 };
export type Selection = { observation: Observation } | { rejected: string };

export async function* readGames(file: string): AsyncGenerator<string> {
  if (!/\.pgn(?:\.gz)?$/i.test(file)) throw new Error("Input must be .pgn or .pgn.gz; decompress .zst first.");
  const source = createReadStream(file);
  const stream = /\.gz$/i.test(file) ? source.pipe(createGunzip()) : source;
  source.on("error", error => stream.destroy(error));
  try { yield* splitGames(stream); }
  finally { stream.destroy(); source.destroy(); }
}

export async function* splitGames(stream: Readable, completeTailOnly = false): AsyncGenerator<string> {
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let parts: string[] = [];
  let size = 0, hasMoves = false, braces = 0, variations = 0;
  try {
    for await (const raw of lines) {
      const line = raw.replace(/^\uFEFF/, "");
      const header = braces === 0 && variations === 0 && /^\s*\[\w+\s+"(?:[^"\\]|\\.)*"\]\s*$/.test(line);
      if (header && hasMoves) {
        yield parts.join("\n");
        parts = []; size = 0; hasMoves = false;
      }
      if (!parts.length && !line.trim()) continue;
      parts.push(line); size += line.length;
      if (size > 2_000_000) throw new Error("PGN game exceeds 2 MB; input may have missing game boundaries.");
      if (header) continue;
      if (line.trim()) hasMoves = true;
      for (const character of line) {
        if (character === ";" && braces === 0) break;
        if (character === "{") braces++;
        else if (character === "}") braces = Math.max(0, braces - 1);
        else if (braces === 0 && character === "(") variations++;
        else if (braces === 0 && character === ")") variations = Math.max(0, variations - 1);
      }
    }
    if (parts.length) {
      const tail = parts.join("\n");
      const cleaned = tail.replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
      if (!completeTailOnly || /(?:^|\s)(?:1-0|0-1|1\/2-1\/2|\*)\s*$/.test(cleaned)) yield tail;
    }
  } finally { lines.close(); stream.destroy(); }
}
function headers(pgn: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of pgn.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/.exec(line);
    if (!match) break;
    result[match[1]] = match[2].replace(/\\(["\\])/g, "$1");
  }
  return result;
}
function datedPeriod(value: string | undefined): { date: string; period: Period } | null {
  if (!value || !/^\d{4}\.\d{2}\.\d{2}$/.test(value)) return null;
  const date = value.replaceAll(".", "-");
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return null;
  const year = Number(date.slice(0, 4));
  const period = year === 2023 || year === 2024 ? "fit" : year === 2025 ? "tune" : year === 2026 ? "test" : null;
  return period ? { date, period } : null;
}
export function selectObservation(pgn: string, options: ImportOptions): Selection {
  const h = headers(pgn);
  const dated = datedPeriod(h.UTCDate ?? h.Date);
  if (!dated) return { rejected: "date" };
  if ((h.Variant && h.Variant !== "Standard") || h.FEN || h.SetUp === "1") return { rejected: "nonstandard" };
  const speed = /^Rated (rapid|classical) game$/i.exec(h.Event ?? "")?.[1].toLowerCase();
  if (speed !== "rapid" && speed !== "classical") return { rejected: "speed-or-unrated" };
  if (!/^\d+$/.test(h.WhiteElo ?? "") || !/^\d+$/.test(h.BlackElo ?? "")) return { rejected: "rating" };
  const whiteRating = Number(h.WhiteElo), blackRating = Number(h.BlackElo);
  const averageRating = (whiteRating + blackRating) / 2;
  if (averageRating < 1600 || averageRating >= 2200) return { rejected: "rating-band" };
  const ratingGap = Math.abs(whiteRating - blackRating);
  if (ratingGap >= options.maxGap) return { rejected: "rating-gap" };
  const outcome = h.Result === "0-1" ? "wins" : h.Result === "1/2-1/2" ? "draws" : h.Result === "1-0" ? "losses" : null;
  if (!outcome) return { rejected: "unfinished" };
  const gameId = /^https?:\/\/(?:www\.)?lichess\.org\/([a-zA-Z0-9]{8})(?:\/(?:white|black))?\/?$/.exec(h.Site ?? "")?.[1];
  if (!gameId) return { rejected: "game-id" };
  // Strip irrelevant comments before chess.js; header-like text inside comments can
  // otherwise confuse its PGN lexer. Preserve headers, and validate all mainline moves.
  const lines = pgn.split(/\r?\n/);
  let start = 0;
  while (start < lines.length && (!lines[start].trim() || /^\s*\[\w+\s+"/.test(lines[start]))) start++;
  const body = lines.slice(start).join("\n").replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
  // Cheap opening check before chess.js, which is the slow step: most games fail here.
  const firstTwo = body.trim().split(/\s+/).filter(token => !/^\d+\.+$/.test(token) && !token.startsWith("$"))
    .slice(0, 2).map(token => token.replace(/^\d+\.+/, "").replace(/[!?]+$/, "")).join(" ");
  if (firstTwo !== "d4 d5" && firstTwo !== "e4 c6") return { rejected: "opening" };
  const chess = new Chess();
  try { chess.loadPgn(lines.slice(0, start).join("\n") + "\n\n" + body); }
  catch { return { rejected: "invalid-pgn" }; }
  if (chess.getHeaders().Result !== h.Result) return { rejected: "result-mismatch" };
  const moves = chess.history({ verbose: true });
  const first = moves.slice(0, 2).map(move => move.lan).join(" ");
  const opening = first === "d2d4 d7d5" ? "d4-d5" : first === "e2e4 c7c6" ? "caro-kann" : null;
  if (!opening) return { rejected: "opening" };
  // Select BEFORE inspecting the game's length or outcome, with no early resampling.
  const hash = createHash("sha256").update(`${options.seed}:${gameId}`).digest();
  const moveNumber = 2 + hash.readUInt32BE(0) % 14;
  const move = moves[moveNumber * 2 - 1];
  if (!move) return { rejected: "sampled-move-missing" };
  return { observation: {
    gameId, ...dated, opening, speed, white: h.White ?? "?", black: h.Black ?? "?",
    whiteRating, blackRating, averageRating, ratingGap,
    gapBand: ratingGap < 50 ? "0-49" : ratingGap < 100 ? "50-99" : "100-199",
    moveNumber, fen: move.before, positionKey: move.before.split(" ").slice(0, 4).join(" "),
    uci: move.lan, san: move.san, outcome,
  } };
}
