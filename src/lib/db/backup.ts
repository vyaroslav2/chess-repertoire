// A copy of the database before each generator run: prisma/dev.db.bak-YYYY-MM-DD-HHMM.
// The newest AUTO_BACKUPS_KEPT are kept. Backups named by hand (no time, e.g. dev.db.bak-2026-11-07) are never removed.
import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

export const AUTO_BACKUPS_KEPT = 10;
/** Prisma resolves a relative SQLite path from the schema's folder. */
const PRISMA_DIR = path.resolve(__dirname, "..", "..", "..", "prisma");

export function sqliteFilePath(url: string | undefined, prismaDir: string = PRISMA_DIR): string {
  if (!url || !url.startsWith("file:")) throw new Error(`Backup needs a SQLite file, but DATABASE_URL is ${url ?? "not set"}`);
  return path.resolve(prismaDir, url.slice("file:".length).split("?")[0]);
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type BackupResult = { path: string; removed: string[] };

/** Copies the database with VACUUM INTO: a consistent copy, even of a file in use. Then removes the oldest automatic backups. */
export async function backupDatabase(
  client: PrismaClient,
  options: { url?: string; now?: Date; prismaDir?: string; kept?: number } = {},
): Promise<BackupResult> {
  const source = sqliteFilePath(options.url ?? process.env.DATABASE_URL, options.prismaDir);
  if (!fs.existsSync(source)) throw new Error(`Backup failed: ${source} does not exist`);

  const base = `${source}.bak-${stamp(options.now ?? new Date())}`;
  let target = base;
  for (let n = 2; fs.existsSync(target); n++) target = `${base}-${n}`;
  await client.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  if (!fs.existsSync(target)) throw new Error(`Backup failed: ${target} was not written`);

  const pattern = new RegExp(`^${escapeRegExp(path.basename(source))}\\.bak-\\d{4}-\\d{2}-\\d{2}-\\d{4}(-\\d+)?$`);
  const directory = path.dirname(source);
  const automatic = fs.readdirSync(directory).filter(name => pattern.test(name)).sort(byStampNewestFirst);
  const removed = automatic.slice(options.kept ?? AUTO_BACKUPS_KEPT).map(name => path.join(directory, name));
  for (const file of removed) fs.unlinkSync(file);
  return { path: target, removed };
}

/** Newest first: by the stamp, then by the -2, -3 suffix. */
function byStampNewestFirst(a: string, b: string): number {
  const key = (name: string) => {
    const match = /bak-(\d{4}-\d{2}-\d{2}-\d{4})(?:-(\d+))?$/.exec(name)!;
    return [match[1], Number(match[2] ?? 1)] as const;
  };
  const [stampA, nA] = key(a);
  const [stampB, nB] = key(b);
  return stampA === stampB ? nB - nA : stampA < stampB ? 1 : -1;
}
