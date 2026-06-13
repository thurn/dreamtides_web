import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";
import { createCardEditorApiMiddleware } from "./scripts/card-editor-api.mjs";
import { createDreamsignEditorApiMiddleware } from "./scripts/dreamsign-editor-api.mjs";
import { createImageViewerApiMiddleware } from "./scripts/image-viewer-api.mjs";
import { createCardImageApiMiddleware } from "./scripts/card-image-api.mjs";
import { createSavedQuestsApiMiddleware } from "./scripts/saved-quests-api.mjs";
import { checkGeneratedCardData } from "./scripts/generated-card-data-drift.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const generatedCardDataWatchPaths = [
  path.join(__dirname, "data", "tabula", "cards_v2.toml"),
  path.join(__dirname, "public", "card-data.json"),
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
    imageViewerApiPlugin(),
    cardImageApiPlugin(),
    savedQuestsApiPlugin(),
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
      // (via temp-file swaps) and regenerate public/card-data.json on every
      // save. None of these are part of the module graph, so the dev watcher
      // ignores them; otherwise each editor save triggers a full page reload,
      // which would close the art editor mid-edit and discard inline edits.
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
        ...generatedCardDataWatchPaths,
      ],
    },
  },
});
