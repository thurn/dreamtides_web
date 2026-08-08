// @vitest-environment node

import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createDreamsignEditorApiMiddleware } from "./dreamsign-editor-api.mjs";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const servers = [];

function record(id, name, tags = []) {
  return {
    id,
    name,
    imageName: `${id}.png`,
    imageAlt: `${name} Dreamsign artwork`,
    "rendered-text": "An effect.",
    tags,
    sourceIndex: id === FIRST_ID ? 0 : 1,
    source: {},
  };
}

async function startApi(options) {
  const middleware = createDreamsignEditorApiMiddleware({ rootDir: "/fixture", ...options });
  const server = createServer((req, res) => middleware(req, res, () => {
    res.writeHead(418, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ next: true }));
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  return `http://${address.address}:${address.port}`;
}

async function requestJson(origin, path, init) {
  const response = await fetch(`${origin}${path}`, init);
  return { response, body: await response.json() };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("createDreamsignEditorApiMiddleware", () => {
  it("publishes a closed canonical field operation with the loaded revision", async () => {
    let dreamsigns = [record(FIRST_ID, "Golden Acorn"), record(SECOND_ID, "Pyramid Relic", ["engine"])];
    const calls = [];
    const origin = await startApi({
      revision: () => "revision-1",
      load: () => ({ dreamsigns, tags: [{ name: "engine", color: "#15803d" }] }),
      publishEdit: async (request) => {
        calls.push(request);
        dreamsigns = dreamsigns.map((entry) => entry.id === FIRST_ID
          ? { ...entry, "rendered-text": "Updated effect." }
          : entry);
        return { sourceRevision: "revision-2" };
      },
    });

    const load = await requestJson(origin, "/api/editor/dreamsigns");
    expect(load.body.sourceRevision).toBe("revision-1");
    const save = await requestJson(origin, `/api/editor/dreamsigns/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        field: "rendered-text",
        value: "Updated effect.",
        expectedSourceRevision: "revision-1",
        clientRevision: 3,
      }),
    });

    expect(save.response.status).toBe(200);
    expect(save.body).toMatchObject({
      clientRevision: 3,
      sourceRevision: "revision-2",
      dreamsign: { id: FIRST_ID, "rendered-text": "Updated effect." },
    });
    expect(calls[0]).toMatchObject({
      dataset: "dreamsigns",
      expectedSourceRevision: "revision-1",
      operations: [{
        operation: "set_dreamsign_field",
        dreamsign_id: FIRST_ID,
        field: "rendered-text",
        value: "Updated effect.",
      }],
    });
  });

  it("publishes tag registry replacement and leaves cascade ownership to the typed editor", async () => {
    const calls = [];
    const origin = await startApi({
      revision: () => "revision-1",
      load: () => ({
        dreamsigns: [record(FIRST_ID, "Golden Acorn")],
        tags: [{ name: "economy", color: "#1d4ed8" }],
      }),
      publishEdit: async (request) => { calls.push(request); return { sourceRevision: "revision-2" }; },
    });
    const save = await requestJson(origin, "/api/editor/dreamsign-tags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tags: [{ name: "economy", color: "#1d4ed8" }],
        expectedSourceRevision: "revision-1",
      }),
    });
    expect(save.response.status).toBe(200);
    expect(calls[0].operations).toEqual([{
      operation: "replace_dreamsign_tags",
      tags: [{ name: "economy", color: "#1d4ed8" }],
    }]);
  });

  it("returns confirmed canonical state for stale revisions", async () => {
    const stale = Object.assign(new Error("STALE_SOURCE: changed"), {
      code: "STALE_SOURCE",
      currentSourceRevision: "revision-2",
    });
    const origin = await startApi({
      revision: () => "revision-2",
      load: () => ({ dreamsigns: [record(FIRST_ID, "Confirmed")], tags: [] }),
      publishEdit: async () => { throw stale; },
    });
    const save = await requestJson(origin, `/api/editor/dreamsigns/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: FIRST_ID, field: "name", value: "Stale", expectedSourceRevision: "revision-1" }),
    });
    expect(save.response.status).toBe(409);
    expect(save.body.error).toMatchObject({
      code: "STALE_SOURCE",
      details: {
        currentSourceRevision: "revision-2",
        confirmed: { dreamsigns: [{ name: "Confirmed" }], sourceRevision: "revision-2" },
      },
    });
  });

  it("surfaces failed publication without claiming a save", async () => {
    const failure = Object.assign(new Error("PUBLICATION_FAILED: rolled back"), { code: "PUBLICATION_FAILED" });
    const origin = await startApi({
      revision: () => "revision-1",
      load: () => ({ dreamsigns: [record(FIRST_ID, "Golden Acorn")], tags: [] }),
      publishEdit: async () => { throw failure; },
    });
    const save = await requestJson(origin, `/api/editor/dreamsigns/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: FIRST_ID, field: "name", value: "Edited", expectedSourceRevision: "revision-1" }),
    });
    expect(save.response.status).toBe(500);
    expect(save.body.error.code).toBe("PUBLICATION_FAILED");
  });
});
