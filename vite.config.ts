import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";
import { createCardEditorApiMiddleware } from "./scripts/card-editor-api.mjs";
import { createDreamsignEditorApiMiddleware } from "./scripts/dreamsign-editor-api.mjs";
import { createFigmentEditorApiMiddleware } from "./scripts/figment-editor-api.mjs";
import { refreshFigmentDataJson } from "./scripts/figment-editor-data.mjs";
import { createImageViewerApiMiddleware } from "./scripts/image-viewer-api.mjs";
import { createCardImageApiMiddleware } from "./scripts/card-image-api.mjs";
import { createSavedQuestsApiMiddleware } from "./scripts/saved-quests-api.mjs";
import { checkGeneratedCardData } from "./scripts/generated-card-data-drift.mjs";
import { regenerateCardData } from "./scripts/setup-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const generatedCardDataWatchPaths = [
  path.join(__dirname, "data", "tabula", "cards_v2.toml"),
  path.join(__dirname, "public", "card-data.json"),
  path.join(__dirname, "public", "cards_v2-data.json"),
].map((filePath) => path.resolve(filePath));

/** Vite plugin that writes quest log events to disk during development. */
function questLogPlugin(): Plugin {
  return {
    name: "quest-log-writer",
    configureServer(server) {
      server.middlewares.use("/api/log", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        let body = "";
        req.on("data", (chunk: string) => { body += chunk; });
        req.on("end", () => {
          const logDir = path.join(__dirname, "logs");
          fs.mkdirSync(logDir, { recursive: true });
          fs.appendFileSync(
            path.join(logDir, "quest-log.jsonl"),
            body + "\n",
          );
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
        });
      });
    },
  };
}

/** Vite plugin that serves local card editor read/write endpoints. */
function cardEditorApiPlugin(): Plugin {
  return {
    name: "card-editor-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(createCardEditorApiMiddleware({ rootDir: __dirname }));
    },
  };
}

/** Vite plugin that serves local dreamsign editor read/write endpoints. */
function dreamsignEditorApiPlugin(): Plugin {
  return {
    name: "dreamsign-editor-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(createDreamsignEditorApiMiddleware({ rootDir: __dirname }));
    },
  };
}

/** Vite plugin that serves local figment editor read/write endpoints. */
function figmentEditorApiPlugin(): Plugin {
  return {
    name: "figment-editor-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(createFigmentEditorApiMiddleware({ rootDir: __dirname }));
    },
  };
}

/**
 * Dev-only Vite plugin that hot-reloads figment data into a running battle when
 * `data/tabula/figments.toml` is edited. The TOML directory is ignored by the
 * dev watcher (see `server.watch.ignored`), so this plugin watches the file
 * directly, regenerates `public/figments-data.json` via
 * {@link refreshFigmentDataJson}, and emits a `figment-data:changed` custom HMR
 * event. Only the battle/quest app reloads on that event (see src/main.tsx); the
 * editor pages ignore it, so saving in the figment editor never reloads the page
 * and closes an open art editor. `apply: "serve"` keeps it out of production
 * builds.
 */
