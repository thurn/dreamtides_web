// @vitest-environment node

import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDreamGuideEditorApiMiddleware } from "./dream-guide-editor-api.mjs";

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "dream-guide-editor-api-"));
  mkdirSync(join(root, "data"));
  writeFileSync(join(root, "data", "dreamscapes.ron"), "fixture dreamscapes");
  writeFileSync(join(root, "data", "dream_guides.ron"), "fixture guides");
  writeFileSync(
    join(root, "data", "dreamscapes.toml"),
    `
[[dreamscapes]]
id = "starter"
name = "Starter"
aesthetic = "Opening"
signature-site = "Draft"
is-starter = true
fixed-sites = ["Draft"]

[[dreamscapes]]
id = "realm_one"
name = "Realm One"
aesthetic = "One"
affiliation-id = "affiliation_one"

[[dreamscapes]]
id = "realm_two"
name = "Realm Two"
aesthetic = "Two"
affiliation-id = "affiliation_one"
`,
  );
  writeFileSync(
    join(root, "data", "dream_guides.toml"),
    `
schema-version = 1

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
name = "Affiliation One"
`,
  );
  writeFileSync(join(root, "data", "dream_avatars.toml"), "dreamAvatar = []\n");
  return root;
}

function request(body) {
  const req = new EventEmitter();
  req.method = "PATCH";
  req.url = "/api/editor/dream-guides/realm_one";
  req.setEncoding = vi.fn();
  queueMicrotask(() => {
    req.emit("data", JSON.stringify(body));
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

async function invoke(middleware, body) {
  const res = response();
  await middleware(request(body), res, vi.fn());
  return res.done;
}

describe("typed Dream guide editor API", () => {
  it.each([
    ["guide-id", "guide_two", "swap_dream_guide_homes"],
    ["signature-site", "Purge", "swap_dream_guide_specialties"],
  ])(
    "routes %s through a closed semantic operation",
    async (field, value, operation) => {
      const rootDir = fixtureRoot();
      const publishEdit = vi.fn().mockResolvedValue({ sourceRevision: "next" });
      const middleware = createDreamGuideEditorApiMiddleware({
        rootDir,
        publishEdit,
        revision: () => "current",
      });
      const result = await invoke(middleware, {
        id: "realm_one",
        field,
        value,
        expectedSourceRevision: "current",
      });

      expect(result.status).toBe(200);
      expect(result.body.sourceRevision).toBe("next");
      expect(publishEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          dataset: "dream-guides",
          expectedSourceRevision: "current",
          operations: [
            {
              operation,
              first_guide_id: "guide_one",
              second_guide_id: "guide_two",
            },
          ],
        }),
      );
    },
  );

  it("returns confirmed data and the current revision after a stale save", async () => {
    const rootDir = fixtureRoot();
    const stale = Object.assign(new Error("STALE_SOURCE: changed"), {
      code: "STALE_SOURCE",
      currentSourceRevision: "current",
    });
    const middleware = createDreamGuideEditorApiMiddleware({
      rootDir,
      publishEdit: vi.fn().mockRejectedValue(stale),
      revision: () => "current",
    });
    const result = await invoke(middleware, {
      id: "realm_one",
      field: "guide-id",
      value: "guide_two",
      expectedSourceRevision: "stale",
    });

    expect(result.status).toBe(409);
    expect(result.body.error).toMatchObject({
      code: "STALE_SOURCE",
      details: {
        currentSourceRevision: "current",
        confirmed: { sourceRevision: "current" },
      },
    });
  });

  it("rejects validation failures before publication", async () => {
    const rootDir = fixtureRoot();
    const publishEdit = vi.fn();
    const middleware = createDreamGuideEditorApiMiddleware({
      rootDir,
      publishEdit,
    });
    const result = await invoke(middleware, {
      id: "realm_one",
      field: "guide-id",
      value: "missing",
      expectedSourceRevision: "current",
    });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("INVALID_EDIT");
    expect(publishEdit).not.toHaveBeenCalled();
  });
});
