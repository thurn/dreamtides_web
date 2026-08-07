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
import { afterEach, describe, expect, it } from "vitest";
import {
  gameDataPipelineInternals,
  recoverGameDataPublication,
  sourceRevision,
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
