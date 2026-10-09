import path from "node:path";
import { createReadStream } from "node:fs";
import { open, mkdir, readFile, writeFile, stat, rename, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as zlib from "node:zlib";
import { Readable, type Transform } from "node:stream";
import { splitGames, selectObservation, type ImportOptions } from "./pgn";
import { assertDataDirectory, DATA_ROOT, runPath } from "./paths";
import { importFiles } from "./import";
import { POLICY } from "./types";

type ZstdApi = {
  createZstdDecompress?: (options: { finishFlush: number }) => Transform;
  constants: { ZSTD_e_flush: number; ZSTD_e_end: number };
};
const zstd = zlib as unknown as ZstdApi;

export function archiveUrl(month: string): string {
  if (!/^202[3-6]-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error("--month must be YYYY-MM in 2023–2026.");
  return "https://database.lichess.org/standard/lichess_db_standard_rated_" + month + ".pgn.zst";
}
export function gbToBytes(gb: number): number {
  const bytes = Math.round(gb * 1_000_000_000);
  if (!Number.isFinite(gb) || gb <= 0 || !Number.isSafeInteger(bytes) || bytes < 16) throw new Error("--gb must be a positive size of at least 16 bytes.");
  return bytes;
}
export type FetchPrefix = (url: string, init: RequestInit) => Promise<Response>;

export async function downloadPrefix(url: string, destination: string, maxBytes: number,
  fetchPrefix: FetchPrefix = fetch) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const armTimeout = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new Error("Download stalled for 120 seconds.")), 120_000);
  };
  armTimeout();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let output: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const response = await fetchPrefix(url, { headers: { Range: "bytes=0-" + (maxBytes - 1), "Accept-Encoding": "identity" },
      signal: controller.signal });
    if (response.status !== 206) throw new Error("Archive server did not honour the byte limit (HTTP " + response.status + ").");
    const range = /^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
    if (!range) throw new Error("Missing or invalid Content-Range for archive prefix.");
    const end = Number(range[1]), total = Number(range[2]);
    if (!Number.isSafeInteger(end) || !Number.isSafeInteger(total) ||
        end !== Math.min(maxBytes, total) - 1) throw new Error("Server returned a different byte range from the one requested.");
    if (!response.body) throw new Error("Archive response has no body.");
    reader = response.body.getReader();
    output = await open(destination, "wx");
    const hash = createHash("sha256");
    let bytes = 0, lastProgress = Date.now();
    while (true) {
      armTimeout();
      const chunk = await reader.read();
      if (chunk.done) break;
      if (bytes + chunk.value.byteLength > end + 1) throw new Error("Archive response exceeded its declared byte range.");
      const buffer = Buffer.from(chunk.value);
      hash.update(buffer);
      let written = 0;
      while (written < buffer.length) {
        const result = await output.write(buffer, written, buffer.length - written);
        if (!result.bytesWritten) throw new Error("Could not write archive bytes.");
        written += result.bytesWritten;
      }
      bytes += buffer.length;
      if (Date.now() - lastProgress >= 5000) {
        console.error("Downloaded " + (bytes / 1e9).toFixed(3) + " / " + ((end + 1) / 1e9).toFixed(3) + " GB");
        lastProgress = Date.now();
      }
    }
    if (bytes !== end + 1) throw new Error("Download ended before the requested range was received.");
    return { bytes, totalArchiveBytes: total, prefixSha256: hash.digest("hex"),
      etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified") };
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => undefined);
    controller.abort();
    await output?.close();
  }
}

// Node's partial-frame decoder can stop at an initial skippable metadata frame.
// Locate the first actual Zstandard frame without loading the archive into memory.
export async function zstdDataOffset(file: string): Promise<number> {
  const input = await open(file, "r");
  try {
    const size = (await input.stat()).size;
    let offset = 0;
    while (offset + 8 <= size) {
      const header = Buffer.alloc(8);
      await input.read(header, 0, 8, offset);
      const magic = header.readUInt32LE(0);
      if (magic === 0xfd2fb528) return offset;
      if ((magic & 0xfffffff0) !== 0x184d2a50) throw new Error("Archive does not contain a valid Zstandard frame.");
      offset += 8 + header.readUInt32LE(4);
    }
    throw new Error("Prefix ends inside metadata; download a larger sample.");
  } finally { await input.close(); }
}


