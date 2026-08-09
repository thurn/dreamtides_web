// @vitest-environment node

import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TIDES_EDITOR_SOURCE_PATHS,
  createTidesEditorApiMiddleware,
} from "./tides-editor-api.mjs";

const TIDE_ID = "00000000-0000-4000-8000-000000000001";
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "tides-editor-api-"));
  roots.push(rootDir);
  mkdirSync(join(rootDir, "data"));
  writeFileSync(join(rootDir, "data", "tides.ron"), "canonical source\n");
  const artifact = {
    version: 1,
    tides: [
      {
        id: TIDE_ID,
        displayName: "Fixture",
        displayDescription: "Description",
        color: "purple",
        role: "signature",
        cards: [{ id: "00000000-0000-4000-8000-000000000011", copies: 2 }],
      },
    ],
    tidePoolByDreamAvatar: {},
  };
  return { rootDir, artifact };
}

function request(method, url, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.setEncoding = vi.fn();
  queueMicrotask(() => {
    if (body !== undefined) req.emit("data", JSON.stringify(body));
    req.emit("end");
  });
  return req;
}

function response() {
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    done,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(text) {
      this.body = JSON.parse(text);
      finish(this);
    },
  };
}

async function invoke(middleware, method, url, body) {
  const res = response();
  await middleware(request(method, url, body), res, vi.fn());
  return res.done;
}

describe("canonical tides editor API", () => {
  it("loads a source revision and publishes stable-ID semantic operations", async () => {
    const { rootDir, artifact } = fixture();
    const publishEdit = vi.fn(async ({ operations }) => {
      artifact.tides[0].displayName = operations[0].value;
      return { sourceRevision: "revision-2" };
    });
    const middleware = createTidesEditorApiMiddleware({
      rootDir,
      publishEdit,
      revision: () => "revision-1",
      loadArtifact: () => artifact,
    });

    const loaded = await invoke(middleware, "GET", "/api/editor/tide-decks?file=tides");
    expect(loaded.body.sourceRevision).toBe("revision-1");

    const saved = await invoke(
      middleware,
      "PATCH",
      `/api/editor/tide-decks/${TIDE_ID}?file=tides`,
      {
        id: TIDE_ID,
        field: "displayName",
        value: "Edited",
        expectedSourceRevision: "revision-1",
      },
    );
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      tide: { id: TIDE_ID, displayName: "Edited" },
      sourceRevision: "revision-2",
    });
    expect(publishEdit).toHaveBeenCalledWith({
      rootDir,
      dataset: "tides",
      operations: [
        {
          operation: "set_tide_field",
          tide_id: TIDE_ID,
          field: "displayName",
          value: "Edited",
        },
      ],
      sourcePaths: TIDES_EDITOR_SOURCE_PATHS,
      expectedSourceRevision: "revision-1",
    });
  });

  it("returns the confirmed catalog after a stale revision without changing source", async () => {
    const { rootDir, artifact } = fixture();
    const before = readFileSync(join(rootDir, "data", "tides.ron"), "utf8");
    const failure = Object.assign(new Error("STALE_SOURCE: fixture"), {
      code: "STALE_SOURCE",
      currentSourceRevision: "revision-current",
    });
    const middleware = createTidesEditorApiMiddleware({
      rootDir,
      publishEdit: vi.fn().mockRejectedValue(failure),
      revision: () => "revision-current",
      loadArtifact: () => artifact,
    });
    const result = await invoke(
      middleware,
      "PATCH",
      `/api/editor/tide-decks/${TIDE_ID}`,
      {
        id: TIDE_ID,
        field: "color",
        value: "blue",
        expectedSourceRevision: "revision-old",
      },
    );
    expect(result.status).toBe(409);
    expect(result.body.error.details.confirmed).toMatchObject({
      sourceRevision: "revision-current",
    });
    expect(readFileSync(join(rootDir, "data", "tides.ron"), "utf8")).toBe(before);
  });

  it("rejects requests without a source revision before publication", async () => {
    const { rootDir, artifact } = fixture();
    const publishEdit = vi.fn();
    const middleware = createTidesEditorApiMiddleware({
      rootDir,
      publishEdit,
      loadArtifact: () => artifact,
    });
    const result = await invoke(
      middleware,
      "PATCH",
      `/api/editor/tide-decks/${TIDE_ID}`,
      { id: TIDE_ID, field: "color", value: "blue" },
    );
    expect(result.status).toBe(400);
    expect(publishEdit).not.toHaveBeenCalled();
  });
});
