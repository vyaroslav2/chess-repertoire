import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, realpath } from "node:fs/promises";
export const HE_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const DATA_ROOT = path.join(HE_ROOT, "data");
// npm runs this package's scripts from HE_ROOT; INIT_CWD retains the caller's terminal directory.
export function resolveInputPath(input: string, callerDirectory = process.env.INIT_CWD ?? process.cwd()): string {
  return path.resolve(callerDirectory, input);
}
export function runPath(name: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) throw new Error("Run name must use letters, numbers, underscores or hyphens (up to 80 characters), and not a Windows device name.");
  return path.join(DATA_ROOT, "runs", name);
}
function assertInside(root: string, target: string) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("HE output directory must remain inside data/.");
}
export async function assertDataDirectory(directory: string): Promise<void> {
  assertInside(DATA_ROOT, path.resolve(directory));
  await mkdir(DATA_ROOT, { recursive: true });
  const root = await realpath(DATA_ROOT), experiment = await realpath(HE_ROOT);
  if (path.dirname(root).toLowerCase() !== experiment.toLowerCase()) throw new Error("HE data directory must not point outside the experiment.");
  // Validate the nearest existing ancestor before creating directories through a junction.
  let ancestor = path.resolve(directory);
  while (true) {
    try { assertInside(root, await realpath(ancestor)); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      ancestor = path.dirname(ancestor);
    }
  }
  await mkdir(directory, { recursive: true });
  assertInside(root, await realpath(directory));
}
