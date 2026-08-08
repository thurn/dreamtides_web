import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  commitFiles,
  createDreamscapeEditorApiMiddleware,
  generateCatalogArtifacts,
} from "./dreamscape-editor-api.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function invokePatch(middleware, body) {
  const req = new EventEmitter();
  req.method = "PATCH";
  req.url = `/api/editor/dreamscapes/${body.id}`;
  req.setEncoding = vi.fn();
  const result = new Promise((resolveResult) => {
    const res = {
      writeHead(status) {
        this.status = status;
      },
      end(text) {
        this.body = JSON.parse(text);
        resolveResult(this);
      },
    };
    void middleware(req, res, vi.fn());
  });
  queueMicrotask(() => {
    req.emit("data", JSON.stringify(body));
    req.emit("end");
  });
  return result;
}

describe("dreamscape editor atomic catalog writes", () => {
  it.each(["guide-id", "signature-site"])(
    "rejects %s writes routed to the legacy Dreamscape endpoint",
    async (field) => {
      const rootDir = mkdtempSync(resolve(tmpdir(), "dreamscape-editor-api-"));
      mkdirSync(resolve(rootDir, "data"));
      const sourcePath = resolve(rootDir, "data/dreamscapes.toml");
      writeFileSync(sourcePath, "fixture source\n");
      const middleware = createDreamscapeEditorApiMiddleware({ rootDir });

      const result = await invokePatch(middleware, {
        id: "realm_one",
        field,
        value: "anything",
      });

      expect(result.status).toBe(400);
      expect(result.body.error).toMatchObject({ code: "INVALID_EDIT" });
      expect(readFileSync(sourcePath, "utf8")).toBe("fixture source\n");
    },
  );

  it("recompiles the real guide, Dreamscape, Site, and Economy contracts together", () => {
    const artifacts = generateCatalogArtifacts(
      ROOT,
      readFileSync(resolve(ROOT, "data/dreamscapes.toml"), "utf8"),
      readFileSync(resolve(ROOT, "data/dream_guides.toml"), "utf8"),
      { readFileSync },
    );

    expect(JSON.parse(artifacts.dreamscapes)).toHaveLength(11);
    expect(JSON.parse(artifacts.guides).guides).toHaveLength(10);
    expect(JSON.parse(artifacts.sites).foldHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("restores every destination when a multi-file promotion fails", () => {
    const files = new Map([
      ["/fixture/dream_guides.toml", "old guides"],
      ["/fixture/dreamscapes-data.json", "old dreamscapes"],
    ]);
    const fileSystem = {
      existsSync: (path) => files.has(path),
      writeFileSync: (path, content) => files.set(path, content),
      renameSync: (from, to) => {
        if (from === "/fixture/dreamscapes-data.json.tmp") {
          throw new Error("synthetic promotion failure");
        }
        const content = files.get(from);
        if (content === undefined) throw new Error(`missing ${from}`);
        files.delete(from);
        files.set(to, content);
      },
      rmSync: (path) => files.delete(path),
    };
    const writes = [
      {
        destination: "/fixture/dream_guides.toml",
        temp: "/fixture/dream_guides.toml.tmp",
        backup: "/fixture/dream_guides.toml.bak",
        content: "new guides",
      },
      {
        destination: "/fixture/dreamscapes-data.json",
        temp: "/fixture/dreamscapes-data.json.tmp",
        backup: "/fixture/dreamscapes-data.json.bak",
        content: "new dreamscapes",
      },
    ];

    expect(() => commitFiles(writes, fileSystem)).toThrow(
      /synthetic promotion failure/u,
    );
    expect(files.get("/fixture/dream_guides.toml")).toBe("old guides");
    expect(files.get("/fixture/dreamscapes-data.json")).toBe("old dreamscapes");
    expect(
      [...files.keys()].some(
        (path) => path.endsWith(".tmp") || path.endsWith(".bak"),
      ),
    ).toBe(false);
  });
});
