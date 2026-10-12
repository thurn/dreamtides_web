// The parent's stdin gate releases only after its server identity is durable.
// Before release, EOF exits without starting a server. After release this
// process remains the server group leader until the server tree settles.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const [recordPath, token, command, ...args] = process.argv.slice(2);
let child = /** @type {import("node:child_process").ChildProcess | null} */ (null);
let released = false;
process.stdin.once("data", () => {
  const record = /** @type {unknown} */ (JSON.parse(readFileSync(String(recordPath), "utf8")));
  if (typeof record !== "object" || record === null || !("token" in record) || record.token !== token ||
    !("server" in record) || typeof record.server !== "object" || record.server === null ||
    !("pid" in record.server) || record.server.pid !== process.pid) throw new Error("server launch record does not match gate");
  released = true;
  const ipc = process.connected === true;
  child = spawn(String(command), args, { stdio: ipc ? ["ignore", "inherit", "inherit", "ipc"] : "inherit",
    env: { ...process.env, DREAMTIDES_QA_SERVER_GROUP: String(process.pid) } });
  child.on("message", (message) => { if (process.connected) process.send?.(message); });
  child.once("error", (error) => { console.error(error); process.exitCode = 2; });
  child.once("exit", (code) => { process.exitCode = code ?? 1; });
  process.stdin.destroy();
});
process.stdin.once("end", () => { if (!released) process.exitCode = 0; });
for (const signal of /** @type {const} */ (["SIGTERM", "SIGINT"])) {
  process.once(signal, () => {
    if (child === null) process.exit(signal === "SIGTERM" ? 143 : 130);
    // In production the caller signals the entire isolated group. Direct-PID
    // fixture cleanup still forwards a signal to the ordinary contained child.
    child?.kill(signal);
  });
}
