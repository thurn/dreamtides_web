// @vitest-environment node

import { EventEmitter } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_EDITOR_SOURCE_PATHS,
  createAvatarEditorApiMiddleware,
} from "./avatar-editor-api.mjs";

const AVATAR_ID = "00000000-0000-4000-8000-000000000011";
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "avatar-editor-api-"));
  roots.push(rootDir);
  mkdirSync(join(rootDir, "data"), { recursive: true });
  writeFileSync(
    join(rootDir, "data", "avatars.ron"),
    "canonical source\n",
  );
  writeFileSync(join(rootDir, "data", "tides.ron"), "canonical tides source\n");
  const data = {
    avatars: [
      {
        id: AVATAR_ID,
        name: "Fixture Avatar",
        title: "Fixture Title",
        imageNumber: "0007",
        "rendered-text": "Fixture ability.",
        startingEssence: 200,
        tidePool: {
          starter: "signature",
          facets: ["facet"],
          neutral: ["neutral"],
        },
        sourceIndex: 0,
        source: {},
      },
    ],
    tides: [
      {
        id: "signature",
        displayName: "Signature",
        resonance: "shadow",
        role: "signature",
      },
      {
        id: "facet",
        displayName: "Facet",
        resonance: "wild",
        role: "facet",
      },
      {
        id: "facet-2",
        displayName: "Facet 2",
        resonance: "vision",
        role: "facet",
      },
      {
        id: "neutral",
        displayName: "Neutral",
        resonance: "valor",
        role: "neutral",
      },
    ],
  };
  return { rootDir, data };
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

describe("Avatar canonical RON editor API", () => {
  it("loads a revision and submits stable-id semantic field operations", async () => {
    const { rootDir, data } = fixture();
    const publishEdit = vi.fn(async ({ operations }) => {
      data.avatars[0].name = operations[0].value;
      return { sourceRevision: "revision-2" };
    });
    const middleware = createAvatarEditorApiMiddleware({
      rootDir,
      loadData: () => data,
      revision: () => "revision-1",
      publishEdit,
    });

    const loaded = await invoke(middleware, "GET", "/api/editor/avatars");
    expect(loaded.status).toBe(200);
    expect(loaded.body.sourceRevision).toBe("revision-1");

    const saved = await invoke(
      middleware,
      "PATCH",
      `/api/editor/avatars/${AVATAR_ID}`,
      {
        id: AVATAR_ID,
        field: "name",
        value: "  Edited Avatar  ",
        expectedSourceRevision: "revision-1",
        clientRevision: 3,
      },
    );
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      avatar: { id: AVATAR_ID, name: "Edited Avatar" },
      sourceRevision: "revision-2",
      clientRevision: 3,
    });
    expect(publishEdit).toHaveBeenCalledWith({
      rootDir,
      dataset: "avatars",
      operations: [
        {
          operation: "set_avatar_field",
          avatar_id: AVATAR_ID,
          field: "name",
          value: "Edited Avatar",
        },
      ],
      sourcePaths: AVATAR_EDITOR_SOURCE_PATHS,
      expectedSourceRevision: "revision-1",
    });
  });

  it("submits tide-pool semantic operations in the same revisioned transaction", async () => {
    const { rootDir, data } = fixture();
    const publishEdit = vi.fn(async ({ operations }) => {
      expect(operations).toEqual([
        {
          operation: "set_avatar_tide_pool",
          avatar_id: AVATAR_ID,
          starter: "signature",
          facets: ["facet-2"],
          neutral: ["neutral"],
        },
      ]);
      data.avatars[0].tidePool = {
        starter: "signature",
        facets: ["facet-2"],
        neutral: ["neutral"],
      };
      return { sourceRevision: "revision-2" };
    });
    const middleware = createAvatarEditorApiMiddleware({
      rootDir,
      loadData: () => data,
      revision: () => "revision-1",
      publishEdit,
    });

    const saved = await invoke(
      middleware,
      "PATCH",
      `/api/editor/avatars/${AVATAR_ID}`,
      {
        id: AVATAR_ID,
        field: "tide-pool",
        value: {
          starter: "signature",
          facets: ["facet-2"],
          neutral: ["neutral"],
        },
        expectedSourceRevision: "revision-1",
      },
    );
    expect(saved.status).toBe(200);
    expect(publishEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: "avatars",
        operations: [
          {
            operation: "set_avatar_tide_pool",
            avatar_id: AVATAR_ID,
            starter: "signature",
            facets: ["facet-2"],
            neutral: ["neutral"],
          },
        ],
        sourcePaths: AVATAR_EDITOR_SOURCE_PATHS,
        expectedSourceRevision: "revision-1",
      }),
    );
  });

  it("rejects invalid edits before publication", async () => {
    const { rootDir, data } = fixture();
    const publishEdit = vi.fn();
    const middleware = createAvatarEditorApiMiddleware({
      rootDir,
      loadData: () => data,
      revision: () => "revision-1",
      publishEdit,
    });

    const result = await invoke(
      middleware,
      "PATCH",
      `/api/editor/avatars/${AVATAR_ID}`,
      {
        id: AVATAR_ID,
        field: "title",
        value: "   ",
        expectedSourceRevision: "revision-1",
      },
    );
    expect(result.status).toBe(400);
    expect(result.body.error).toMatchObject({ code: "INVALID_EDIT" });
    expect(publishEdit).not.toHaveBeenCalled();
  });

  it.each([
    ["STALE_SOURCE", 409],
    ["PUBLICATION_FAILED", 500],
  ])(
    "keeps both sources unchanged when %s aborts publication",
    async (code, status) => {
      const { rootDir, data } = fixture();
      const sourceBefore = readFileSync(
        join(rootDir, "data", "avatars.ron"),
        "utf8",
      );
      const tidesBefore = readFileSync(
        join(rootDir, "data", "tides.ron"),
        "utf8",
      );
      const failure = Object.assign(new Error(`${code}: fixture failure`), {
        code,
        currentSourceRevision: "revision-current",
      });
      const middleware = createAvatarEditorApiMiddleware({
        rootDir,
        loadData: () => data,
        revision: () => "revision-current",
        publishEdit: vi.fn().mockRejectedValue(failure),
      });

      const result = await invoke(
        middleware,
        "PATCH",
        `/api/editor/avatars/${AVATAR_ID}`,
        {
          id: AVATAR_ID,
          field: "name",
          value: "Edited Avatar",
          expectedSourceRevision: "revision-old",
        },
      );
      expect(result.status).toBe(status);
      expect(result.body.error.code).toBe(code);
      if (code === "STALE_SOURCE") {
        expect(result.body.error.details).toMatchObject({
          currentSourceRevision: "revision-current",
          confirmed: { sourceRevision: "revision-current" },
        });
      }
      expect(
        readFileSync(join(rootDir, "data", "avatars.ron"), "utf8"),
      ).toBe(sourceBefore);
      expect(readFileSync(join(rootDir, "data", "tides.ron"), "utf8")).toBe(
        tidesBefore,
      );
    },
  );
});
