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
    // page reload. The saved-quests directory is ignored so saving a quest from
    // the debug overlay does not reload the page. The .worktrees and
    // .claude/worktrees directories are ignored so creating a git worktree
    // (which writes a full repo copy, including a tsconfig.json) does not force
    // a full reload. buildaround_support.json (regenerated on every card save),
    // data/tides4.jsonc, and the public dreamcaller/tides4 JSON catalogs (all
    // rewritten by the dreamcaller editor) are ignored so those editor saves do
    // not reload the page either. The public dreamwell JSON catalog (rewritten
    // by the Dreamwell editor on every save) is ignored for the same reason. The
    // generated card data paths round out the list.
    expect(viteConfig.server?.watch?.ignored).toEqual([
      resolve(join(rootDir, "data", "tabula")) + "/**",
      resolve(join(rootDir, "saved-quests")) + "/**",
      resolve(join(rootDir, ".worktrees")) + "/**",
      resolve(join(rootDir, ".claude", "worktrees")) + "/**",
      resolve(join(rootDir, "data", "buildaround_support.json")),
      resolve(join(rootDir, "data", "tides4.jsonc")),
      resolve(join(rootDir, "public", "dreamcallers-v2-data.json")),
      resolve(join(rootDir, "public", "tides4-data.json")),
      resolve(join(rootDir, "public", "dreamwell-data.json")),
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
