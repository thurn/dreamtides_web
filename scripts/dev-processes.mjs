import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export function summarizeRuntimeState(state) {
  const liveChildren = (state.children ?? []).filter((child) =>
    pidIsAlive(child.pid),
  );
  return {
    ...state,
    wrapperAlive: pidIsAlive(state.pid),
    liveChildren,
    active: pidIsAlive(state.pid) || liveChildren.length > 0,
  };
}

function worktreePaths(root) {
  const output = execFileSync(
    "git",
    ["worktree", "list", "--porcelain"],
    { cwd: root, encoding: "utf8" },
  );
  return output
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => resolve(line.slice("worktree ".length)));
}

export function readRuntimeStates(root) {
  const states = [];
  for (const worktree of worktreePaths(root)) {
    const stateDir = join(
      worktree,
      "node_modules",
      ".cache",
      "quest-dev",
    );
    if (!existsSync(stateDir)) continue;
    for (const filename of readdirSync(stateDir)) {
      if (!filename.endsWith(".json")) continue;
      const statePath = join(stateDir, filename);
      try {
        const state = summarizeRuntimeState(
          JSON.parse(readFileSync(statePath, "utf8")),
        );
        if (!state.active) {
          unlinkSync(statePath);
          continue;
        }
        states.push({ ...state, statePath });
      } catch (error) {
        console.warn(`Ignoring unreadable dev runtime state ${statePath}: ${String(error)}`);
      }
    }
  }
  return states;
}

function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function waitUntilStopped(state, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!summarizeRuntimeState(state).active) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  return !summarizeRuntimeState(state).active;
}

async function stopState(state) {
  if (state.wrapperAlive) process.kill(state.pid, "SIGTERM");
  if (await waitUntilStopped(state, 9_000)) return;

  for (const child of summarizeRuntimeState(state).liveChildren) {
    signalProcessGroup(child.pid, "SIGTERM");
  }
  if (await waitUntilStopped(state, 2_000)) return;

  for (const child of summarizeRuntimeState(state).liveChildren) {
    signalProcessGroup(child.pid, "SIGKILL");
  }
  await waitUntilStopped(state, 1_000);
}

function printStates(states) {
  if (states.length === 0) {
    console.log("No managed quest development servers are running.");
    return;
  }
  for (const state of states) {
    const childPids = state.liveChildren.map((child) => child.pid).join(", ");
    console.log(
      `${state.cwd}: wrapper ${String(state.pid)} ` +
        `(${state.wrapperAlive ? "running" : "orphaned"}), children ${childPids || "none"}, ` +
        `started ${state.startedAt}`,
    );
  }
}

async function main() {
  const root = process.cwd();
  const stop = process.argv.includes("--stop");
  const all = process.argv.includes("--all");
  const states = readRuntimeStates(root);
  const selected = all
    ? states
    : states.filter((state) => resolve(state.cwd) === resolve(root));

  if (!stop) {
    printStates(states);
    return;
  }
  if (selected.length === 0) {
    console.log(
      all
        ? "No managed quest development servers are running."
        : "No managed quest development server is running in this worktree.",
    );
    return;
  }
  for (const state of selected) {
    console.log(`Stopping managed development server in ${state.cwd}...`);
    await stopState(state);
  }
  const remaining = readRuntimeStates(root).filter((state) =>
    selected.some((candidate) => candidate.statePath === state.statePath),
  );
  if (remaining.length > 0) {
    printStates(remaining);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] === undefined
  ? ""
  : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) await main();

