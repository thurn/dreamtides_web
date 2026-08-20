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
  tags: [],
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
        resolve({
          status,
          headers,
          body: text === "" ? null : JSON.parse(text),
        });
      },
    };
    Promise.resolve(
      middleware(req, res, () => resolve({ status: 404, body: null })),
    ).catch(reject);
  });
}

function middleware(overrides = {}) {
  return createFigmentEditorApiMiddleware({
    rootDir: "/fixture",
    revision: () => "revision-1",
    loadData: () => [FIGMENT],
    loadTags: () => [],
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
    expect(response.body).toEqual({
      figments: [FIGMENT],
      tags: [],
      sourceRevision: "revision-1",
    });
  });

  it("loads, assigns, and replaces canonical tags while rejecting unknown names", async () => {
    const tags = [{ name: "Art Owned", color: "#0f766e" }];
    const publishEdit = vi
      .fn()
      .mockResolvedValue({ sourceRevision: "revision-2" });
    const tagged = { ...FIGMENT, tags: ["Art Owned"] };
    const api = middleware({
      loadTags: () => tags,
      loadData: () => [tagged],
      publishEdit,
    });
    const load = await invoke(api, {
      method: "GET",
      url: "/api/editor/figments",
    });
    expect(load.body.tags).toEqual(tags);
    const save = await invoke(api, {
      method: "PATCH",
      url: `/api/editor/figments/${ID}`,
      body: {
        id: ID,
        field: "tags",
        value: ["Art Owned"],
        expectedSourceRevision: "revision-1",
      },
    });
    expect(save.status).toBe(200);
    expect(publishEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operations: [
          {
            operation: "set_figment_field",
            figment_id: ID,
            field: "tags",
            value: ["Art Owned"],
          },
        ],
      }),
    );
    const unknown = await invoke(api, {
      method: "PATCH",
      url: `/api/editor/figments/${ID}`,
      body: {
        id: ID,
        field: "tags",
        value: ["Missing"],
        expectedSourceRevision: "revision-1",
      },
    });
    expect(unknown.status).toBe(400);
    const registry = await invoke(api, {
      method: "PUT",
      url: "/api/editor/figments/tags",
      body: { tags, expectedSourceRevision: "revision-1" },
    });
    expect(registry.status).toBe(200);
    expect(publishEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operations: [{ operation: "replace_figment_tags", tags }],
      }),
    );
  });

  it("publishes a typed UUID-routed field operation and returns confirmation", async () => {
    const publishEdit = vi
      .fn()
      .mockResolvedValue({ sourceRevision: "revision-2" });
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
      operations: [
        {
          operation: "set_figment_field",
          figment_id: ID,
          field: "spark",
          value: 2,
        },
      ],
      sourcePaths: ["data/figments.ron", "data/figments.tags.ron"],
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
    expect(missingRevision.body.error.message).toContain(
      "expectedSourceRevision",
    );

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
    expect(response.body.error.details.currentSourceRevision).toBe(
      "revision-current",
    );
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
