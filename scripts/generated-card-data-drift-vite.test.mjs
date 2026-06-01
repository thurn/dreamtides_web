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
    // or tag TOML (not just the default rendered-cards.toml) never trigger a
    // full page reload, alongside the generated card data paths.
    expect(viteConfig.server?.watch?.ignored).toEqual([
      resolve(join(rootDir, "data", "tabula")) + "/**",
      ...generatedCardDataWatchPaths,
    ]);
  });

  it("suppresses full-page reloads for card editor source and generated data writes", () => {
    const plugin = generatedCardDataDriftPlugin();

    expect(
      callHotUpdate(
        plugin,
        makeHotUpdateContext(
          join(rootDir, "data", "tabula", "rendered-cards.toml"),
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