// PZstandard puts a 12-byte size header before EACH compressed frame.
// Decode frames separately so partial-mode decoding cannot stop at an intervening
// skippable frame. Keep one continuous PGN stream across those frame boundaries.
async function* decodedFrames(file: string): AsyncGenerator<Buffer> {
  const input = await open(file, "r");
  try {
    const size = (await input.stat()).size;
    let offset = 0;
    while (offset + 8 <= size) {
      const header = Buffer.alloc(8);
      await input.read(header, 0, 8, offset);
      const magic = header.readUInt32LE(0);
      let frameSize: number | undefined;
      if ((magic & 0xfffffff0) === 0x184d2a50) {
        const metadataSize = header.readUInt32LE(4);
        if (offset + 8 + metadataSize > size) break;
        if (magic === 0x184d2a50 && metadataSize === 4) {
          const hint = Buffer.alloc(4);
          await input.read(hint, 0, 4, offset + 8);
          frameSize = hint.readUInt32LE(0);
          if (!frameSize) throw new Error("PZstandard frame has an invalid size hint.");
        }
        offset += 8 + metadataSize;
        if (frameSize === undefined) continue;
      }
      const frameHeader = Buffer.alloc(4);
      const { bytesRead } = await input.read(frameHeader, 0, 4, offset);
      if (bytesRead < 4) break;
      if (frameHeader.readUInt32LE(0) !== 0xfd2fb528) throw new Error("Invalid Zstandard frame after archive metadata.");
      const available = Math.min(frameSize ?? (size - offset), size - offset);
      const partial = frameSize !== undefined && available < frameSize;
      const decoder = zstd.createZstdDecompress!(partial || frameSize === undefined ?
        { finishFlush: zstd.constants.ZSTD_e_flush } : { finishFlush: zstd.constants.ZSTD_e_end });
      const source = createReadStream(file, { start: offset, end: offset + available - 1 });
      source.on("error", error => decoder.destroy(error));
      try {
        source.pipe(decoder);
        for await (const chunk of decoder) yield Buffer.from(chunk);
      } finally { source.destroy(); decoder.destroy(); }
      offset += available;
      if (partial || frameSize === undefined) break;
    }
  } finally { await input.close(); }
}

export async function filterPrefix(file: string, outputFile: string, options: ImportOptions, limit?: number) {
  if (typeof zstd.createZstdDecompress !== "function") throw new Error("HE downloading requires Node 22.15+ or Node 24 with native Zstandard support.");
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit must be a positive integer.");
  await zstdDataOffset(file);
  const output = await open(outputFile, "wx");
  const decoded = Readable.from(decodedFrames(file));
  const seen = new Set<string>();
  const rejected: Record<string, number> = {};
  let scanned = 0, accepted = 0, duplicates = 0, stoppedAtLimit = false;
  try {
    for await (const pgn of splitGames(decoded, true)) {
      scanned++;
      if (scanned % 10_000 === 0) console.error("Filtered " + scanned + " games; " + accepted + " qualify.");
      const selection = selectObservation(pgn, options);
      if ("rejected" in selection) {
        rejected[selection.rejected] = (rejected[selection.rejected] ?? 0) + 1;
        continue;
      }
      const id = selection.observation.gameId;
      if (seen.has(id)) { duplicates++; continue; }
      seen.add(id);
      await output.write(pgn + "\n\n");
      accepted++;
      if (limit !== undefined && accepted >= limit) { stoppedAtLimit = true; break; }
    }
    if (!scanned) throw new Error("Prefix contains no complete games; download a larger sample.");
    return { scanned, accepted, duplicates, rejected, stoppedAtLimit };
  } finally { decoded.destroy(); await output.close(); }
}