function figmentDataHotReloadPlugin(): Plugin {
  const figmentTomlPath = path.resolve(
    path.join(__dirname, "data", "tabula", "figments.toml"),
  );
  const tomlDir = path.dirname(figmentTomlPath);
  const tomlBasename = path.basename(figmentTomlPath);

  return {
    name: "figment-data-hot-reload",
    apply: "serve",
    configureServer(server) {
      let pendingReload: ReturnType<typeof setTimeout> | null = null;

      const regenerateAndReload = (): void => {
        try {
          refreshFigmentDataJson({ rootDir: __dirname });
          console.log(
            "[figment-data] figments.toml changed -> regenerated figments-data.json -> notifying running app",
          );
          // Send a targeted custom event rather than a full reload. Only the
          // running battle/quest app registers a handler for it (see
          // `figment-data:changed` in src/main.tsx) and reloads to pick up the
          // edit; the figment and card editor pages register no handler, so a
          // save from the editor does not reload the page out from under an open
          // art editor or an inline edit.
          server.ws.send({ type: "custom", event: "figment-data:changed" });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[figment-data] hot reload failed: ${message}`);
          server.ws.send({
            type: "error",
            err: {
              message: "Failed to regenerate figment data from figments.toml",
              stack: message,
            },
          });
        }
      };

      const scheduleReload = (): void => {
        if (pendingReload !== null) {
          clearTimeout(pendingReload);
        }
        pendingReload = setTimeout(() => {
          pendingReload = null;
          regenerateAndReload();
        }, 150);
      };

      const watcher = fs.watch(
        tomlDir,
        { persistent: false },
        (_eventType, filename) => {
          if (filename === null || filename.toString() === tomlBasename) {
            scheduleReload();
          }
        },
      );

      let closed = false;
      const closeWatcher = (): void => {
        if (closed) {
          return;
        }
        closed = true;
        if (pendingReload !== null) {
          clearTimeout(pendingReload);
          pendingReload = null;
        }
        watcher.close();
      };

      server.httpServer?.once("close", closeWatcher);
      server.watcher.once("close", closeWatcher);
    },
  };
}

/** Vite plugin that serves the candidate-image viewer endpoints. */
function imageViewerApiPlugin(): Plugin {
  return {
    name: "image-viewer-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        createImageViewerApiMiddleware({
          cardsTomlPath: path.join(__dirname, "data", "tabula", "cards_v2.toml"),
          nameHistoryTomlPaths: [
            path.join(__dirname, "data", "tabula", "cards_v2.toml"),
          ],
        }),
      );
    },
  };
}

/**
 * Vite plugin that serves `/cards/<n>.webp` for card art added after the last
 * `setup-assets` run. It resolves the image number from the local cache or
 * directly from Shutterstock and lets existing symlinks fall through to the
 * static handler.
 */
function cardImageApiPlugin(): Plugin {
  return {
    name: "card-image-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(createCardImageApiMiddleware({ rootDir: __dirname }));
    },
  };
}

/** Vite plugin that serves the saved-quest read/write endpoints. */
function savedQuestsApiPlugin(): Plugin {
  return {
    name: "saved-quests-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        createSavedQuestsApiMiddleware({ rootDir: __dirname }),
      );
    },
  };
}

/**
 * Dev-only Vite plugin that hot-reloads card data into the running browser when
 * `data/tabula/cards_v2.toml` is edited. The dev watcher ignores the TOML
 * directory (see `server.watch.ignored`), so a TOML save normally has no effect
 * on the page; this plugin watches the file directly with `fs.watch`, and on
 * change:
 *
 *   1. Regenerates both runtime card JSON catalogs (`public/card-data.json` and
 *      `public/cards_v2-data.json`) via {@link regenerateCardData}, reusing the
 *      exact TOML->JSON transform `setup-assets` uses (no duplication). The
 *      writes are synchronous, so the fresh JSON is fully on disk before step 2.
 *   2. Emits a `card-data:changed` custom HMR event. Only the battle/quest app
 *      reloads on it (see src/main.tsx); the editor pages register no handler,
 *      so a card editor save does not reload the page and close an open art
 *      editor or discard an inline edit. Quest/battle state lives in the
 *      Firebase room keyed by the `?game=<id>` URL and rehydrates on reload, and
 *      the card database is re-fetched fresh from `/cards_v2-data.json` on load,
 *      so the running game picks up the edited card text within a second of
 *      saving.
 *
 * Because regeneration runs first, the generated JSON matches the TOML by the
 * time {@link generatedCardDataDriftPlugin} re-checks, so the drift overlay does
 * not fire spuriously after a TOML edit; the drift guard stays as a startup
 * safety net for a checkout whose JSON was never generated. Rapid successive
 * saves are debounced so a single regenerate+reload covers a burst of writes.
 *
 * `apply: "serve"` keeps this out of production builds entirely.
 */
export function cardDataHotReloadPlugin(): Plugin {
  const cardTomlPath = path.resolve(
    path.join(__dirname, "data", "tabula", "cards_v2.toml"),
  );
  const tomlDir = path.dirname(cardTomlPath);
  const tomlBasename = path.basename(cardTomlPath);

  return {
    name: "card-data-hot-reload",
    apply: "serve",
    configureServer(server) {
      let pendingReload: ReturnType<typeof setTimeout> | null = null;

      const regenerateAndReload = (): void => {
        try {
          regenerateCardData();
          console.log(
            "[card-data] cards_v2.toml changed -> regenerated card JSON -> notifying running app",
          );
          // Targeted custom event rather than a full reload: only the running
          // battle/quest app reloads to pick up the edit (see
          // `card-data:changed` in src/main.tsx), so saving in the card editor
          // does not reload the page and close an open art editor.
          server.ws.send({ type: "custom", event: "card-data:changed" });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[card-data] hot reload failed: ${message}`);
          server.ws.send({
            type: "error",
            err: {
              message: "Failed to regenerate card data from cards_v2.toml",
              stack: message,
            },
          });
        }
      };

      const scheduleReload = (): void => {
        if (pendingReload !== null) {
          clearTimeout(pendingReload);
        }
        pendingReload = setTimeout(() => {
          pendingReload = null;
          regenerateAndReload();
        }, 150);
      };

      const watcher = fs.watch(
        tomlDir,
        { persistent: false },
        (_eventType, filename) => {
          if (filename === null || filename.toString() === tomlBasename) {
            scheduleReload();
          }
        },
      );

      let closed = false;
      const closeWatcher = (): void => {
        if (closed) {
          return;
        }
        closed = true;
        if (pendingReload !== null) {
          clearTimeout(pendingReload);
          pendingReload = null;
        }
        watcher.close();
      };

      server.httpServer?.once("close", closeWatcher);
      server.watcher.once("close", closeWatcher);
    },
  };
}

