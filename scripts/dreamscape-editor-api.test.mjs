import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  commitFiles,
  generateCatalogArtifacts,
} from "./dreamscape-editor-api.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("dreamscape editor atomic catalog writes", () => {
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
