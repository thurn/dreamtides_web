// @vitest-environment node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(import.meta.resolve("./plan-source-packet.mjs"));
// Fixtures own their repository, configuration, index and object storage.
const fixtureEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_COUNT: "0",
};
/** @type {string[]} */
const temporary = [];
/** @param {string | Uint8Array} value */
const hash = (value) => createHash("sha256").update(value).digest("hex");
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** @param {string | Uint8Array} [content] */
function fixture(content = "source\n") {
  const directory = mkdtempSync(join(tmpdir(), "plan-packet-"));
  temporary.push(directory);
  const path = join(directory, "source.txt");
  writeFileSync(path, content);
  return { directory, path, bytes: typeof content === "string" ? Buffer.from(content) : Buffer.from(content) };
}

/** @param {string[]} args @param {string} [cwd] */
function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8", env: fixtureEnv });
}

/** @param {{path: string, bytes: Uint8Array}} input @param {string[]} [extra] */
function current(input, extra = []) {
  return ["--file", input.path, "--sha256", hash(input.bytes), "--packet", "1", "--max-bytes", "1400", ...extra];
}

/** @typedef {{content: string, contentSha256: string, contentStart: number, contentEnd: number, maxBytes: number, index: number, count: number, source: unknown, sourceSha256: string, sourceBytes: number, rangeSha256: string, rangeStart: number, rangeEnd: number}} Packet */

/** @param {import('node:child_process').SpawnSyncReturns<string>} result @param {number} ceiling */
function decode(result, ceiling) {
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(ceiling);
  const lines = result.stdout.split("\n");
  expect(lines).toHaveLength(3);
  expect(lines[2]).toBe("");
  expect(lines[1]).toBe(`END_SOURCE_PACKET ${hash(`${lines[0]}\n`)}`);
  /** @type {unknown} */
  const parsed = JSON.parse(lines[0]);
  const packet = /** @type {Packet} */ (parsed);
  expect(packet.contentSha256).toBe(hash(packet.content));
  expect(packet.contentEnd - packet.contentStart).toBe(Buffer.byteLength(packet.content));
  expect(packet.maxBytes).toBe(ceiling);
  return packet;
}

/** @param {string[]} args @param {string} [cwd] @param {number} [ceiling] */
function reconstruct(args, cwd, ceiling = 1400) {
  const first = decode(run([...args, "--packet", "1", "--max-bytes", String(ceiling)], cwd), ceiling);
  const packets = [first];
  for (let index = 2; index <= first.count; index++) {
    packets.push(decode(run([...args, "--packet", String(index), "--max-bytes", String(ceiling)], cwd), ceiling));
  }
  let offset = first.rangeStart;
  for (const [index, packet] of packets.entries()) {
    expect(packet.index).toBe(index + 1);
    expect(packet.count).toBe(first.count);
    expect(packet.source).toEqual(first.source);
    expect(packet.sourceSha256).toBe(first.sourceSha256);
    expect(packet.rangeSha256).toBe(first.rangeSha256);
    expect(packet.contentStart).toBe(offset);
    offset = packet.contentEnd;
  }
  expect(offset).toBe(first.rangeEnd);
  const reconstructed = Buffer.from(packets.map((packet) => packet.content).join(""));
  expect(hash(reconstructed)).toBe(first.rangeSha256);
  return { first, packets, reconstructed };
}

/** @param {string} directory */
function snapshot(directory) {
  /** @type {Record<string, {size: number, mtime: number, directory: boolean, sha256?: string}>} */
  const entries = {};
  /** @param {string} path @param {string} key */
  function visit(path, key) {
    const stat = statSync(path);
    entries[key] = { size: stat.size, mtime: stat.mtimeMs, directory: stat.isDirectory() };
    if (stat.isDirectory()) {
      for (const child of readdirSync(path).sort()) visit(join(path, child), `${key}/${child}`);
    } else entries[key].sha256 = hash(readFileSync(path));
  }
  visit(directory, ".");
  return entries;
}

