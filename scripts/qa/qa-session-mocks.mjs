import { EventEmitter } from "node:events";

/**
 * @typedef {object} SessionFixtureIo
 * @property {string | null} gitCwd
 * @property {import("node:child_process").ChildProcess[]} children
 * @property {Promise<void>} ready
 * @property {Array<{ pid: number, group: number | null, closed: boolean }>} groups
 */

/** The actual OS boundary, before any synthetic server identity adapter.
 * @param {typeof import("node:child_process")} actual @param {number} pid
 */
export function processGroup(actual, pid) {
  try {
    return Number(actual.execFileSync("ps", ["-p", String(pid), "-o", "pgid="], { encoding: "utf8" }).trim());
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 1) return null;
    throw error;
  }
}

/** Real native subprocesses contained in the test job, with direct-child cleanup.
 * @param {typeof import("node:child_process")} actual @param {SessionFixtureIo} fixtureIo
 */
export function childProcessMocks(actual, fixtureIo) {
  return { ...actual,
    spawn(/** @type {string} */ command, /** @type {string[]} */ args, /** @type {import("node:child_process").SpawnOptions} */ options) {
      const server = args[0]?.endsWith("/server-launcher.mjs") === true;
      const stdio = /** @type {import("node:child_process").SpawnOptions["stdio"]} */ (server && Array.isArray(options.stdio) ? [...options.stdio, "ipc"] : options.stdio);
      const child = actual.spawn(command, args, { ...options, stdio, detached: false });
      if (child.pid !== undefined) {
        const observed = { pid: child.pid, group: processGroup(actual, child.pid), closed: false };
        fixtureIo.groups.push(observed); child.once("close", () => { observed.closed = true; });
      }
      if (server) fixtureIo.ready = new Promise((done, reject) => {
        const failed = () => { child.removeListener("message", ready); reject(new Error("synthetic server exited before ready")); };
        const ready = () => { child.removeListener("close", failed); child.removeListener("error", failed); child.removeListener("exit", failed); done(); };
        child.once("message", ready); child.once("close", failed); child.once("error", failed); child.once("exit", failed);
      });
      if (server) void fixtureIo.ready.catch(() => {});
      fixtureIo.children.push(child); return child;
    },
    execFileSync(/** @type {string} */ command, /** @type {string[]} */ args, /** @type {import("node:child_process").ExecFileSyncOptionsWithStringEncoding} */ options) {
      const cwd = command === "git" && args.includes("--git-common-dir") ? fixtureIo.gitCwd : null;
      const result = actual.execFileSync(command, args, cwd === null ? options : { ...options, cwd });
      // Only server identity is modeled; the separately captured groups above
      // remain actual job containment observations.
      if (command === "ps") return result.split("\n").map((line) => line.replace(/^(\s*)(\d+)\s+\d+/u,
        (whole, pad, pid) => fixtureIo.children.some((child) => child.pid === Number(pid)) ? `${pad}${pid} ${pid}` : whole)).join("\n");
      return result;
    },
  };
}

/** Socket availability and HTTP readiness stay independent of native locks.
 * @param {typeof import("node:net")} actual
 */
export function networkMocks(actual) {
  return { ...actual,
    createConnection() {
      const socket = Object.assign(new EventEmitter(), { destroy() {} });
      queueMicrotask(() => socket.emit("error", new Error("synthetic unused port"))); return socket;
    },
    createServer() {
      const server = new EventEmitter();
      return Object.assign(server, {
        /** @param {unknown} _options @param {() => void} ready */
        listen(_options, ready) { queueMicrotask(ready); return server; },
        /** @param {() => void} closed */
        close(closed) { queueMicrotask(closed); },
      });
    },
  };
}
