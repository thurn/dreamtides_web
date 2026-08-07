// @vitest-environment node

import { createServer } from "node:http";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDreamsignEditorApiMiddleware } from "./dreamsign-editor-api.mjs";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

const servers = [];

function fixtureToml() {
  return `[[dreamsign]]
id = "${FIRST_ID}"
name = "Golden Acorn"
image_name = "acorn_gold.png"
rendered-text = "The second discard matters."

[[dreamsign]]
id = "${SECOND_ID}"
name = "Pyramid Relic"
image_name = "artifact.png"
tags = ["engine"]
rendered-text = "Characters cost less."
`;
}

function fixtureTagsToml() {
  return `[[tags]]
name = "engine"
color = "#15803d"

[[tags]]
name = "economy"
color = "#1d4ed8"
`;
}

function writeFixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "journey-dreamsign-editor-api-"));
  mkdirSync(join(rootDir, "data"), { recursive: true });
  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(join(rootDir, "data", "dreamsigns.toml"), fixtureToml());
  writeFileSync(join(rootDir, "data", "dreamsigns.tags.toml"), fixtureTagsToml());
  writeFileSync(join(rootDir, "public", "dreamsign-data.json"), "[]\n");
  return rootDir;
}

async function startApi(rootDir) {
  const middleware = createDreamsignEditorApiMiddleware({ rootDir });
  const server = createServer((req, res) => {
    middleware(req, res, () => {
      res.writeHead(418, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ next: true }));
    });
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  servers.push(server);
  const address = server.address();
  return `http://${address.address}:${address.port}`;
}

async function requestJson(origin, path, init) {
  const response = await fetch(`${origin}${path}`, init);
  return {
    response,
    body: await response.json(),
  };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("createDreamsignEditorApiMiddleware", () => {
  it("loads and patches dreamsign records", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const load = await requestJson(origin, "/api/editor/dreamsigns");
    expect(load.response.status).toBe(200);
    expect(load.body.dreamsigns.map((dreamsign) => dreamsign.id)).toEqual([
      FIRST_ID,
      SECOND_ID,
    ]);

    const save = await requestJson(origin, `/api/editor/dreamsigns/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        field: "rendered-text",
        value: "Updated effect.",
        clientRevision: 3,
      }),
    });

    expect(save.response.status).toBe(200);
    expect(save.body.clientRevision).toBe(3);
    expect(save.body.dreamsign["rendered-text"]).toBe("Updated effect.");
    expect(
      readFileSync(join(rootDir, "data", "dreamsigns.toml"), "utf8"),
    ).toContain('rendered-text = "Updated effect."');
    expect(
      JSON.parse(readFileSync(join(rootDir, "public", "dreamsign-data.json"), "utf8"))[0]
        .effectDescription,
    ).toBe("Updated effect.");

    rmSync(rootDir, { recursive: true, force: true });
  });

  it("rejects tags that are not in the dreamsign tag registry", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const save = await requestJson(origin, `/api/editor/dreamsigns/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        field: "tags",
        value: ["unknown"],
      }),
    });

    expect(save.response.status).toBe(400);
    expect(save.body.error).toMatchObject({
      code: "INVALID_EDIT",
      message: "Unknown tag. Create it in Manage tags first.",
    });

    rmSync(rootDir, { recursive: true, force: true });
  });

  it("saves the tag registry and removes deleted tags from dreamsigns", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const save = await requestJson(origin, "/api/editor/dreamsign-tags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tags: [{ name: "economy", color: "#1d4ed8" }],
      }),
    });

    expect(save.response.status).toBe(200);
    expect(save.body.tags).toEqual([{ name: "economy", color: "#1d4ed8" }]);
    expect(save.body.dreamsigns[1].tags).toEqual([]);
    expect(
      readFileSync(join(rootDir, "data", "dreamsigns.toml"), "utf8"),
    ).toContain("tags = []");

    rmSync(rootDir, { recursive: true, force: true });
  });
});
