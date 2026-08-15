// @vitest-environment node

import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DREAMSCAPE_EDITOR_SOURCE_PATHS,
  createDreamscapeEditorApiMiddleware,
} from "./dreamscape-editor-api.mjs";

const AVATARS = [
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
  "00000000-0000-4000-8000-000000000014",
  "00000000-0000-4000-8000-000000000015",
  "00000000-0000-4000-8000-000000000016",
];

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "dreamscape-editor-api-"));
  mkdirSync(join(root, "data"));
  writeFileSync(join(root, "data", "dreamscapes.ron"), "canonical dreamscapes");
  writeFileSync(join(root, "data", "dream_guides.ron"), "canonical guides");
  writeFileSync(
    join(root, "data", "dreamscapes.toml"),
    `
[[dreamscapes]]
id = "starter"
name = "Starter"
signature-site = "Draft"
is-starter = true
fixed-sites = ["Draft", "Battle"]

[[dreamscapes]]
id = "realm_one"
name = "Realm One"
affiliation-id = "affiliation_one"
avatar-ids = ["${AVATARS[0]}", "${AVATARS[1]}", "${AVATARS[2]}"]

[[dreamscapes]]
id = "realm_two"
name = "Realm Two"
affiliation-id = "affiliation_two"
avatar-ids = ["${AVATARS[3]}", "${AVATARS[4]}", "${AVATARS[5]}"]
`,
  );
  writeFileSync(
    join(root, "data", "dream_guides.toml"),
    `
[[guides]]
id = "guide_one"
name = "Guide One"
home-dreamscape-id = "realm_one"
site-type = "Shop"

[[guides]]
id = "guide_two"
name = "Guide Two"
home-dreamscape-id = "realm_two"
site-type = "Purge"
`,
  );
  writeFileSync(
    join(root, "data", "affiliations.toml"),
    `
[[affiliations]]
id = "affiliation_one"
name = "One"

[[affiliations]]
id = "affiliation_two"
name = "Two"
`,
  );
  writeFileSync(
    join(root, "data", "avatars.toml"),
    AVATARS.map(
      (id, index) => `
[[avatar]]
id = "${id}"
name = "Avatar ${String(index)}"
title = "Title"
image-number = "00${String(index)}"
rendered-text = "Ability"
`,
    ).join(""),
  );
  return root;
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
    writeHead(status) {
      this.status = status;
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

describe("typed Dreamscape editor API", () => {
  it("returns the shared canonical source revision on load", async () => {
    const rootDir = fixtureRoot();
    const middleware = createDreamscapeEditorApiMiddleware({
      rootDir,
      revision: () => "confirmed-revision",
    });
    const result = await invoke(middleware, "GET", "/api/editor/dreamscapes");

    expect(result.status).toBe(200);
    expect(result.body.sourceRevision).toBe("confirmed-revision");
    expect(result.body.dreamscapes).toHaveLength(3);
  });

  it.each([
    ["name", "Renamed Realm"],
    ["affiliation-id", "affiliation_two"],
  ])(
    "publishes %s through a closed semantic operation",
    async (field, value) => {
      const rootDir = fixtureRoot();
      const publishEdit = vi.fn().mockResolvedValue({ sourceRevision: "next" });
      const middleware = createDreamscapeEditorApiMiddleware({
        rootDir,
        publishEdit,
        revision: () => "current",
      });
      const result = await invoke(
        middleware,
        "PATCH",
        "/api/editor/dreamscapes/realm_one",
        {
          id: "realm_one",
          field,
          value,
          expectedSourceRevision: "current",
        },
      );

      expect(result.status).toBe(200);
      expect(result.body.sourceRevision).toBe("next");
      const expectedOperations = [
        {
          operation: "set_dreamscape_field",
          dreamscape_id: "realm_one",
          field,
          value,
        },
        ...(field === "affiliation-id"
          ? [
              {
                operation: "set_dreamscape_field",
                dreamscape_id: "realm_two",
                field,
                value: "affiliation_one",
              },
            ]
          : []),
      ];
      expect(publishEdit).toHaveBeenCalledWith({
        rootDir,
        dataset: "dreamscapes",
        operations: expectedOperations,
        sourcePaths: DREAMSCAPE_EDITOR_SOURCE_PATHS,
        expectedSourceRevision: "current",
      });
    },
  );

  it("publishes a resident swap as one validated multi-record transaction", async () => {
    const rootDir = fixtureRoot();
    const publishEdit = vi.fn().mockResolvedValue({ sourceRevision: "next" });
    const middleware = createDreamscapeEditorApiMiddleware({
      rootDir,
      publishEdit,
      revision: () => "current",
    });
    const result = await invoke(
      middleware,
      "POST",
      "/api/editor/dreamscapes/realm_one/avatars",
      {
        action: "replace",
        inId: AVATARS[3],
        outId: AVATARS[0],
        expectedSourceRevision: "current",
      },
    );

    expect(result.status).toBe(200);
    expect(publishEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: "dreamscapes",
        expectedSourceRevision: "current",
        operations: [
          {
            operation: "set_dreamscape_opponents",
            dreamscape_id: "realm_one",
            opponent_ids: [AVATARS[3], AVATARS[1], AVATARS[2]],
          },
          {
            operation: "set_dreamscape_opponents",
            dreamscape_id: "realm_two",
            opponent_ids: [AVATARS[0], AVATARS[4], AVATARS[5]],
          },
        ],
      }),
    );
  });

  it("returns confirmed data and pauses stale saves at the revision boundary", async () => {
    const rootDir = fixtureRoot();
    const stale = Object.assign(new Error("STALE_SOURCE: changed"), {
      code: "STALE_SOURCE",
      currentSourceRevision: "current",
    });
    const middleware = createDreamscapeEditorApiMiddleware({
      rootDir,
      publishEdit: vi.fn().mockRejectedValue(stale),
      revision: () => "current",
    });
    const result = await invoke(
      middleware,
      "PATCH",
      "/api/editor/dreamscapes/realm_one",
      {
        id: "realm_one",
        field: "name",
        value: "Renamed Realm",
        expectedSourceRevision: "stale",
      },
    );

    expect(result.status).toBe(409);
    expect(result.body.error).toMatchObject({
      code: "STALE_SOURCE",
      details: {
        currentSourceRevision: "current",
        confirmed: { sourceRevision: "current" },
      },
    });
  });

  it("rejects invalid edits before publication", async () => {
    const rootDir = fixtureRoot();
    const publishEdit = vi.fn();
    const middleware = createDreamscapeEditorApiMiddleware({
      rootDir,
      publishEdit,
    });
    const result = await invoke(
      middleware,
      "PATCH",
      "/api/editor/dreamscapes/realm_one",
      {
        id: "realm_one",
        field: "name",
        value: "   ",
        expectedSourceRevision: "current",
      },
    );

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("INVALID_EDIT");
    expect(publishEdit).not.toHaveBeenCalled();
  });
});
