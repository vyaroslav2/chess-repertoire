import { format } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { generateRepertoire } from "../src/lib/core/generator";
import { prisma } from "../src/lib/db/operations";
import { acquireLock, type LockHandle } from "../src/lib/core/lockfile";
import { UserRequestedStopError } from "../src/lib/api/retry";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const TREE_GENERATOR_PROJECT_ROOT = path.resolve(__dirname, "..");

type LauncherEnvironment = Readonly<Record<string, string | undefined>>;

export function resolveTreeGeneratorLogPath(environment: LauncherEnvironment = process.env, projectRoot = TREE_GENERATOR_PROJECT_ROOT): string {
  return environment.TREE_GEN_LOG_PATH !== undefined
    ? environment.TREE_GEN_LOG_PATH
    : path.join(projectRoot, "docs", "logs", "TreeGenLog.md");
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
  const logPath = dependencies.logPath ?? resolveTreeGeneratorLogPath(dependencies.environment, dependencies.projectRoot);
  const generate = dependencies.generate ?? (() => generateRepertoire(START_FEN, 3));
  const disconnect = dependencies.disconnect ?? (() => prisma.$disconnect());
  const takeLock = dependencies.acquire ?? (() => acquireLock("treegen"));
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();

  let lock: LockHandle | null = null;
  let runError: unknown = null;
  let logOpened = false;
  const originalLog = console.log;
  const originalError = console.error;

  try {
    lock = takeLock();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, `# Tree Generation Log\n\nStarted: ${startedAt.toISOString()}\n\n\`\`\`text\n`);
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
