// @vitest-environment node

import { createServer } from "node:http";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSavedQuestsApiMiddleware } from "./saved-quests-api.mjs";

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
  const dir = mkdtempSync(join(tmpdir(), "saved-quests-test-"));
  tempDirs.push(dir);
  return dir;
}

async function startApi(rootDir) {
  const middleware = createSavedQuestsApiMiddleware({ rootDir });
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

function questStateFixture(screenType = "dreamscape") {
  return { screen: { type: screenType }, dreamcaller: { id: "dc-1" }, essence: 5 };
}

describe("saved-quests api middleware", () => {
  it("passes unrelated paths to next", async () => {
    const origin = await startApi(makeRoot());
    const { response, body } = await requestJson(origin, "/api/other");
    expect(response.status).toBe(418);
    expect(body).toEqual({ next: true });
  });

  it("returns an empty list before anything is saved", async () => {
    const origin = await startApi(makeRoot());
    const { response, body } = await requestJson(origin, "/api/saved-quests");
    expect(response.status).toBe(200);
    expect(body.saves).toEqual([]);
  });

  it("saves, lists, and loads a named quest", async () => {
    const origin = await startApi(makeRoot());

    const save = await requestJson(origin, "/api/saved-quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "warriors draft",
        questState: questStateFixture("site"),
      }),
    });
    expect(save.response.status).toBe(200);
    expect(save.body.saved.name).toBe("warriors draft");
    expect(save.body.saved.screenType).toBe("site");

    const list = await requestJson(origin, "/api/saved-quests");
    expect(list.body.saves).toHaveLength(1);
    expect(list.body.saves[0].name).toBe("warriors draft");

    const loaded = await requestJson(
      origin,
      `/api/saved-quests/${encodeURIComponent("warriors draft")}`,
    );
    expect(loaded.response.status).toBe(200);
    expect(loaded.body.questState.screen.type).toBe("site");
    expect(loaded.body.questState.essence).toBe(5);
  });

  it("trims the name and overwrites an existing save of the same name", async () => {
    const root = makeRoot();
    const origin = await startApi(root);

    await requestJson(origin, "/api/saved-quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "  run  ", questState: questStateFixture("atlas") }),
    });
    await requestJson(origin, "/api/saved-quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "run", questState: questStateFixture("site") }),
    });

    const list = await requestJson(origin, "/api/saved-quests");
    expect(list.body.saves).toHaveLength(1);
    expect(list.body.saves[0].name).toBe("run");
    expect(list.body.saves[0].screenType).toBe("site");
    expect(readdirSync(join(root, "saved-quests"))).toHaveLength(1);
  });

  it("rejects a blank name", async () => {
    const origin = await startApi(makeRoot());
    const { response, body } = await requestJson(origin, "/api/saved-quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   ", questState: questStateFixture() }),
    });
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_NAME");
  });

  it("rejects a missing questState", async () => {
    const origin = await startApi(makeRoot());
    const { response, body } = await requestJson(origin, "/api/saved-quests", {
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
      "/api/saved-quests/missing",
    );
    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("deletes a saved quest", async () => {
    const origin = await startApi(makeRoot());
    await requestJson(origin, "/api/saved-quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "doomed", questState: questStateFixture() }),
    });

    const del = await requestJson(
      origin,
      `/api/saved-quests/${encodeURIComponent("doomed")}`,
      { method: "DELETE" },
    );
    expect(del.response.status).toBe(200);
    expect(del.body.ok).toBe(true);

    const list = await requestJson(origin, "/api/saved-quests");
    expect(list.body.saves).toEqual([]);
  });

  it("keeps two names that slugify the same in separate files", async () => {
    const root = makeRoot();
    const origin = await startApi(root);
    await requestJson(origin, "/api/saved-quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Run!", questState: questStateFixture("atlas") }),
    });
    await requestJson(origin, "/api/saved-quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "my run", questState: questStateFixture("site") }),
    });

    const list = await requestJson(origin, "/api/saved-quests");
    expect(list.body.saves).toHaveLength(2);
    expect(readdirSync(join(root, "saved-quests"))).toHaveLength(2);
  });
});
