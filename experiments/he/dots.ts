import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { HE_ROOT, assertDataDirectory, runPath } from "./paths";
import type { GroupEval, Part } from "./results";
import type { Observation } from "./types";

// One game's sampled move with its group's eval: observations.jsonl joined to evals.jsonl.
// groupId and results say where the search lies: in searchRun when an earlier run made it.
export type SampledMove = Observation & { groupId: number; results: Part; searchRun?: string; groupGames: number;
  cpWhite: number | null; mateWhite: number | null; depth: number };

export async function sampledMoves(run: string): Promise<SampledMove[]> {
  const directory = runPath(run);
  const read = async <T>(file: string): Promise<T[]> =>
    (await readFile(path.join(directory, file), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const groups = new Map((await read<GroupEval>("evals.jsonl")).map(group => [group.period + " " + group.positionKey + " " + group.uci, group]));
  return (await read<Observation>("observations.jsonl")).map(game => {
    const group = groups.get(game.period + " " + game.positionKey + " " + game.uci);
    if (!group) throw new Error("Game " + game.gameId + " has no eval: is evals.jsonl from this run?");
    return { ...game, groupId: group.from?.id ?? group.id, results: group.part,
      ...(group.from ? { searchRun: group.from.run } : {}), groupGames: group.games,
      cpWhite: group.cpWhite, mateWhite: group.mateWhite, depth: group.depth };
  });
}

// Writes dots.html into the run's folder: every game as a dot, eval against Black's result,
// with the fitted curve over them. The page needs no server and nothing from the internet.
export async function writeDots(run: string) {
  const directory = runPath(run);
  await assertDataDirectory(directory);
  const all = await sampledMoves(run), games = all.filter(game => game.cpWhite !== null);
  const curve = JSON.parse(await readFile(path.join(directory, "curve.json"), "utf8"));
  const outcome = { losses: 0, draws: 1, wins: 2 } as const;
  // Runs whose searches were reused; 0 stands for this run.
  const searchRuns = ["", ...new Set(games.flatMap(g => g.searchRun ?? []))];
  const data = { run, mates: all.length - games.length, curveName: curve.chosen.name,
    // Every 25 cp: eval, Black's score, its 95% range, Black's win and draw chances.
    curve: curve.table.map((row: { cpWhite: number; score: number; scoreRange: number[]; win: number; draw: number }) =>
      [row.cpWhite, +row.score.toFixed(4), +row.scoreRange[0].toFixed(4), +row.scoreRange[1].toFixed(4),
        +row.win.toFixed(4), +row.draw.toFixed(4)]),
    // One array per field, in the same game order: smaller than one object per game.
    id: games.map(g => g.gameId), date: games.map(g => g.date), white: games.map(g => g.white), black: games.map(g => g.black),
    whiteRating: games.map(g => g.whiteRating), blackRating: games.map(g => g.blackRating),
    opening: games.map(g => g.opening === "caro-kann" ? 1 : 0), speed: games.map(g => g.speed === "classical" ? 1 : 0),
    move: games.map(g => g.moveNumber), san: games.map(g => g.san), uci: games.map(g => g.uci), fen: games.map(g => g.fen),
    cp: games.map(g => g.cpWhite), depth: games.map(g => g.depth), outcome: games.map(g => outcome[g.outcome]),
    group: games.map(g => g.groupId), results: games.map(g => g.results), groupGames: games.map(g => g.groupGames),
    searchRuns, searchRun: games.map(g => searchRuns.indexOf(g.searchRun ?? "")) };
  const template = await readFile(path.join(HE_ROOT, "dots-template.html"), "utf8");
  // "<" is escaped so no text in the data can close the script tag.
  const page = template.replace("__DATA__", () => JSON.stringify(data).replace(/</g, "\\u003c"));
  // The page only shows the run's files, so making it again simply replaces it.
  const destination = path.join(directory, "dots.html");
  await writeFile(destination, page);
  return { destination, games: games.length, mates: data.mates };
}
