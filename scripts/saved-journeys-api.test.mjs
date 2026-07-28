// @vitest-environment node

import { createServer } from "node:http";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSavedJourneysApiMiddleware } from "./saved-journeys-api.mjs";

const servers = [];
const tempDirs = [];

afterEach(() => {
  while (servers.length > 0) {
    servers.pop().close();
  }
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function makeRoot() {
  const dir = mkdtempSync(join(tmpdir(), "saved-journeys-test-"));
  tempDirs.push(dir);
  return dir;
}

async function startApi(rootDir) {
  const middleware = createSavedJourneysApiMiddleware({ rootDir });
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
  return { response, body: await response.json() };
}

function journeyStateFixture(screenType = "dreamscape") {
  return { screen: { type: screenType }, dreamAvatar: { id: "dc-1" }, essence: 5 };
}

describe("saved-journeys api middleware", () => {
  it("passes unrelated paths to next", async () => {
    const origin = await startApi(makeRoot());
    const { response, body } = await requestJson(origin, "/api/other");
    expect(response.status).toBe(418);
    expect(body).toEqual({ next: true });
  });

  it("returns an empty list before anything is saved", async () => {
    const origin = await startApi(makeRoot());
    const { response, body } = await requestJson(origin, "/api/saved-journeys");
    expect(response.status).toBe(200);
    expect(body.saves).toEqual([]);
  });

  it("saves, lists, and loads a named journey", async () => {
    const origin = await startApi(makeRoot());

    const save = await requestJson(origin, "/api/saved-journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "warriors draft",
        journeyState: journeyStateFixture("site"),
      }),
    });
    expect(save.response.status).toBe(200);
    expect(save.body.saved.name).toBe("warriors draft");
    expect(save.body.saved.screenType).toBe("site");

    const list = await requestJson(origin, "/api/saved-journeys");
    expect(list.body.saves).toHaveLength(1);
    expect(list.body.saves[0].name).toBe("warriors draft");

    const loaded = await requestJson(
      origin,
      `/api/saved-journeys/${encodeURIComponent("warriors draft")}`,
    );
    expect(loaded.response.status).toBe(200);
    expect(loaded.body.journeyState.screen.type).toBe("site");
    expect(loaded.body.journeyState.essence).toBe(5);
  });

  it("trims the name and overwrites an existing save of the same name", async () => {
    const root = makeRoot();
    const origin = await startApi(root);

    await requestJson(origin, "/api/saved-journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "  run  ", journeyState: journeyStateFixture("atlas") }),
    });
    await requestJson(origin, "/api/saved-journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "run", journeyState: journeyStateFixture("site") }),
    });

    const list = await requestJson(origin, "/api/saved-journeys");
    expect(list.body.saves).toHaveLength(1);
    expect(list.body.saves[0].name).toBe("run");
    expect(list.body.saves[0].screenType).toBe("site");
    expect(readdirSync(join(root, "saved-journeys"))).toHaveLength(1);
  });

  it("rejects a blank name", async () => {
    const origin = await startApi(makeRoot());
    const { response, body } = await requestJson(origin, "/api/saved-journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   ", journeyState: journeyStateFixture() }),
    });
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_NAME");
  });

  it("rejects a missing journeyState", async () => {
    const origin = await startApi(makeRoot());
    const { response, body } = await requestJson(origin, "/api/saved-journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "no state" }),
    });
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_STATE");
  });

  it("returns 404 for an unknown name", async () => {
    const origin = await startApi(makeRoot());
    const { response, body } = await requestJson(
      origin,
      "/api/saved-journeys/missing",
    );
    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("deletes a saved journey", async () => {
    const origin = await startApi(makeRoot());
    await requestJson(origin, "/api/saved-journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "doomed", journeyState: journeyStateFixture() }),
    });

    const del = await requestJson(
      origin,
      `/api/saved-journeys/${encodeURIComponent("doomed")}`,
      { method: "DELETE" },
    );
    expect(del.response.status).toBe(200);
    expect(del.body.ok).toBe(true);

    const list = await requestJson(origin, "/api/saved-journeys");
    expect(list.body.saves).toEqual([]);
  });

  it("keeps two names that slugify the same in separate files", async () => {
    const root = makeRoot();
    const origin = await startApi(root);
    await requestJson(origin, "/api/saved-journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Run!", journeyState: journeyStateFixture("atlas") }),
    });
    await requestJson(origin, "/api/saved-journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "my run", journeyState: journeyStateFixture("site") }),
    });

    const list = await requestJson(origin, "/api/saved-journeys");
    expect(list.body.saves).toHaveLength(2);
    expect(readdirSync(join(root, "saved-journeys"))).toHaveLength(2);
  });
});
