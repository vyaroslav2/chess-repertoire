import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import * as zlib from "node:zlib";
import { createHash } from "node:crypto";
import { downloadPrefix, filterPrefix, filterDownloaded, archiveUrl, gbToBytes, zstdDataOffset } from "../download";
import { assertDataDirectory, DATA_ROOT, runPath } from "../paths";

async function scratch(work: (directory: string) => Promise<void>) {
  await assertDataDirectory(DATA_ROOT);
  const directory = await mkdtemp(path.join(DATA_ROOT, "test-download-"));
  try { await work(directory); }
  finally { await assertDataDirectory(directory); await rm(directory, { recursive: true }); }
}
const compress = (zlib as unknown as { zstdCompressSync: (input: Buffer) => Buffer }).zstdCompressSync;
function game(id: string) {
  const moves = ["1. d4 d5"];
  for (let n = 2; n <= 16; n++) moves.push(n + ". " + (n % 2 ? "Ng1 Ng8" : "Nf3 Nf6"));
  return '[Event "Rated rapid game"]\n[Site "https://lichess.org/' + id +
    '"]\n[Date "2024.01.01"]\n[WhiteElo "1800"]\n[BlackElo "1800"]\n[Result "0-1"]\n\n' +
    moves.join(" ") + " 0-1\n";
}
function metadata(bytes: number) {
  const result = Buffer.alloc(8 + bytes);
  result.writeUInt32LE(0x184d2a50, 0); result.writeUInt32LE(bytes, 4);
  return result;
}
function framed(data: Buffer) {
  const hint = metadata(4);
  hint.writeUInt32LE(data.length, 8);
  return Buffer.concat([hint, data]);
}
test("archive month and decimal GB cap are explicit", () => {
  assert.equal(gbToBytes(2.5), 2_500_000_000);
  assert.equal(gbToBytes(0.001), 1_000_000);
  assert.match(archiveUrl("2024-01"), /standard_rated_2024-01\.pgn\.zst$/);
  for (const bad of ["2024-13", "../outside", "2022-01"]) assert.throws(() => archiveUrl(bad));
  for (const bad of [0, -1, NaN, Infinity]) assert.throws(() => gbToBytes(bad));
});
test("HTTP byte-range download writes only requested bytes and records a digest", async () => scratch(async directory => {
  const output = path.join(directory, "prefix.zst");
  const result = await downloadPrefix("https://example.com/archive", output, 10, async (_url, init) => {
    assert.equal((init.headers as Record<string, string>).Range, "bytes=0-9");
    return new Response("abcdefghij", { status: 206, headers: { "content-range": "bytes 0-9/1000" } });
  });
  assert.equal(await readFile(output, "utf8"), "abcdefghij");
  assert.equal(result.bytes, 10); assert.equal(result.totalArchiveBytes, 1000);
  assert.equal(result.prefixSha256, createHash("sha256").update("abcdefghij").digest("hex"));
}));
test("refuse servers ignoring ranges, incorrect bounds, short or excessive bodies", async () => scratch(async directory => {
  const cases = [
    { body: "abcdefghij", status: 200, range: "bytes 0-9/1000", error: /honour/ },
    { body: "abcdefghij", status: 206, range: "bytes 0-19/1000", error: /different byte range/ },
    { body: "abcdefgh", status: 206, range: "bytes 0-9/1000", error: /ended before/ },
    { body: "abcdefghijk", status: 206, range: "bytes 0-9/1000", error: /exceeded/ },
  ];
  for (const [index, row] of cases.entries()) {
    await assert.rejects(downloadPrefix("https://example.com/archive", path.join(directory, index + ".zst"), 10,
      async () => new Response(row.body, { status: row.status, headers: { "content-range": row.range } })), row.error);
  }
}));
test("Zstandard metadata, cohort filtering, deduplication and incomplete tail", async () => scratch(async directory => {
  const archive = path.join(directory, "prefix.zst"), output = path.join(directory, "sample.pgn");
  const first = game("abcd1234"), second = game("efgh5678");
  const pgn = first + "\n" + first + "\n" + second + "\n" + game("ijkl9012").slice(0, -6);
  await writeFile(archive, framed(compress(Buffer.from(pgn))));
  assert.equal(await zstdDataOffset(archive), 12);
  const report = await filterPrefix(archive, output, { seed: "he-v1", maxGap: 100 });
  assert.equal(report.scanned, 3); assert.equal(report.accepted, 2); assert.equal(report.duplicates, 1);
  assert.equal((await readFile(output, "utf8")).match(/\[Event /g)?.length, 2);
}));
test("filter limit is enforced without reading all decompressed games", async () => scratch(async directory => {
  const archive = path.join(directory, "prefix.zst"), output = path.join(directory, "sample.pgn");
  await writeFile(archive, compress(Buffer.from(game("abcd1234") + "\n" + game("efgh5678"))));
  const report = await filterPrefix(archive, output, { seed: "he-v1", maxGap: 100 }, 1);
  assert.equal(report.accepted, 1); assert.equal(report.stoppedAtLimit, true);
}));
test("reject invalid archives and prefixes ending inside metadata", async () => scratch(async directory => {
  const bad = path.join(directory, "bad.zst"), short = path.join(directory, "short.zst");
  await writeFile(bad, Buffer.from("invalid archive"));
  await assert.rejects(zstdDataOffset(bad), /valid Zstandard/);
  const header = metadata(10).subarray(0, 9);
  await writeFile(short, header);
  await assert.rejects(zstdDataOffset(short), /larger sample/);
}));

test("decode multiple Zstandard frames with metadata between them", async () => scratch(async directory => {
  const archive = path.join(directory, "prefix.zst"), output = path.join(directory, "sample.pgn");
  await writeFile(archive, Buffer.concat([
    framed(compress(Buffer.from(game("abcd1234") + "\n"))),
    framed(compress(Buffer.from(game("efgh5678") + "\n"))),
  ]));
  const report = await filterPrefix(archive, output, { seed: "he-v1", maxGap: 100 });
  assert.equal(report.accepted, 2);
}));

test("filter command reruns an interrupted download without downloading again", async () => {
  const name = "test-refilter-" + process.pid;
  const directory = path.join(DATA_ROOT, "downloads", name);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(path.join(directory, "archive-prefix.pgn.zst"),
      framed(compress(Buffer.from(game("abcd1234") + "\n" + game("efgh5678") + "\n"))));
    await writeFile(path.join(directory, "sample.pgn.partial"), "stale");
    const provenance = { schemaVersion: 1, month: "2024-01", options: { seed: "he-v1", maxGap: 100 }, limit: null };
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ ...provenance, status: "complete", download: { bytes: 1 } }));
    await assert.rejects(filterDownloaded(name), /only filtering or failed/);
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ ...provenance, status: "filtering", download: { bytes: 1 } }));
    const result = await filterDownloaded(name);
    assert.equal(result.filtered.accepted, 2);
    assert.equal((await readFile(path.join(directory, "sample.pgn"), "utf8")).match(/\[Event /g)?.length, 2);
    const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
    assert.equal(manifest.status, "complete"); assert.deepEqual(manifest.download, { bytes: 1 });
    await assert.rejects(filterDownloaded(name), /already exists/);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(runPath(name), { recursive: true, force: true });
  }
});
