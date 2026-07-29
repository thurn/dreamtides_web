import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const artifact = process.argv[2];
if (artifact === undefined) {
  throw new Error("usage: npm run fuzz:replay -- <run artifact directory>");
}
const metadata = JSON.parse(
  readFileSync(resolve(artifact, "metadata.json"), "utf8"),
);
const child = spawn(
  process.execPath,
  [
    "scripts/fuzz-demo.mjs",
    "--profile",
    metadata.profile,
    "--seed",
    String(metadata.seed),
    "--runs",
    "1",
  ],
  { cwd: process.cwd(), stdio: "inherit" },
);
const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolveExit(code ?? 1));
});
process.exitCode = exitCode;
