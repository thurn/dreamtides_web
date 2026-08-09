// @vitest-environment node

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
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
  const middleware = createExplorationEditorApiMiddleware({ rootDir: process.cwd() });

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

  it("loads action-local presentation and the typed editor schema", async () => {
    const result = await call("GET", "/api/editor/exploration");
    expect(result.status).toBe(200);
    expect(result.body.encounters.length).toBeGreaterThan(0);
    expect(result.body.effectSchemas).toHaveLength(34);
    expect(result.body).not.toHaveProperty("templates");
    expect(result.body.sourceRevision).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("rejects removed template routes and malformed mutations", async () => {
    const loaded = await call("GET", "/api/editor/exploration");
    const cardId = loaded.body.encounters[0].cardId;
    expect(await call("POST", "/api/editor/exploration")).toMatchObject({
      status: 405,
      body: { error: { code: "METHOD_NOT_ALLOWED" } },
    });
    expect(await call("PATCH", "/api/editor/exploration/templates/1", {}))
      .toMatchObject({ status: 404, body: { error: { code: "INVALID_API_PATH" } } });
    expect(await call("PATCH", "/api/editor/exploration/encounters/not-a-uuid", {}))
      .toMatchObject({ status: 400, body: { error: { code: "INVALID_EDIT" } } });
    expect(await call("PATCH", `/api/editor/exploration/encounters/${cardId}/actions/9`, {}))
      .toMatchObject({ status: 400, body: { error: { code: "INVALID_EDIT" } } });
  });

  it("rejects unknown action references before staging an edit", async () => {
    const loaded = await call("GET", "/api/editor/exploration");
    const encounter = loaded.body.encounters[0];
    const action = {
      ...encounter.actions[0],
      effectKind: "gain-card",
      cardId: "00000000-0000-4000-8000-000000000099",
    };
    const result = await call(
      "PATCH",
      `/api/editor/exploration/encounters/${encounter.cardId}/actions/0`,
      { action, expectedSourceRevision: loaded.body.sourceRevision },
    );

    expect(result).toMatchObject({
      status: 400,
      body: { error: { code: "INVALID_REFERENCE" } },
    });
  });
});