/** @param {string} directory @param {string[]} args */
function git(directory, args) {
  const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: directory,
    encoding: "utf8",
    env: { ...fixtureEnv, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid", GIT_AUTHOR_DATE: "2001-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2001-01-01T00:00:00Z" },
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

describe("source packet CLI", () => {
  it("reconstructs exact escaped BOM, CRLF, controls and multibyte bytes across small packets and long lines", () => {
    const input = fixture("\ufeff\r\n" + '"\\\t\u0000é🧭漢'.repeat(180) + "\r\nlast");
    const args = ["--file", input.path, "--sha256", hash(input.bytes)];
    const before = snapshot(input.directory);
    const { first, packets, reconstructed } = reconstruct(args);
    expect(packets.length).toBeGreaterThan(1);
    expect(reconstructed).toEqual(input.bytes);
    expect(first.source).toEqual({ kind: "current-file", path: input.path, sha256: hash(input.bytes) });
    expect(first.sourceBytes).toBe(input.bytes.length);
    expect(first.sourceSha256).toBe(hash(input.bytes));
    expect(first.rangeSha256).toBe(hash(input.bytes));
    expect(snapshot(input.directory)).toEqual(before);
  });

  it("reconstructs selected half-open UTF8 byte ranges and empty sources/ranges", () => {
    const input = fixture("Aé🧭漢Z".repeat(120));
    const start = Buffer.byteLength("Aé");
    const end = input.bytes.length - 1;
    const { first, reconstructed } = reconstruct(["--file", input.path, "--sha256", hash(input.bytes), "--start", String(start), "--end", String(end)]);
    expect(reconstructed).toEqual(input.bytes.subarray(start, end));
    expect(first.sourceSha256).toBe(hash(input.bytes));
    expect(first.sourceBytes).toBe(input.bytes.length);
    expect(first.rangeStart).toBe(start);
    expect(first.rangeEnd).toBe(end);
    expect(first.rangeSha256).toBe(hash(input.bytes.subarray(start, end)));
    for (const sample of [fixture(""), input]) {
      const args = current(sample, ["--start", "0", "--end", "0"]);
      const packet = decode(run(args), 1400);
      expect(packet.content).toBe("");
      expect(packet.count).toBe(1);
      expect(packet.rangeSha256).toBe(hash(""));
    }
  });

  it("binds immutable commit/blob/path separately from the expected current-file epoch without writes", () => {
    const input = fixture("committed é🧭\r\n".repeat(60));
    git(input.directory, ["init", "--quiet", "--template="]);
    git(input.directory, ["add", "source.txt"]);
    git(input.directory, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "synthetic source"]);
    const commit = git(input.directory, ["rev-parse", "HEAD"]);
    const blob = git(input.directory, ["rev-parse", `${commit}:source.txt`]);
    writeFileSync(input.path, "replacement commit\n");
    git(input.directory, ["add", "source.txt"]);
    git(input.directory, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "replacement"]);
    const replacement = git(input.directory, ["rev-parse", "HEAD"]);
    git(input.directory, ["replace", commit, replacement]);
    writeFileSync(input.path, "current epoch\n");
    const before = snapshot(input.directory);
    const { first, reconstructed } = reconstruct(["--git", commit, "--path", "source.txt"], input.directory);
    expect(first.source).toEqual({ kind: "git-blob", commit, blob, path: "source.txt" });
    expect(reconstructed).toEqual(input.bytes);
    const stale = run(current(input), input.directory);
    expect(stale.status).not.toBe(0);
    expect(stale.stdout).toBe("");
    const fresh = { ...input, bytes: Buffer.from("current epoch\n") };
    expect(decode(run(current(fresh)), 1400).sourceSha256).toBe(hash(fresh.bytes));
    expect(snapshot(input.directory)).toEqual(before);
    for (const object of [blob, "a".repeat(40)]) {
      const refused = run(["--git", object, "--path", "source.txt", "--packet", "1", "--max-bytes", "1400"], input.directory);
      expect(refused.status).not.toBe(0);
      expect(refused.stdout).toBe("");
    }
  });

  it("restarts deterministically and refuses a changed epoch between independent packet reads", () => {
    const input = fixture("long 🧭".repeat(200));
    const args = current(input);
    const first = run(args);
    expect(run(args).stdout).toBe(first.stdout);
    expect(decode(first, 1400).count).toBeGreaterThan(1);
    writeFileSync(input.path, "changed source");
    const next = run(args.map((arg, index) => index === args.indexOf("--packet") + 1 ? "2" : arg));
    expect(next.status).not.toBe(0);
    expect(next.stdout).toBe("");
  });

  it("refuses an envelope ceiling that cannot hold one whole code point", () => {
    const input = fixture("🧭");
    const complete = run(current(input));
    decode(complete, 1400);
    // Shrinking the four-digit ceiling itself may save one encoded byte.
    const ceiling = Buffer.byteLength(complete.stdout) - 2;
    const args = current(input).map((arg, index, all) => all[index - 1] === "--max-bytes" ? String(ceiling) : arg);
    const refused = run(args);
    expect(refused.status).not.toBe(0);
    expect(refused.stdout).toBe("");
  });

  it("refuses malformed input and preparation failures without partial stdout", () => {
    const input = fixture("Aé🧭Z");
    /** @param {string} flag @param {string} value */
    const replace = (flag, value) => current(input).map((arg, index, all) => all[index - 1] === flag ? value : arg);
    const cases = [
      [], [...current(input), "--unknown", "x"], [...current(input), "--packet", "2"],
      current(input).slice(0, -1), replace("--packet", "0"), replace("--packet", "2"),
      replace("--packet", "1.5"), replace("--packet", "9007199254740992"),
      replace("--max-bytes", "1"), replace("--max-bytes", "-1"), replace("--max-bytes", "NaN"),
      replace("--sha256", "f".repeat(64)), replace("--sha256", "invalid"),
      replace("--file", join(input.directory, "missing")), replace("--file", input.directory),
      [...current(input), "--start", "2"], [...current(input), "--end", "4"],
      [...current(input), "--start", "8", "--end", "2"], [...current(input), "--end", "99"],
      [...current(input), "--git", "a".repeat(40)],
      ["--git", "HEAD", "--path", "source.txt", "--packet", "1", "--max-bytes", "1400"],
      ["--git", "a".repeat(40), "--path", "../source.txt", "--packet", "1", "--max-bytes", "1400"],
      ["--git", "a".repeat(40), "--path", "source.txt", "--packet", "1", "--max-bytes", "1400"],
    ];
    const before = snapshot(input.directory);
    for (const args of cases) {
      const result = run(args, input.directory);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr.length).toBeGreaterThan(0);
    }
    expect(snapshot(input.directory)).toEqual(before);
    const malformed = fixture(Buffer.from([0x61, 0xc3, 0x28]));
    const result = run(current(malformed));
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });
});
