// Read-only source preparation. One invocation emits one selected packet.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/** @param {string | Uint8Array} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** @param {string} message @returns {never} */
const fail = (message) => { throw new Error(message); };
const FLAGS = new Set([
  "--git", "--path", "--file", "--sha256", "--packet", "--max-bytes", "--start", "--end",
]);

/** @param {string[]} args */
function options(args) {
  /** @type {Map<string, string>} */
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!FLAGS.has(key) || values.has(key) || args[index + 1] === undefined) {
      fail("Expected distinct named flags with values.");
    }
    values.set(key, args[index + 1]);
  }
  const current = values.has("--file");
  if (current
    ? values.has("--git") || values.has("--path") || !values.has("--sha256")
    : !values.has("--git") || !values.has("--path") || values.has("--sha256")) {
    fail("Choose --git FULL_COMMIT --path REPO_PATH or --file PATH --sha256 FULL_HASH.");
  }
  for (const flag of ["--packet", "--max-bytes"]) {
    if (!values.has(flag)) fail(`Missing ${flag}.`);
  }
  return values;
}

/** @param {Map<string, string>} values @param {string} key */
function required(values, key) {
  const value = values.get(key);
  return value === undefined ? fail(`Missing ${key}.`) : value;
}

/** @param {string | undefined} value @param {number} [minimum] */
function integer(value, minimum = 0) {
  if (!/^(0|[1-9][0-9]*)$/.test(value ?? "") ||
      !Number.isSafeInteger(Number(value)) || Number(value) < minimum) {
    fail("Expected a safe integer within the allowed range.");
  }
  return Number(value);
}

/** @param {import('node:fs').BigIntStats} left @param {import('node:fs').BigIntStats} right */
function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

/** @param {Map<string, string>} values */
function source(values) {
  if (values.has("--file")) {
    const path = resolve(required(values, "--file"));
    const expected = required(values, "--sha256");
    if (!/^[a-f0-9]{64}$/.test(expected)) fail("Expected lowercase full SHA256.");
    if (!statSync(path).isFile()) fail("Current source must be a regular file.");
    // A concurrent replacement by a FIFO must not block before fstat refuses it.
    const descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const before = fstatSync(descriptor, { bigint: true });
      if (!before.isFile()) fail("Current source must be a regular file.");
      const bytes = readFileSync(descriptor);
      const after = fstatSync(descriptor, { bigint: true });
      const named = statSync(path, { bigint: true });
      if (!sameFile(before, after) || !sameFile(after, named)) {
        fail("Current source changed while reading.");
      }
      if (hash(bytes) !== expected) fail("Current source SHA256 differs from the requested epoch.");
      return { bytes, identity: { kind: "current-file", path, sha256: expected } };
    } finally {
      closeSync(descriptor);
    }
  }
  const commit = required(values, "--git");
  const path = required(values, "--path");
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) fail("Expected full lowercase commit OID.");
  if (!path || isAbsolute(path) || path.includes("\0") ||
      path.split("/").some((part) => !part || part === "." || part === "..")) {
    fail("Expected literal repository-relative path without dot segments.");
  }
  /** @param {...string} args */
  const git = (...args) => execFileSync("git", args, {
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: "0",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_NO_LAZY_FETCH: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (git("cat-file", "-t", commit).toString().trim() !== "commit") fail("Git source must name a commit.");
  const blob = git("rev-parse", "--verify", `${commit}:${path}`).toString().trim();
  if (git("cat-file", "-t", blob).toString().trim() !== "blob") fail("Git path must name a blob.");
  return { bytes: git("cat-file", "blob", blob), identity: { kind: "git-blob", commit, blob, path } };
}

/** @param {unknown} packet */
function serialize(packet) {
  const body = `${JSON.stringify(packet)}\n`;
  return `${body}END_SOURCE_PACKET ${hash(body)}\n`;
}

/** @param {Map<string, string>} values */
function prepare(values) {
  const selected = integer(values.get("--packet"), 1);
  const maxBytes = integer(values.get("--max-bytes"), 1);
  const { bytes, identity } = source(values);
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  // Validate the full source, including bytes outside a selected range.
  decoder.decode(bytes);
  const start = integer(values.get("--start") ?? "0");
  const end = integer(values.get("--end") ?? String(bytes.length));
  if (start > end || end > bytes.length) fail("Requested range is outside source.");
  /** @param {number} offset */
  const boundary = (offset) => offset === bytes.length || (bytes[offset] & 0xc0) !== 0x80;
  if (!boundary(start) || !boundary(end)) fail("Requested range splits a UTF8 code point.");
  const range = bytes.subarray(start, end);
  const text = decoder.decode(range);
  const upper = range.length + 1;
  if (!Number.isSafeInteger(upper)) fail("Source is too large.");
  const common = {
    version: 1,
    qualification: "prepared-only; delivery and semantic reading require consumer verification",
    source: identity,
    sourceBytes: bytes.length,
    sourceSha256: hash(bytes),
    rangeStart: start,
    rangeEnd: end,
    rangeSha256: hash(range),
    maxBytes,
  };
  /** @param {string} content @param {number} index @param {number} count @param {number} contentStart @param {number} contentEnd */
  const envelope = (content, index, count, contentStart, contentEnd) => ({
    ...common,
    index,
    count,
    contentStart,
    contentEnd,
    contentSha256: hash(content),
    content,
  });
  const reserve = Buffer.byteLength(serialize(envelope("", upper, upper, end, end)));
  const budget = maxBytes - reserve;
  if (budget < 0) fail("Ceiling is too small for the conservative envelope.");
  const chunks = [];
  let content = "";
  let cost = 0;
  for (const point of text) {
    const pointCost = Buffer.byteLength(JSON.stringify(point)) - 2;
    if (pointCost > budget) fail("Ceiling is too small for a source code point.");
    if (cost + pointCost > budget) {
      chunks.push(content);
      content = "";
      cost = 0;
    }
    content += point;
    cost += pointCost;
  }
  chunks.push(content);
  if (selected > chunks.length) fail("Selected packet is outside packet count.");
  let offset = start;
  for (let index = 0; index < selected - 1; index++) offset += Buffer.byteLength(chunks[index]);
  const chosen = chunks[selected - 1];
  const output = serialize(envelope(chosen, selected, chunks.length, offset, offset + Buffer.byteLength(chosen)));
  if (Buffer.byteLength(output) > maxBytes) fail("Prepared packet exceeds ceiling.");
  return output;
}

try {
  const output = prepare(options(process.argv.slice(2)));
  process.stdout.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
  process.stdout.write(output);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
