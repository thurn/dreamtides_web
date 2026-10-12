// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserOwnerClearError, BrowserOwnerRecord } from "./browser-owner-record.mjs";

const io = vi.hoisted(() => ({
  fault: "", path: "", events: /** @type {string[]} */ ([]),
  files: /** @type {Map<number, string>} */ (new Map()),
  beforePublish: /** @type {(() => void) | null} */ (null),
  duringDirectoryFlush: /** @type {(() => void) | null} */ (null),
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = /** @type {typeof import("node:fs")} */ (await importOriginal());
  const fail = (/** @type {string} */ event) => {
    io.events.push(event);
    if (io.fault === event) { io.fault = ""; throw new Error(`synthetic ${event} failure`); }
  };
  return { ...actual,
    openSync: (/** @type {string} */ path, /** @type {string} */ flags, /** @type {number | undefined} */ mode) => {
      const fd = actual.openSync(path, flags, mode); io.files.set(fd, path); return fd;
    },
    writeFileSync: (/** @type {number} */ fd, /** @type {Buffer} */ data) => {
      if (io.fault === "write") { actual.writeFileSync(fd, data.subarray(0, 8)); fail("write"); }
      fail("write"); actual.writeFileSync(fd, data);
    },
    fsyncSync: (/** @type {number} */ fd) => {
      const directory = actual.fstatSync(fd).isDirectory();
      fail(directory ? "directory-sync" : "file-sync"); actual.fsyncSync(fd);
      if (directory) io.duringDirectoryFlush?.();
      if (!directory) {
        // The published image remains complete while its replacement is staged.
        if (existsSync(io.path)) JSON.parse(actual.readFileSync(io.path, "utf8"));
      }
    },
    closeSync: (/** @type {number} */ fd) => { actual.closeSync(fd); io.files.delete(fd); },
    linkSync: (/** @type {string} */ source, /** @type {string} */ target) => {
      io.beforePublish?.(); fail("link"); actual.linkSync(source, target);
    },
    renameSync: (/** @type {string} */ source, /** @type {string} */ target) => {
      io.beforePublish?.(); fail("rename"); actual.renameSync(source, target);
    },
    unlinkSync: (/** @type {string} */ path) => {
      if (path === io.path) fail("unlink"); actual.unlinkSync(path);
    },
  };
});
const roots = /** @type {string[]} */ ([]);
afterEach(() => {
  expect(io.files.size).toBe(0);
  io.fault = ""; io.path = ""; io.events.splice(0); io.beforePublish = null; io.duringDirectoryFlush = null;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "dreamtides-owner-record-")); roots.push(root);
  const path = join(root, "browser.lock.owner.json"); io.path = path;
  const owner = { token: randomUUID(), pid: process.pid, providerState: "active", label: "synthetic" };
  return { root, path, owner, record: new BrowserOwnerRecord(path) };
}
/** @param {string} path */
const bytes = (path) => readFileSync(path);
describe("atomic browser ownership publication", () => {
  it.each(/** @type {const} */ (["verify", "unlink", "directory-sync"]))("retains unprintable clear cause and phase %s", (phase) => {
    const cause = { toString() { throw new Error("synthetic formatting rejection"); } };
    const error = new BrowserOwnerClearError(phase, cause);
    expect(error.cause).toBe(cause);
    expect(error).toMatchObject({ phase, unlinked: phase === "directory-sync" });
  });
  it("publishes complete records with file and directory flushes, then clears exact ownership", () => {
    const { root, path, owner, record } = fixture();
    record.publish(owner);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(owner);
    expect(io.events).toEqual(["write", "file-sync", "link", "directory-sync"]);
    io.events.splice(0);
    record.publish({ ...owner, providerState: "execution-completed", mcpExecutionCompleted: true });
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ token: owner.token, mcpExecutionCompleted: true });
    expect(io.events).toEqual(["write", "file-sync", "rename", "directory-sync"]);
    expect(readdirSync(root)).toEqual(["browser.lock.owner.json"]);
    record.clear(); expect(existsSync(path)).toBe(false);
    expect(io.events.at(-1)).toBe("directory-sync");
  });
  it.each(["write", "file-sync", "link"])("leaves no partial initial owner after %s failure", (fault) => {
    const { root, path, owner, record } = fixture(); io.fault = fault;
    expect(() => record.publish(owner)).toThrow(/synthetic/);
    expect(existsSync(path)).toBe(false); expect(readdirSync(root)).toEqual([]);
    record.publish(owner); expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(owner);
  });
  it.each(["write", "file-sync", "rename"])("preserves the prior exact parseable image after %s failure", (fault) => {
    const { root, path, owner, record } = fixture(); record.publish(owner);
    const prior = bytes(path); io.fault = fault;
    expect(() => record.publish({ ...owner, mcpExecutionCompleted: true })).toThrow(/synthetic/);
    expect(bytes(path).equals(prior)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(owner);
    expect(readdirSync(root)).toEqual(["browser.lock.owner.json"]);
    record.clear(); expect(existsSync(path)).toBe(false);
  });
  it.each([false, true])("protects complete published bytes after directory flush failure (replacement=%s)", (replacement) => {
    const { path, owner, record } = fixture();
    if (replacement) record.publish(owner);
    const completed = { ...owner, providerState: "execution-completed", mcpExecutionCompleted: true };
    io.fault = "directory-sync";
    expect(() => record.publish(completed)).toThrow(/directory-sync/);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(completed);
    // The producer remembers the visible publication, so recovery uses its
    // exact current bytes rather than trying to match the older image.
    record.publish({ ...completed, providerState: "close-unconfirmed" });
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ mcpExecutionCompleted: true, providerState: "close-unconfirmed" });
  });
  it("refuses an existing owner and a collision at atomic initial publication", async () => {
    const { path, owner, record } = fixture();
    const actual = /** @type {typeof import("node:fs")} */ (await vi.importActual("node:fs"));
    const peer = Buffer.from('{"token":"synthetic-other-owner"}\n');
    actual.writeFileSync(path, peer);
    expect(() => record.publish(owner)).toThrow(/already exists/);
    expect(bytes(path).equals(peer)).toBe(true);
    actual.unlinkSync(path);
    io.beforePublish = () => actual.writeFileSync(path, peer);
    expect(() => record.publish(owner)).toThrow();
    expect(bytes(path).equals(peer)).toBe(true);
    record.clear(); expect(bytes(path).equals(peer)).toBe(true);
  });
  it("preserves a changed record on both replacement and clear, comparing actual bytes", async () => {
    const { path, owner, record } = fixture(); record.publish({ ...owner, label: "\uFFFD" });
    const prior = bytes(path);
    const marker = prior.indexOf(Buffer.from("\uFFFD")); expect(marker).toBeGreaterThan(0);
    const changed = Buffer.concat([prior.subarray(0, marker), Buffer.from([0x80]), prior.subarray(marker + 3)]);
    expect(changed.toString("utf8")).toBe(prior.toString("utf8"));
    const actual = /** @type {typeof import("node:fs")} */ (await vi.importActual("node:fs")); actual.writeFileSync(path, changed);
    expect(() => record.publish(owner)).toThrow(/changed/);
    expect(() => record.clear()).toThrow(/changed/);
    expect(bytes(path).equals(changed)).toBe(true);
  });
  it("rejects a replacement observed during final directory flush and preserves its bytes", async () => {
    const { path, owner, record } = fixture(); record.publish(owner);
    const actual = /** @type {typeof import("node:fs")} */ (await vi.importActual("node:fs"));
    const peer = Buffer.from('{"token":"synthetic-replacement"}\n');
    io.duringDirectoryFlush = () => actual.writeFileSync(path, peer);
    expect(() => record.publish({ ...owner, providerState: "execution-completed" })).toThrow(/changed/);
    expect(() => record.clear()).toThrow(/changed/);
    expect(bytes(path).equals(peer)).toBe(true);
  });
  it.each(["unlink", "directory-sync"])("reports clear failure at %s with the actual published-file outcome", (fault) => {
    const { path, owner, record } = fixture(); record.publish(owner); const prior = bytes(path);
    io.fault = fault;
    let error;
    try { record.clear(); } catch (failure) { error = failure; }
    expect(error).toBeInstanceOf(BrowserOwnerClearError);
    expect(error).toMatchObject({ phase: fault, unlinked: fault === "directory-sync" });
    expect(existsSync(path)).toBe(fault === "unlink");
    if (fault === "unlink") expect(bytes(path).equals(prior)).toBe(true);
    record.clear(); expect(existsSync(path)).toBe(false);
  });
});
