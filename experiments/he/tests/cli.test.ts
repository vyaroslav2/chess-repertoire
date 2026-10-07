import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { DATA_ROOT, HE_ROOT, assertDataDirectory, resolveInputPath, runPath } from "../paths";

test("CLI file and engine paths resolve from the terminal's launch directory", () => {
  const root = path.resolve(HE_ROOT, "../..");
  assert.equal(resolveInputPath("experiments/he/data/games/sample.pgn", root),
    path.join(DATA_ROOT, "games", "sample.pgn"));
  assert.equal(resolveInputPath("bin/stockfish.exe", root), path.join(root, "bin", "stockfish.exe"));
  const absolute = path.join(DATA_ROOT, "sample.pgn");
  assert.equal(resolveInputPath(absolute, HE_ROOT), absolute);
  assert.equal(resolveInputPath("data/sample.pgn", HE_ROOT), absolute);
});

test("npm-style cwd change still imports a file relative to INIT_CWD", async () => {
  await assertDataDirectory(DATA_ROOT);
  const directory = await mkdtemp(path.join(DATA_ROOT, "test-cli-"));
  const root = path.resolve(HE_ROOT, "../..");
  const name = "test-cli-" + path.basename(directory) + "-" + Date.now();
  const run = runPath(name);
  const input = path.join(directory, "sample.pgn");
  let createdRun = false;
  try {
    await writeFile(input, '[Event "Rated rapid game"]\n[Site "https://lichess.org/abcd1234"]\n[Date "2024.01.01"]\n[WhiteElo "1800"]\n[BlackElo "1800"]\n[Result "0-1"]\n\n1. e4 c6 2. d4 d5 0-1\n');
    const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", path.join(HE_ROOT, "cli.ts"), "import",
        "--run", name, path.relative(root, input)], {
        cwd: HE_ROOT, env: { ...process.env, INIT_CWD: root }, windowsHide: true,
      });
      let output = "";
      child.stdout.on("data", chunk => { output += chunk; });
      child.stderr.on("data", chunk => { output += chunk; });
      child.on("error", reject);
      child.on("close", code => resolve({ code, output }));
    });
    assert.equal(result.code, 0, result.output);
    createdRun = true;
    const manifest = JSON.parse(await readFile(path.join(run, "manifest.json"), "utf8"));
    assert.equal(manifest.status, "complete");
    assert.equal(manifest.inputs[0].path, input);
    assert.equal(manifest.summary.scanned, 1);
  } finally {
    await assertDataDirectory(directory);
    await rm(directory, { recursive: true });
    if (createdRun) {
      await assertDataDirectory(run);
      await rm(run, { recursive: true });
    }
  }
});