/** Vite plugin that detects stale generated card data during development. */
export function generatedCardDataDriftPlugin(): Plugin {
  const watchedPaths = new Set(generatedCardDataWatchPaths);

  const runCheck = (): ReturnType<typeof checkGeneratedCardData> =>
    checkGeneratedCardData({ rootDir: __dirname });

  const isWatchedCardDataPath = (filePath: string): boolean =>
    watchedPaths.has(path.resolve(filePath));

  const reportCheckResult = (
    result: ReturnType<typeof checkGeneratedCardData>,
    server: ViteDevServer,
  ): void => {
    // Stay silent on the success path: card edits trigger this check on every
    // save, and logging a "matches" line each time floods the dev console.
    // Drift is still surfaced loudly below.
    if (result.ok) {
      return;
    }

    console.error(`[card-data] ${result.message}`);
    server.ws.send({
      type: "error",
      err: {
        message: "Generated card data is out of date",
        stack: result.message,
      },
    });
  };

  const watchedDirectories = new Map<string, Set<string>>();
  for (const watchedPath of watchedPaths) {
    const directory = path.dirname(watchedPath);
    const basename = path.basename(watchedPath);
    const filenames = watchedDirectories.get(directory) ?? new Set<string>();
    filenames.add(basename);
    watchedDirectories.set(directory, filenames);
  }

  return {
    name: "generated-card-data-drift-guard",
    apply: "serve",
    configureServer(server) {
      const initialResult = runCheck();
      if (!initialResult.ok) {
        throw new Error(initialResult.message);
      }

      let pendingCheck: ReturnType<typeof setTimeout> | null = null;
      const scheduleCheck = (): void => {
        if (pendingCheck !== null) {
          clearTimeout(pendingCheck);
        }

        pendingCheck = setTimeout(() => {
          pendingCheck = null;
          reportCheckResult(runCheck(), server);
        }, 25);
      };

      const watchers = Array.from(watchedDirectories, ([directory, filenames]) =>
        fs.watch(
          directory,
          { persistent: false },
          (_eventType, filename) => {
            if (filename === null) {
              scheduleCheck();
              return;
            }

            if (filenames.has(filename.toString())) {
              scheduleCheck();
            }
          },
        ),
      );

      let closed = false;
      const closeWatchers = (): void => {
        if (closed) {
          return;
        }

        closed = true;
        if (pendingCheck !== null) {
          clearTimeout(pendingCheck);
          pendingCheck = null;
        }

        for (const watcher of watchers) {
          watcher.close();
        }
      };

      server.httpServer?.once("close", closeWatchers);
      server.watcher.once("close", closeWatchers);
    },
    hotUpdate(context) {
      if (!isWatchedCardDataPath(context.file)) {
        return undefined;
      }

      reportCheckResult(runCheck(), context.server);
      return [];
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    questLogPlugin(),
    cardEditorApiPlugin(),
    dreamsignEditorApiPlugin(),
    figmentEditorApiPlugin(),
    figmentDataHotReloadPlugin(),
    imageViewerApiPlugin(),
    cardImageApiPlugin(),
    savedQuestsApiPlugin(),
    cardDataHotReloadPlugin(),
    generatedCardDataDriftPlugin(),
  ],
  test: {
    include: [
      "src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      "scripts/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**",
      "**/.cache/**",
      "**/.output/**",
      "**/.temp/**",
      "**/.claude/worktrees/**",
    ],
  },
  server: {
    watch: {
      // The card editor APIs write card and tag TOML files under data/tabula
      // (via temp-file swaps) and regenerate the generated card data on every
      // save. regenerateCardData() writes three files: the two public card
      // JSON catalogs (public/card-data.json and public/cards_v2-data.json) and
      // data/buildaround_support.json, whose per-card name fields are refreshed
      // from the current card names (so a rename rewrites it). Files in public/
      // are not part of the module graph, but Vite still forces a full page
      // reload whenever any public/ file changes, and data/buildaround_support
      // .json sits outside data/tabula so it is otherwise watched too. The two
      // catalogs are listed in generatedCardDataWatchPaths below and
      // buildaround_support.json is ignored just below; ignoring all three keeps
      // an editor save from reloading the page, closing the art editor mid-edit,
      // and discarding inline edits.
      //
      // Git worktrees live under .worktrees and .claude/worktrees inside the
      // project root, so they fall within the watched tree. Each checkout
      // writes a full repo copy (including a tsconfig.json), and Vite forces a
      // full reload on any tsconfig change. Ignoring these directories keeps
      // creating a worktree from reloading the dev server.
      ignored: [
        path.resolve(path.join(__dirname, "data", "tabula")) + "/**",
        // Saving a quest writes a JSON file here; ignore it so the save does
        // not trigger a full page reload that would close the debug overlay.
        path.resolve(path.join(__dirname, "saved-quests")) + "/**",
        path.resolve(path.join(__dirname, ".worktrees")) + "/**",
        path.resolve(path.join(__dirname, ".claude", "worktrees")) + "/**",
        // Regenerated on every card save (its per-card name fields track the
        // current card names), so a rename rewrites it; ignore it so the save
        // does not trigger a full page reload that closes the art editor.
        path.resolve(path.join(__dirname, "data", "buildaround_support.json")),
        ...generatedCardDataWatchPaths,
      ],
    },
  },
});
