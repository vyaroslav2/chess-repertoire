/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "chess-repertoire-scenario-"));
  const databasePath = path.join(temporaryDirectory, "scenario.db");
  const databaseUrl = `file:${databasePath}`;
  const prismaCli = path.resolve("node_modules", "prisma", "build", "index.js");

  try {
    execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "ignore"
    });
    process.env.DATABASE_URL = databaseUrl;

    // tsx asks Windows for the account name only to name its temporary folder.
    // Retain normal behavior, but keep this diagnostic tool usable if that OS call fails.
    const originalUserInfo = os.userInfo;
    os.userInfo = (...args) => {
      try { return originalUserInfo(...args); }
      catch { return { username: "scenario", uid: -1, gid: -1, shell: null, homedir: os.homedir() }; }
    };
    require("tsx/cjs");
    const { runScenarioCli } = require("./generator_scenario_worker.ts");
    await runScenarioCli(process.argv.slice(2));
  } finally {
    const resolvedTemporaryDirectory = path.resolve(temporaryDirectory);
    const resolvedSystemTemporaryDirectory = path.resolve(os.tmpdir());
    if (path.dirname(resolvedTemporaryDirectory) !== resolvedSystemTemporaryDirectory ||
        !path.basename(resolvedTemporaryDirectory).startsWith("chess-repertoire-scenario-")) {
      throw new Error(`Refusing to remove unexpected scenario directory ${resolvedTemporaryDirectory}`);
    }
    rmSync(resolvedTemporaryDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
