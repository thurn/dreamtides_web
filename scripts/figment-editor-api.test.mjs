import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createFigmentEditorApiMiddleware } from "./figment-editor-api.mjs";

const ID = "00000000-0000-4000-8000-000000000031";
const FIGMENT = {
  id: ID,
  name: "Warrior",
  subtype: "Warrior",
  spark: 1,
  keyword: "",
  "rendered-text": "",
  "image-number": 31,
  art: null,
  sourceIndex: 0,
  source: {},
};

function invoke(middleware, { method, url, body }) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
    req.method = method;
    req.url = url;
    const headers = {};
    let status = 200;
    const res = {
      writeHead(nextStatus, nextHeaders = {}) {
        status = nextStatus;
        Object.assign(headers, nextHeaders);
      },
      end(content = "") {
        const text = String(content);
        resolve({ status, headers, body: text === "" ? null : JSON.parse(text) });
      },
    };
    Promise.resolve(middleware(req, res, () => resolve({ status: 404, body: null })))
      .catch(reject);
  });
}

function middleware(overrides = {}) {
  return createFigmentEditorApiMiddleware({
    rootDir: "/fixture",
    revision: () => "revision-1",
    loadData: () => [FIGMENT],
    publishEdit: async () => ({ sourceRevision: "revision-2" }),
    ...overrides,
  });
}

describe("canonical Figment editor API", () => {
  it("loads generated records with the canonical source revision", async () => {
    const response = await invoke(middleware(), {
      method: "GET",
      url: "/api/editor/figments?source=figments.ron",
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ figments: [FIGMENT], sourceRevision: "revision-1" });
  });

  it("publishes a typed UUID-routed field operation and returns confirmation", async () => {
    const publishEdit = vi.fn().mockResolvedValue({ sourceRevision: "revision-2" });
    const response = await invoke(middleware({ publishEdit }), {
      method: "PATCH",
      url: `/api/editor/figments/${ID}`,
      body: {
        id: ID,
        field: "spark",
        value: 2,
        clientRevision: 7,
        expectedSourceRevision: "revision-1",
      },
    });
    expect(response.status).toBe(200);
    expect(publishEdit).toHaveBeenCalledWith({
      rootDir: "/fixture",
      dataset: "figments",
      operations: [{
        operation: "set_figment_field",
        figment_id: ID,
        field: "spark",
        value: 2,
      }],
      sourcePaths: ["data/figments.ron"],
      expectedSourceRevision: "revision-1",
      prepareDerivedArtifacts: expect.any(Function),
      additionalPublishPaths: ["public/figments-data.json"],
    });
    expect(response.body.sourceRevision).toBe("revision-2");
    expect(response.body.clientRevision).toBe(7);
  });

  it("requires a source revision and preserves validation failures", async () => {
    const missingRevision = await invoke(middleware(), {
      method: "PATCH",
      url: `/api/editor/figments/${ID}`,
      body: { id: ID, field: "spark", value: 2 },
    });
    expect(missingRevision.status).toBe(400);
    expect(missingRevision.body.error.message).toContain("expectedSourceRevision");

    const invalid = await invoke(middleware(), {
      method: "PATCH",
      url: `/api/editor/figments/${ID}`,
      body: {
        id: ID,
        field: "spark",
        value: -1,
        expectedSourceRevision: "revision-1",
      },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID_EDIT");
  });

  it("returns the confirmed catalog after a stale revision", async () => {
    const stale = Object.assign(new Error("stale"), {
      code: "STALE_SOURCE",
      currentSourceRevision: "revision-current",
    });
    const response = await invoke(
      middleware({ publishEdit: vi.fn().mockRejectedValue(stale) }),
      {
        method: "PATCH",
        url: `/api/editor/figments/${ID}`,
        body: {
          id: ID,
          field: "spark",
          value: 2,
          expectedSourceRevision: "revision-old",
        },
      },
    );
    expect(response.status).toBe(409);
    expect(response.body.error.details.currentSourceRevision).toBe("revision-current");
    expect(response.body.error.details.confirmed.figments).toEqual([FIGMENT]);
  });

  it("reports failed publication without returning a false confirmation", async () => {
    const failure = Object.assign(new Error("publication failed"), {
      code: "PUBLICATION_FAILED",
    });
    const response = await invoke(
      middleware({ publishEdit: vi.fn().mockRejectedValue(failure) }),
      {
        method: "PATCH",
        url: `/api/editor/figments/${ID}`,
        body: {
          id: ID,
          field: "spark",
          value: 2,
          expectedSourceRevision: "revision-1",
        },
      },
    );
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("PUBLICATION_FAILED");
    expect(response.body.error.details.confirmed).toBeUndefined();
  });
});
