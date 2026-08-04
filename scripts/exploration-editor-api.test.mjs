// @vitest-environment node

import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExplorationEditorApiMiddleware } from "./exploration-editor-api.mjs";

function request(method, url, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  queueMicrotask(() => {
    if (body !== undefined) req.emit("data", JSON.stringify(body));
    req.emit("end");
  });
  return req;
}

function response() {
  return {
    status: 0,
    body: "",
    writeHead(status) { this.status = status; },
    end(body = "") { this.body = body; },
  };
}

describe("exploration editor API", () => {
  let rootDir;
  let middleware;
  let onChanged;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(join(tmpdir(), "exploration-editor-api-"));
    fs.mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
    fs.mkdirSync(join(rootDir, "public"), { recursive: true });
    for (const relative of [
      "data/tabula/exploration.toml",
      "data/tabula/cards.toml",
      "data/tabula/dreamsigns.toml",
      "data/templates.json",
      "public/exploration-data.json",
    ]) fs.copyFileSync(relative, join(rootDir, relative));
    onChanged = vi.fn();
    middleware = createExplorationEditorApiMiddleware({ rootDir, onChanged });
  });

  afterEach(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  async function call(method, url, body) {
    const res = response();
    const next = vi.fn();
    await middleware(request(method, url, body), res, next);
    return {
      status: res.status,
      body: res.body === "" ? null : JSON.parse(res.body),
      next,
    };
  }

  it("loads the authored encounters and schema", async () => {
    const result = await call("GET", "/api/editor/exploration");
    expect(result.status).toBe(200);
    expect(result.body.encounters).toHaveLength(14);
    expect(result.body.effectDefinitions).toHaveLength(22);
  });

  it("persists prose and echoes the client revision", async () => {
    const loaded = await call("GET", "/api/editor/exploration");
    const cardId = loaded.body.encounters[0].cardId;
    const result = await call("PATCH", `/api/editor/exploration/encounters/${cardId}`, {
      value: "A revised exploration scene.",
      clientRevision: 7,
    });
    expect(result).toMatchObject({ status: 200, body: { clientRevision: 7 } });
    expect(result.body.data.encounters[0].prose).toBe("A revised exploration scene.");
    expect(onChanged).toHaveBeenCalledWith({ kind: "prose", cardId });
  });

  it("rejects malformed routes, unsupported methods, and invalid slots", async () => {
    const loaded = await call("GET", "/api/editor/exploration");
    const cardId = loaded.body.encounters[0].cardId;
    expect(await call("POST", "/api/editor/exploration")).toMatchObject({
      status: 405,
      body: { error: { code: "METHOD_NOT_ALLOWED" } },
    });
    expect(await call("PATCH", "/api/editor/exploration/encounters/not-a-uuid", {}))
      .toMatchObject({ status: 400, body: { error: { code: "INVALID_CARD_ID" } } });
    expect(await call("PATCH", `/api/editor/exploration/encounters/${cardId}/actions/9`, {}))
      .toMatchObject({ status: 400, body: { error: { code: "INVALID_ACTION_SLOT" } } });
    expect(await call("GET", "/api/editor/exploration/nope"))
      .toMatchObject({ status: 404, body: { error: { code: "INVALID_API_PATH" } } });
  });
});
