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
import { createDreamwellEditorApiMiddleware } from "./dreamwell-editor-api.mjs";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

const servers = [];

function fixtureToml() {
  return `[[dreamwell]]
name = "Dawning Horizon"
id = "${FIRST_ID}"
rendered-text = "(no ability)"
order = 0
energy-added = 2
card-type = "Dreamwell"
image-number = 1963305268
art-owned = true
card-number = 1

[[dreamwell]]
name = "Meteor Meadow"
id = "${SECOND_ID}"
rendered-text = "Draw a card."
order = 2
energy-added = 1
card-type = "Dreamwell"
image-number = 2421338077
art-owned = true
card-number = 2
`;
}

function writeFixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "journey-dreamwell-editor-api-"));
  mkdirSync(join(rootDir, "data"), { recursive: true });
  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(join(rootDir, "data", "dreamwell.toml"), fixtureToml());
  writeFileSync(join(rootDir, "public", "dreamwell-data.json"), "[]\n");
  return rootDir;
}

async function startApi(rootDir) {
  const middleware = createDreamwellEditorApiMiddleware({ rootDir });
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

describe("createDreamwellEditorApiMiddleware", () => {
  it("loads and patches Dreamwell records, regenerating the runtime JSON", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const load = await requestJson(origin, "/api/editor/dreamwell");
    expect(load.response.status).toBe(200);
    expect(load.body.dreamwell.map((record) => record.id)).toEqual([
      FIRST_ID,
      SECOND_ID,
    ]);

    const save = await requestJson(origin, `/api/editor/dreamwell/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        field: "energy-added",
        value: 3,
        clientRevision: 7,
      }),
    });

    expect(save.response.status).toBe(200);
    expect(save.body.clientRevision).toBe(7);
    expect(save.body.dreamwell["energy-added"]).toBe(3);
    expect(
      readFileSync(join(rootDir, "data", "dreamwell.toml"), "utf8"),
    ).toContain("energy-added = 3");
    expect(
      JSON.parse(readFileSync(join(rootDir, "public", "dreamwell-data.json"), "utf8"))[0]
        .energyAdded,
    ).toBe(3);

    rmSync(rootDir, { recursive: true, force: true });
  });

  it("rejects an out-of-range deck order", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const save = await requestJson(origin, `/api/editor/dreamwell/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: FIRST_ID, field: "order", value: 9 }),
    });

    expect(save.response.status).toBe(400);
    expect(save.body.error).toMatchObject({ code: "INVALID_EDIT" });

    rmSync(rootDir, { recursive: true, force: true });
  });

  it("returns 404 for an unknown Dreamwell id", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const missingId = "33333333-3333-4333-8333-333333333333";
    const save = await requestJson(origin, `/api/editor/dreamwell/${missingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: missingId, field: "name", value: "Nope" }),
    });

    expect(save.response.status).toBe(404);
    expect(save.body.error).toMatchObject({ code: "DREAMWELL_NOT_FOUND" });

    rmSync(rootDir, { recursive: true, force: true });
  });
});
