import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTutorialEditorApiMiddleware } from "./tutorial-editor-api.mjs";
import {
  normalizeTutorialConfiguration,
  readTutorialConfiguration,
  serializeTutorialToml,
} from "./tutorial-data.mjs";

const servers = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

async function startApi(rootDir, publishEdit) {
  const middleware = createTutorialEditorApiMiddleware({
    rootDir,
    publishEdit,
  });
  const server = createServer((req, res) => {
    middleware(req, res, () => res.writeHead(404).end());
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

function fixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "tutorial-editor-api-"));
  mkdirSync(join(rootDir, "data"), { recursive: true });
  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(join(rootDir, "data", "tutorial.ron"), "TutorialCatalog()\n");
  writeFileSync(
    join(rootDir, "data", "tutorial.toml"),
    readFileSync(new URL("../data/tutorial.toml", import.meta.url)),
  );
  writeFileSync(
    join(rootDir, "public", "tutorial-data.json"),
    readFileSync(new URL("../public/tutorial-data.json", import.meta.url)),
  );
  return rootDir;
}

function publishFixture(rootDir) {
  return vi.fn(async ({ operations, expectedSourceRevision }) => {
    const configuration = readTutorialConfiguration({ rootDir });
    const actions = operations[0].actions;
    writeFileSync(
      join(rootDir, "data", "tutorial.toml"),
      serializeTutorialToml(
        actions,
        configuration.triggers,
        configuration.battle,
        configuration.journeyStart,
        configuration.dreamscape,
        configuration.atlas,
        configuration.draft,
        configuration.purge,
        configuration.dreamsignRevelation,
        configuration.battleStart,
      ),
    );
    const normalized = normalizeTutorialConfiguration({
      ...configuration,
      actions,
    });
    writeFileSync(
      join(rootDir, "public", "tutorial-data.json"),
      `${JSON.stringify(normalized, null, 2)}\n`,
    );
    return { sourceRevision: expectedSourceRevision };
  });
}

describe("tutorial editor api", () => {
  it("loads generated data with the canonical source revision", async () => {
    const rootDir = fixtureRoot();
    const origin = await startApi(rootDir, publishFixture(rootDir));
    const response = await fetch(`${origin}/api/editor/tutorial`);
    const loaded = await response.json();
    expect(response.status).toBe(200);
    expect(loaded.actions).toHaveLength(27);
    expect(loaded.sourceRevision).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("publishes a closed typed action replacement and confirms generated data", async () => {
    const rootDir = fixtureRoot();
    const publishEdit = publishFixture(rootDir);
    const origin = await startApi(rootDir, publishEdit);
    const loaded = await fetch(`${origin}/api/editor/tutorial`).then(
      (response) => response.json(),
    );
    const actions = loaded.actions.slice(0, 2).reverse();
    const response = await fetch(`${origin}/api/editor/tutorial`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actions,
        expectedSourceRevision: loaded.sourceRevision,
      }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).actions).toEqual(actions);
    expect(publishEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: "tutorial",
        expectedSourceRevision: loaded.sourceRevision,
        operations: [{ operation: "replace_tutorial_actions", actions }],
        sourcePaths: ["data/tutorial.ron"],
      }),
    );
  });

  it("rejects invalid actions without invoking publication", async () => {
    const rootDir = fixtureRoot();
    const publishEdit = publishFixture(rootDir);
    const origin = await startApi(rootDir, publishEdit);
    const loaded = await fetch(`${origin}/api/editor/tutorial`).then(
      (response) => response.json(),
    );
    const response = await fetch(`${origin}/api/editor/tutorial`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedSourceRevision: loaded.sourceRevision,
        actions: [{ id: "bad", action: "display-speech-bubble", wait: 0 }],
      }),
    });
    expect(response.status).toBe(400);
    expect(publishEdit).not.toHaveBeenCalled();
  });

  it("returns the current revision and confirmed collection for a stale save", async () => {
    const rootDir = fixtureRoot();
    const currentSourceRevision = "a".repeat(64);
    const stale = Object.assign(
      new Error("canonical Tutorial source changed"),
      {
        code: "STALE_SOURCE",
        statusCode: 409,
        currentSourceRevision,
      },
    );
    const origin = await startApi(rootDir, vi.fn().mockRejectedValue(stale));
    const loaded = await fetch(`${origin}/api/editor/tutorial`).then(
      (response) => response.json(),
    );
    const response = await fetch(`${origin}/api/editor/tutorial`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actions: loaded.actions,
        expectedSourceRevision: loaded.sourceRevision,
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({
      code: "STALE_SOURCE",
      details: {
        datasetId: "tutorial",
        source: "data/tutorial.ron",
        currentSourceRevision,
        confirmed: { sourceRevision: loaded.sourceRevision },
      },
    });
  });
});
