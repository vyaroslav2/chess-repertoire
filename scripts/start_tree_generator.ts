import { format } from "node:util";
import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";

if (fs.existsSync("C:\\Files\\.env")) {
  dotenv.config({ path: "C:\\Files\\.env" });
} else {
  dotenv.config();
}

import { generateRepertoire } from "../src/lib/core/generator";
import { prisma } from "../src/lib/db/operations";
import { acquireLock, type LockHandle } from "../src/lib/core/lockfile";
import { UserRequestedStopError } from "../src/lib/api/retry";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const TREE_GENERATOR_PROJECT_ROOT = path.resolve(__dirname, "..");

type LauncherEnvironment = Readonly<Record<string, string | undefined>>;

function runTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function resolveTreeGeneratorLogPath(environment: LauncherEnvironment = process.env, projectRoot = TREE_GENERATOR_PROJECT_ROOT, startedAt = new Date()): string {
  return environment.TREE_GEN_LOG_PATH !== undefined
    ? environment.TREE_GEN_LOG_PATH
    : path.join(projectRoot, "docs", "logs", `treegen-${runTimestamp(startedAt)}.md`);
}

function pruneTreeGeneratorLogs(logPath: string): void {
  const directory = path.dirname(logPath);
  const currentName = path.basename(logPath);
  const existing = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.startsWith("treegen-") && entry.name.endsWith(".md") && entry.name !== currentName)
    .map(entry => ({ name: entry.name, modified: fs.statSync(path.join(directory, entry.name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified || b.name.localeCompare(a.name));
  for (const obsolete of existing.slice(2)) {
    fs.unlinkSync(path.join(directory, obsolete.name));
  }
}

type LauncherDependencies = {
  logPath?: string;
  generate?: () => Promise<void>;
  disconnect?: () => Promise<void>;
  acquire?: () => LockHandle;
  now?: () => Date;
  environment?: LauncherEnvironment;
  projectRoot?: string;
};

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runTreeGenerator(dependencies: LauncherDependencies = {}): Promise<void> {
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();
  const environment = dependencies.environment ?? process.env;
  const logPath = dependencies.logPath ?? resolveTreeGeneratorLogPath(environment, dependencies.projectRoot, startedAt);
  let stopRequested = false;
  const requestStop = () => {
    stopRequested = true;
    originalLog("Stop requested; generation will stop after the current position.");
  };
  const generate = dependencies.generate ?? (() => generateRepertoire(START_FEN, 3, { shouldStop: () => stopRequested }));
  const disconnect = dependencies.disconnect ?? (() => prisma.$disconnect());
  const takeLock = dependencies.acquire ?? (() => acquireLock("treegen"));

  let lock: LockHandle | null = null;
  let runError: unknown = null;
  let logOpened = false;
  const originalLog = console.log;
  const originalError = console.error;

  try {
    process.on("SIGINT", requestStop);
    lock = takeLock();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    if (dependencies.logPath === undefined && environment.TREE_GEN_LOG_PATH === undefined) {
      pruneTreeGeneratorLogs(logPath);
    }
    fs.writeFileSync(logPath, `# Tree Generation Log\n\nStarted: ${startedAt.toISOString()}\nDepth: testing default (3 full moves)\n\n\`\`\`text\n`);
    logOpened = true;

    console.log = (...args: unknown[]) => {
      originalLog(...args);
      fs.appendFileSync(logPath, `${format(...args)}\n`);
    };
    console.error = (...args: unknown[]) => {
      originalError(...args);
      fs.appendFileSync(logPath, `[ERROR] ${format(...args)}\n`);
    };

    await generate();
  } catch (error) {
    runError = error;
  } finally {
    if (lock) {
      try {
        if (logOpened) {
          const finishedAt = now();
          const elapsedMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
          const ending = runError
            ? `\n${runError instanceof UserRequestedStopError ? "[STOPPED]" : "[FAILED]"} ${errorReason(runError)}\nFinished: ${finishedAt.toISOString()}\nElapsed: ${elapsedMs}ms\n\`\`\`\n`
            : `\n[FINISHED] Generation finished successfully.\nFinished: ${finishedAt.toISOString()}\nElapsed: ${elapsedMs}ms\n\`\`\`\n`;
          fs.appendFileSync(logPath, ending);
        }
      } catch (error) {
        if (!runError) runError = error;
      }

      try {
        await disconnect();
      } catch (error) {
        if (!runError) runError = error;
      }

      try {
        lock.release();
      } catch (error) {
        if (!runError) runError = error;
      }
    } else {
      try {
        await disconnect();
      } catch (error) {
        if (!runError) runError = error;
      }
    }

    console.log = originalLog;
    console.error = originalError;
    process.off("SIGINT", requestStop);
  }

  if (runError) throw runError;
}

if (require.main === module) {
  runTreeGenerator().catch(error => {
    if (error instanceof UserRequestedStopError) {
      console.error(`Generation stopped at the user's request: ${error.message}`);
    } else {
      console.error("Tree generation failed:", error);
    }
    process.exitCode = 1;
  });
}