export async function downloadRun(name: string, month: string, gb: number, options: ImportOptions, limit?: number) {
  const url = archiveUrl(month), maxBytes = gbToBytes(gb);
  if (typeof zstd.createZstdDecompress !== "function") throw new Error("Use Node 22.15+ or Node 24 for native Zstandard support.");
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit must be a positive integer.");
  const targetRun = runPath(name);
  try {
    await stat(targetRun);
    throw new Error("Import run already exists; choose a new --run name.");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await assertDataDirectory(path.join(DATA_ROOT, "downloads"));
  const directory = path.join(DATA_ROOT, "downloads", name);
  await mkdir(directory);
  await assertDataDirectory(directory);
  const manifestFile = path.join(directory, "manifest.json");
  const prefix = path.join(directory, "archive-prefix.pgn.zst");
  const sample = path.join(directory, "sample.pgn");
  const provenance = { schemaVersion: 1, url, month, requestedBytes: maxBytes, options, policy: POLICY,
    limit: limit ?? null, prefixOnly: true, startedAt: new Date().toISOString() };
  await writeFile(manifestFile, JSON.stringify({ ...provenance, status: "downloading" }, null, 2));
  let download: Awaited<ReturnType<typeof downloadPrefix>> | undefined;
  try {
    download = await downloadPrefix(url, prefix + ".partial", maxBytes);
    await rename(prefix + ".partial", prefix);
    return await filterAndImport(name, directory, provenance, download, options, limit);
  } catch (error) {
    // Keep the download record, so a failed filter can be rerun with the filter command.
    await writeFile(manifestFile, JSON.stringify({ ...provenance, status: "failed", download, error: String(error) }, null, 2));
    throw error;
  }
}

// Rerun filtering and import on a finished download, without downloading again.
// Uses the seed, gap and limit recorded in the download manifest.
export async function filterDownloaded(name: string) {
  const targetRun = runPath(name);
  try {
    await stat(targetRun);
    throw new Error("Import run already exists; choose a new --run name.");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const directory = path.join(DATA_ROOT, "downloads", name);
  await assertDataDirectory(directory);
  const manifestFile = path.join(directory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  if (manifest.status !== "filtering" && manifest.status !== "failed") throw new Error("Download status is " + manifest.status + "; only filtering or failed downloads can be filtered again.");
  if (!manifest.download) throw new Error("Download did not finish; start a new download.");
  await stat(path.join(directory, "archive-prefix.pgn.zst"));
  const { status, download, error, ...provenance } = manifest;
  // An unfinished sample from the interrupted run is never used; start it again.
  await rm(path.join(directory, "sample.pgn.partial"), { force: true });
  try {
    return await filterAndImport(name, directory, provenance, download, provenance.options, provenance.limit ?? undefined);
  } catch (error) {
    await writeFile(manifestFile, JSON.stringify({ ...provenance, status: "failed", download, error: String(error) }, null, 2));
    throw error;
  }
}

async function filterAndImport(name: string, directory: string, provenance: Record<string, unknown>,
  download: unknown, options: ImportOptions, limit?: number) {
  const targetRun = runPath(name);
  const manifestFile = path.join(directory, "manifest.json");
  const prefix = path.join(directory, "archive-prefix.pgn.zst");
  const sample = path.join(directory, "sample.pgn");
  await writeFile(manifestFile, JSON.stringify({ ...provenance, status: "filtering", download }, null, 2));
  const filtered = await filterPrefix(prefix, sample + ".partial", options, limit);
  await rename(sample + ".partial", sample);
  const imported = await importFiles([sample], name, options, limit);
  const runManifestFile = path.join(targetRun, "manifest.json");
  const runManifest = JSON.parse(await readFile(runManifestFile, "utf8"));
  await writeFile(runManifestFile, JSON.stringify({ ...runManifest, sourceDownload: {
    manifest: manifestFile, ...provenance, download, filtered,
  } }, null, 2));
  await writeFile(manifestFile, JSON.stringify({ ...provenance, status: "complete", download, filtered,
    importedRun: imported.directory, finishedAt: new Date().toISOString() }, null, 2));
  return { directory: imported.directory, sample, download, filtered, coverage: imported.coverage,
    targetReached: limit === undefined ? null : filtered.accepted >= limit };
}
