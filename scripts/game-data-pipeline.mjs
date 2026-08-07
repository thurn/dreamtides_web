import {
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "smol-toml";

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join("data", "game-data-manifest.ron");
const JOURNAL_PATH = ".game-data-transaction.json";
const TRANSACTION_DIR = ".game-data-transactions";
const LOCK_PATH = ".game-data.lock";

function binaryPath(rootDir) {
  return join(rootDir, "tools", "game-data", "target", "debug", "dreamtides-game-data");
}

function cargoManifestPath(rootDir) {
  return join(rootDir, "tools", "game-data", "Cargo.toml");
}

function ensureCompiler(rootDir) {
  execFileSync(
    "cargo",
    ["build", "--locked", "--quiet", "--manifest-path", cargoManifestPath(rootDir)],
    { cwd: rootDir, stdio: ["ignore", "pipe", "pipe"] },
  );
  return binaryPath(rootDir);
}

function runCompiler(rootDir, args, { input, dataRoot = rootDir } = {}) {
  const binary = ensureCompiler(rootDir);
  let stdout;
  try {
    stdout = execFileSync(binary, ["--root", dataRoot, "--json", ...args], {
      cwd: rootDir,
      encoding: "utf8",
      input,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const lines = String(error.stderr ?? "").trim().split("\n");
    let diagnostic;
    try { diagnostic = JSON.parse(lines.at(-1)); } catch {}
    const wrapped = new Error(
      diagnostic?.error?.message ?? String(error.stderr ?? error.message),
    );
    wrapped.code = diagnostic?.error?.code ?? "GAME_DATA_FAILED";
    wrapped.cause = error;
    throw wrapped;
  }
  return JSON.parse(stdout);
}

export function listGameData({ rootDir = MODULE_ROOT } = {}) {
  return runCompiler(resolve(rootDir), ["list"]);
}

function stageRootFor(rootDir) {
  return mkdtempSync(join(rootDir, ".game-data-stage-"));
}

function prepareValidationRoot(rootDir, stageRoot) {
  cpSync(join(rootDir, "data"), join(stageRoot, "data"), {
    recursive: true,
    dereference: false,
  });
  symlinkSync(join(rootDir, "docs"), join(stageRoot, "docs"), "dir");
  cpSync(join(rootDir, "scripts"), join(stageRoot, "scripts"), { recursive: true });
  cpSync(join(rootDir, "src"), join(stageRoot, "src"), { recursive: true });
  symlinkSync(join(rootDir, "node_modules"), join(stageRoot, "node_modules"), "dir");
  mkdirSync(join(stageRoot, "public"), { recursive: true });
  mkdirSync(join(stageRoot, "src", "generated", "config"), { recursive: true });
}

function validateTomlDocuments(manifest, stageRoot) {
  for (const dataset of manifest.datasets) {
    const path = join(stageRoot, dataset.output);
    try {
      parse(readFileSync(path, "utf8"));
    } catch (error) {
      const wrapped = new Error(
        `COMPATIBILITY_VALIDATION_FAILED: ${dataset.id} at ${dataset.output}: ${error.message}`,
      );
      wrapped.code = "COMPATIBILITY_VALIDATION_FAILED";
      wrapped.datasetId = dataset.id;
      wrapped.source = dataset.source;
      throw wrapped;
    }
  }
}

function validateWithTypeScript(_rootDir, stageRoot) {
  try {
    execFileSync(process.execPath, [join(stageRoot, "scripts", "setup-assets.mjs")], {
      cwd: stageRoot,
      env: {
        ...process.env,
        DREAMTIDES_DATA_ROOT: stageRoot,
        GAME_DATA_SKIP_GENERATION: "1",
      },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`.trim();
    const wrapped = new Error(
      `COMPATIBILITY_VALIDATION_FAILED: TypeScript data compilation rejected staged TOML${
        output === "" ? "" : `:\n${output.slice(-8000)}`
      }`,
    );
    wrapped.code = "COMPATIBILITY_VALIDATION_FAILED";
    throw wrapped;
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function acquireLock(rootDir) {
  const lockPath = join(rootDir, LOCK_PATH);
  const token = randomUUID();
  const owner = JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() });
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      writeFileSync(fd, owner);
      closeSync(fd);
      return () => {
        try {
          const current = JSON.parse(readFileSync(lockPath, "utf8"));
          if (current.token === token) unlinkSync(lockPath);
        } catch {}
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const current = JSON.parse(readFileSync(lockPath, "utf8"));
        if (!isProcessAlive(current.pid)) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        try { unlinkSync(lockPath); } catch {}
        continue;
      }
      if (Date.now() >= deadline) {
        const locked = new Error("PUBLICATION_FAILED: timed out waiting for the game-data transaction lock");
        locked.code = "PUBLICATION_FAILED";
        throw locked;
      }
      sleepSync(100);
    }
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeJournal(rootDir, journal) {
  const path = join(rootDir, JOURNAL_PATH);
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(journal, null, 2)}\n`);
  renameSync(temporary, path);
}

export function recoverGameDataPublication({ rootDir = MODULE_ROOT } = {}) {
  rootDir = resolve(rootDir);
  const journalPath = join(rootDir, JOURNAL_PATH);
  if (!existsSync(journalPath)) return { recovered: false };
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  if (journal.state !== "committed") {
    for (const entry of [...journal.entries].reverse()) {
      const destination = join(rootDir, entry.destination);
      const backup = entry.backup === null ? null : join(rootDir, entry.backup);
      if (backup !== null && existsSync(backup)) {
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(backup, destination);
      } else if (entry.hadDestination === false) {
        rmSync(destination, { force: true });
      }
    }
  }
  rmSync(join(rootDir, journal.transactionRoot), { recursive: true, force: true });
  rmSync(journalPath, { force: true });
  return { recovered: true, transactionId: journal.id, state: journal.state };
}

function collectFiles(root, predicate, result = []) {
  if (!existsSync(root)) return result;
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) collectFiles(path, predicate, result);
    else if (stat.isFile() && predicate(path)) result.push(path);
  }
  return result;
}

function publicationCandidates(rootDir, stageRoot, manifest, canonicalPaths = []) {
  const candidates = [
    ...canonicalPaths,
    ...manifest.datasets.map((dataset) => dataset.output),
  ];
  for (const path of collectFiles(join(stageRoot, "public"), (file) => file.endsWith(".json"))) {
    candidates.push(relative(stageRoot, path));
  }
  for (const path of collectFiles(
    join(stageRoot, "src", "generated", "config"),
    (file) => file.endsWith(".json"),
  )) {
    candidates.push(relative(stageRoot, path));
  }
  return [...new Set(candidates)].filter((relativePath) => {
    const source = join(stageRoot, relativePath);
    const destination = join(rootDir, relativePath);
    if (!existsSync(destination)) return true;
    return sha256(readFileSync(source)) !== sha256(readFileSync(destination));
  });
}

function publish(
  rootDir,
  stageRoot,
  manifest,
  { canonicalPaths = [], lockHeld = false } = {},
) {
  const release = lockHeld ? () => {} : acquireLock(rootDir);
  try {
    recoverGameDataPublication({ rootDir });
    const changed = publicationCandidates(
      rootDir,
      stageRoot,
      manifest,
      canonicalPaths,
    );
    if (changed.length === 0) return { changed: [] };
    const id = randomUUID();
    const transactionRoot = join(TRANSACTION_DIR, id);
    const absoluteTransactionRoot = join(rootDir, transactionRoot);
    mkdirSync(absoluteTransactionRoot, { recursive: true });
    const entries = changed.map((destination) => {
      const absoluteDestination = join(rootDir, destination);
      const hadDestination = existsSync(absoluteDestination);
      const backup = hadDestination ? join(transactionRoot, "backups", destination) : null;
      if (backup !== null) {
        const absoluteBackup = join(rootDir, backup);
        mkdirSync(dirname(absoluteBackup), { recursive: true });
        copyFileSync(absoluteDestination, absoluteBackup);
      }
      return { destination, backup, hadDestination, published: false };
    });
    const journal = { id, state: "publishing", transactionRoot, entries };
    writeJournal(rootDir, journal);
    try {
      for (const entry of entries) {
        const source = join(stageRoot, entry.destination);
        const destination = join(rootDir, entry.destination);
        mkdirSync(dirname(destination), { recursive: true });
        const temporary = `${destination}.game-data-${id}`;
        copyFileSync(source, temporary);
        renameSync(temporary, destination);
        entry.published = true;
        writeJournal(rootDir, journal);
      }
      journal.state = "committed";
      writeJournal(rootDir, journal);
      rmSync(absoluteTransactionRoot, { recursive: true, force: true });
      rmSync(join(rootDir, JOURNAL_PATH), { force: true });
      return { changed };
    } catch (error) {
      recoverGameDataPublication({ rootDir });
      const wrapped = new Error(`PUBLICATION_FAILED: ${error.message}`);
      wrapped.code = "PUBLICATION_FAILED";
      wrapped.cause = error;
      throw wrapped;
    }
  } finally {
    release();
  }
}

export async function ensureGameData({ rootDir = MODULE_ROOT, dataset } = {}) {
  rootDir = resolve(rootDir);
  recoverGameDataPublication({ rootDir });
  const manifest = listGameData({ rootDir });
  const stageRoot = stageRootFor(rootDir);
  try {
    prepareValidationRoot(rootDir, stageRoot);
    const compileArgs = ["compile", "--staging-root", stageRoot];
    if (dataset !== undefined) compileArgs.push("--dataset", dataset);
    const compileReport = runCompiler(rootDir, compileArgs);
    validateTomlDocuments(manifest, stageRoot);
    validateWithTypeScript(rootDir, stageRoot);
    const publication = publish(rootDir, stageRoot, manifest);
    return { ok: true, compile: compileReport, publication };
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
}

export async function checkGameData({ rootDir = MODULE_ROOT } = {}) {
  rootDir = resolve(rootDir);
  recoverGameDataPublication({ rootDir });
  const manifest = listGameData({ rootDir });
  const stageRoot = stageRootFor(rootDir);
  try {
    prepareValidationRoot(rootDir, stageRoot);
    const compileReport = runCompiler(rootDir, ["compile", "--staging-root", stageRoot]);
    validateTomlDocuments(manifest, stageRoot);
    validateWithTypeScript(rootDir, stageRoot);
    const stale = manifest.datasets.filter((dataset) => {
      const generated = join(stageRoot, dataset.output);
      const visible = join(rootDir, dataset.output);
      return !existsSync(visible) || sha256(readFileSync(generated)) !== sha256(readFileSync(visible));
    }).map((dataset) => dataset.id);
    return { ok: stale.length === 0, stale, compile: compileReport };
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
}

function assertRepositoryRelativePath(rootDir, path) {
  const absolute = resolve(rootDir, path);
  const within = relative(rootDir, absolute);
  if (within === "" || within.startsWith("..") || within.includes(`..${sep}`)) {
    throw new Error(`path escapes repository root: ${path}`);
  }
  return absolute;
}

export function sourceRevision(rootDir, sourcePaths) {
  const hash = createHash("sha256");
  for (const sourcePath of sourcePaths) {
    const absolute = assertRepositoryRelativePath(rootDir, sourcePath);
    hash.update(Buffer.from(sourcePath));
    hash.update(Buffer.from([0]));
    hash.update(readFileSync(absolute));
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}

export async function stageAndPublishGameDataEdit({
  rootDir = MODULE_ROOT,
  dataset,
  operations,
  sourcePaths,
  expectedSourceRevision,
  stagedFiles = {},
} = {}) {
  rootDir = resolve(rootDir);
  const release = acquireLock(rootDir);
  let stageRoot;
  try {
    recoverGameDataPublication({ rootDir });
    const currentRevision = sourceRevision(rootDir, sourcePaths);
    if (
      expectedSourceRevision !== undefined &&
      expectedSourceRevision !== currentRevision
    ) {
      const error = new Error("STALE_SOURCE: canonical RON changed after the editor loaded it");
      error.code = "STALE_SOURCE";
      error.statusCode = 409;
      error.currentSourceRevision = currentRevision;
      throw error;
    }
    const manifest = listGameData({ rootDir });
    stageRoot = stageRootFor(rootDir);
    prepareValidationRoot(rootDir, stageRoot);
    for (const [relativePath, contents] of Object.entries(stagedFiles)) {
      const destination = assertRepositoryRelativePath(stageRoot, relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, contents);
    }
    const edit = runCompiler(
      rootDir,
      ["stage-edit", "--staging-root", stageRoot],
      {
        dataRoot: rootDir,
        input: JSON.stringify({ dataset, operations }),
      },
    );
    const stagedSidecarChanged = Object.keys(stagedFiles).some((relativePath) => {
      const staged = assertRepositoryRelativePath(stageRoot, relativePath);
      const visible = assertRepositoryRelativePath(rootDir, relativePath);
      return !existsSync(visible) || sha256(readFileSync(staged)) !== sha256(readFileSync(visible));
    });
    if (!edit.changed && !stagedSidecarChanged) {
      return {
        ok: true,
        changed: [],
        sourceRevision: currentRevision,
      };
    }
    const compileReport = runCompiler(
      rootDir,
      ["compile", "--staging-root", stageRoot],
      { dataRoot: stageRoot },
    );
    validateTomlDocuments(manifest, stageRoot);
    validateWithTypeScript(rootDir, stageRoot);
    const publication = publish(rootDir, stageRoot, manifest, {
      canonicalPaths: sourcePaths,
      lockHeld: true,
    });
    return {
      ok: true,
      changed: publication.changed,
      sourceRevision: sourceRevision(rootDir, sourcePaths),
      compile: compileReport,
    };
  } finally {
    if (stageRoot !== undefined) {
      rmSync(stageRoot, { recursive: true, force: true });
    }
    release();
  }
}

export async function stageAndPublishCompatibilityEdit({
  rootDir = MODULE_ROOT,
  datasets,
  sourcePaths,
  expectedSourceRevision,
  mutateStage,
} = {}) {
  rootDir = resolve(rootDir);
  const release = acquireLock(rootDir);
  let stageRoot;
  try {
    recoverGameDataPublication({ rootDir });
    const currentRevision = sourceRevision(rootDir, sourcePaths);
    if (expectedSourceRevision !== currentRevision) {
      const error = new Error("STALE_SOURCE: canonical RON changed after the editor loaded it");
      error.code = "STALE_SOURCE";
      error.statusCode = 409;
      error.currentSourceRevision = currentRevision;
      throw error;
    }
    const manifest = listGameData({ rootDir });
    stageRoot = stageRootFor(rootDir);
    prepareValidationRoot(rootDir, stageRoot);
    const mutation = await mutateStage(stageRoot);
    let changed = false;
    for (const datasetId of datasets) {
      const dataset = manifest.datasets.find((entry) => entry.id === datasetId);
      if (dataset === undefined) throw new Error(`unknown game-data dataset id: ${datasetId}`);
      const output = readFileSync(join(stageRoot, dataset.output));
      const edit = runCompiler(rootDir, ["stage-edit", "--staging-root", stageRoot], {
        dataRoot: rootDir,
        input: JSON.stringify({
          dataset: datasetId,
          operations: [{
            operation: "adopt_staged_compatibility",
            output_sha256: sha256(output),
          }],
        }),
      });
      changed ||= edit.changed;
    }
    const sidecarChanged = sourcePaths.some((relativePath) => {
      const staged = assertRepositoryRelativePath(stageRoot, relativePath);
      const visible = assertRepositoryRelativePath(rootDir, relativePath);
      return existsSync(staged) && (!existsSync(visible) ||
        sha256(readFileSync(staged)) !== sha256(readFileSync(visible)));
    });
    if (!changed && !sidecarChanged) {
      return { ok: true, changed: [], sourceRevision: currentRevision, mutation };
    }
    const compileReport = runCompiler(rootDir, ["compile", "--staging-root", stageRoot], {
      dataRoot: stageRoot,
    });
    validateTomlDocuments(manifest, stageRoot);
    validateWithTypeScript(rootDir, stageRoot);
    const publication = publish(rootDir, stageRoot, manifest, {
      canonicalPaths: sourcePaths,
      lockHeld: true,
    });
    return {
      ok: true,
      changed: publication.changed,
      sourceRevision: sourceRevision(rootDir, sourcePaths),
      compile: compileReport,
      mutation,
    };
  } finally {
    if (stageRoot !== undefined) rmSync(stageRoot, { recursive: true, force: true });
    release();
  }
}

export const gameDataPipelineInternals = { publish };

async function main() {
  const command = process.argv[2] ?? "compile";
  const rootFlag = process.argv.indexOf("--root");
  const rootDir = rootFlag === -1 ? process.cwd() : resolve(process.argv[rootFlag + 1]);
  if (command === "list") {
    console.log(JSON.stringify(listGameData({ rootDir }), null, 2));
    return;
  }
  if (command === "check") {
    const result = await checkGameData({ rootDir });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === "compile") {
    const result = await ensureGameData({ rootDir });
    console.log(JSON.stringify({
      ok: result.ok,
      datasets: result.compile.datasets.length,
      changed: result.publication.changed,
    }, null, 2));
    return;
  }
  throw new Error("Usage: node scripts/game-data-pipeline.mjs <compile|check|list> [--root PATH]");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
