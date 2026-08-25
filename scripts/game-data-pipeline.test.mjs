// @vitest-environment node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { once } from "node:events";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import {
  gameDataPipelineInternals,
  recoverGameDataPublication,
  sourceRevision,
  stageAndPublishGameDataEdit,
} from "./game-data-pipeline.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "game-data-pipeline-"));
  const stage = mkdtempSync(join(tmpdir(), "game-data-stage-"));
  roots.push(root, stage);
  const output = "data/fixture.toml";
  mkdirSync(dirname(join(root, output)), { recursive: true });
  mkdirSync(dirname(join(stage, output)), { recursive: true });
  return { root, stage, output, manifest: { datasets: [{ output }] } };
}

describe("game-data publication", () => {
  it("rejects unknown staged-edit validation modes", async () => {
    await expect(
      stageAndPublishGameDataEdit({ validationMode: "fast-ish" }),
    ).rejects.toThrow("unknown game-data validation mode");
  });

  it("requires a dataset for compiled-dataset validation", async () => {
    await expect(
      stageAndPublishGameDataEdit({ validationMode: "compiled-dataset" }),
    ).rejects.toThrow("compiled-dataset validation requires a dataset");
  });

  it("explains the Rust prerequisite when Cargo is unavailable", () => {
    const { root } = fixture();
    const originalPath = process.env.PATH;
    process.env.PATH = root;
    try {
      expect(() => gameDataPipelineInternals.ensureCompiler(root)).toThrow(
        "Cargo is required to compile the canonical RON game data. Install a Rust toolchain",
      );
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("applies the repository RON formatter to staged editor sources", () => {
    const { root, stage } = fixture();
    writeFileSync(join(root, ".ronfmt.json"), JSON.stringify({ indentWidth: 2, printWidth: 120 }));
    writeFileSync(
      join(stage, "data", "cards.ron"),
      "// preserved\n[CardDefinition(name:\"Fixture\",id:\"00000000-0000-4000-8000-000000000001\",)]\n",
    );

    gameDataPipelineInternals.formatStagedRonSources(root, stage, ["data/cards.ron"]);

    expect(readFileSync(join(stage, "data", "cards.ron"), "utf8")).toBe(
      `// preserved

[CardDefinition(name: "Fixture", id: "00000000-0000-4000-8000-000000000001")]
`,
    );
  });

  it("publishes changed bytes and suppresses semantic no-op writes", () => {
    const { root, stage, output, manifest } = fixture();
    writeFileSync(join(root, output), "old\n");
    writeFileSync(join(stage, output), "new\n");
    expect(gameDataPipelineInternals.publish(root, stage, manifest)).toEqual({ changed: [output] });
    expect(readFileSync(join(root, output), "utf8")).toBe("new\n");
    expect(gameDataPipelineInternals.publish(root, stage, manifest)).toEqual({ changed: [] });
  });

  it("recovers an interrupted multi-file publication journal", () => {
    const { root, output } = fixture();
    const transactionRoot = ".game-data-transactions/interrupted";
    const backup = `${transactionRoot}/backups/${output}`;
    mkdirSync(dirname(join(root, backup)), { recursive: true });
    writeFileSync(join(root, output), "partially published\n");
    writeFileSync(join(root, backup), "confirmed\n");
    writeFileSync(join(root, ".game-data-transaction.json"), `${JSON.stringify({
      id: "interrupted",
      state: "publishing",
      transactionRoot,
      entries: [{ destination: output, backup, hadDestination: true, published: true }],
    })}\n`);
    expect(recoverGameDataPublication({ rootDir: root })).toMatchObject({
      recovered: true,
      state: "publishing",
    });
    expect(readFileSync(join(root, output), "utf8")).toBe("confirmed\n");
    expect(existsSync(join(root, ".game-data-transaction.json"))).toBe(false);
  });

  it("waits for the publication lock before recovering a journal", async () => {
    const { root, output } = fixture();
    const transactionRoot = ".game-data-transactions/active";
    const backup = `${transactionRoot}/backups/${output}`;
    mkdirSync(dirname(join(root, backup)), { recursive: true });
    writeFileSync(join(root, output), "partially published\n");
    writeFileSync(join(root, backup), "confirmed\n");
    writeFileSync(join(root, ".game-data-transaction.json"), `${JSON.stringify({
      id: "active",
      state: "publishing",
      transactionRoot,
      entries: [{ destination: output, backup, hadDestination: true, published: true }],
    })}\n`);
    writeFileSync(join(root, ".game-data.lock"), JSON.stringify({
      pid: process.pid,
      token: "active-publisher",
      startedAt: new Date().toISOString(),
    }));

    const worker = new Worker(`
      const { parentPort, workerData } = require("node:worker_threads");
      (async () => {
        const pipeline = await import(workerData.moduleUrl);
        parentPort.postMessage({ kind: "started" });
        const result = pipeline.recoverGameDataPublication({ rootDir: workerData.root });
        parentPort.postMessage({ kind: "done", result });
      })().catch((error) => parentPort.postMessage({ kind: "error", message: error.message }));
    `, {
      eval: true,
      workerData: {
        moduleUrl: new URL("./game-data-pipeline.mjs", import.meta.url).href,
        root,
      },
    });
    const [started] = await once(worker, "message");
    expect(started).toEqual({ kind: "started" });
    expect(readFileSync(join(root, output), "utf8")).toBe("partially published\n");
    expect(existsSync(join(root, ".game-data-transaction.json"))).toBe(true);

    const completed = once(worker, "message");
    rmSync(join(root, ".game-data.lock"), { force: true });
    const [done] = await completed;
    expect(done).toMatchObject({
      kind: "done",
      result: { recovered: true, state: "publishing" },
    });
    expect(readFileSync(join(root, output), "utf8")).toBe("confirmed\n");
    expect(existsSync(join(root, ".game-data-transaction.json"))).toBe(false);
    expect(existsSync(join(root, ".game-data.lock"))).toBe(false);
    await worker.terminate();
  });

  it("hashes source paths and ordered source bytes and rejects traversal", () => {
    const { root } = fixture();
    mkdirSync(join(root, "data"), { recursive: true });
    writeFileSync(join(root, "data", "a.ron"), "a");
    writeFileSync(join(root, "data", "b.ron"), "b");
    const first = sourceRevision(root, ["data/a.ron", "data/b.ron"]);
    expect(sourceRevision(root, ["data/b.ron", "data/a.ron"])).not.toBe(first);
    writeFileSync(join(root, "data", "b.ron"), "changed");
    expect(sourceRevision(root, ["data/a.ron", "data/b.ron"])).not.toBe(first);
    expect(() => sourceRevision(root, ["../escape.ron"])).toThrow(/escapes repository root/u);
  });
});
