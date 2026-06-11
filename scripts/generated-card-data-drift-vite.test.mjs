// @vitest-environment node

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import viteConfig, {
  generatedCardDataDriftPlugin,
  generatedCardDataWatchPaths,
} from "../vite.config.ts";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function makeHotUpdateContext(file) {
  return {
    file,
    server: {
      ws: {
        send: vi.fn(),
      },
    },
  };
}

function callHotUpdate(plugin, context) {
  const hook = plugin.hotUpdate;

  if (typeof hook === "function") {
    return hook(context);
  }

  return hook?.handler(context);
}

describe("generated card data drift Vite integration", () => {
  it("keeps editor-written card data files out of Vite's reload watcher", () => {
    // The whole data/tabula directory is ignored so editor writes to any card
    // or tag TOML (not just the default cards_v2.toml) never trigger a full
    // page reload. The .worktrees and .claude/worktrees directories are ignored
    // so creating a git worktree (which writes a full repo copy, including a
    // tsconfig.json) does not force a full reload. The generated card data
    // paths round out the list.
    expect(viteConfig.server?.watch?.ignored).toEqual([
      resolve(join(rootDir, "data", "tabula")) + "/**",
      resolve(join(rootDir, ".worktrees")) + "/**",
      resolve(join(rootDir, ".claude", "worktrees")) + "/**",
      ...generatedCardDataWatchPaths,
    ]);
  });

  it("suppresses full-page reloads for card editor source and generated data writes", () => {
    const plugin = generatedCardDataDriftPlugin();

    expect(
      callHotUpdate(
        plugin,
        makeHotUpdateContext(
          join(rootDir, "data", "tabula", "cards_v2.toml"),
        ),
      ),
    ).toEqual([]);
    expect(
      callHotUpdate(
        plugin,
        makeHotUpdateContext(join(rootDir, "public", "card-data.json")),
      ),
    ).toEqual([]);
  });

  it("leaves unrelated file changes to Vite", () => {
    const plugin = generatedCardDataDriftPlugin();

    expect(
      callHotUpdate(
        plugin,
        makeHotUpdateContext(join(rootDir, "src", "editor", "CardEditorApp.tsx")),
      ),
    ).toBeUndefined();
  });
});
