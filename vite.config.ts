import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";
import { createCardEditorApiMiddleware } from "./scripts/card-editor-api.mjs";
import { createExplorationEditorApiMiddleware } from "./scripts/exploration-editor-api.mjs";
import { createDreamsignEditorApiMiddleware } from "./scripts/dreamsign-editor-api.mjs";
import { createDreamAvatarEditorApiMiddleware } from "./scripts/dream-avatar-editor-api.mjs";
import { createTidesEditorApiMiddleware } from "./scripts/tides-editor-api.mjs";
import { createDreamscapeEditorApiMiddleware } from "./scripts/dreamscape-editor-api.mjs";
import { createDreamGuideEditorApiMiddleware } from "./scripts/dream-guide-editor-api.mjs";
import { createFigmentEditorApiMiddleware } from "./scripts/figment-editor-api.mjs";
import { refreshFigmentDataJson } from "./scripts/figment-editor-data.mjs";
import { createDreamwellEditorApiMiddleware } from "./scripts/dreamwell-editor-api.mjs";
import { refreshDreamwellDataJson } from "./scripts/dreamwell-editor-data.mjs";
import {
  generatedConfigDataWatchPaths,
  regenerateConfigData,
  regenerateSitesData,
  SIMPLE_CONFIG_TOML_BASENAMES,
} from "./scripts/config-data.mjs";
import { createImageViewerApiMiddleware } from "./scripts/image-viewer-api.mjs";
import { createCardImageApiMiddleware } from "./scripts/card-image-api.mjs";
import { createSavedJourneysApiMiddleware } from "./scripts/saved-journeys-api.mjs";
import { createTutorialEditorApiMiddleware } from "./scripts/tutorial-editor-api.mjs";
import { createGlossaryEditorApiMiddleware } from "./scripts/glossary-editor-api.mjs";
import { checkGeneratedCardData } from "./scripts/generated-card-data-drift.mjs";
import { regenerateCardData } from "./scripts/setup-assets.mjs";
import { resolveBuildHash } from "./scripts/build-hash.mjs";
import { ensureGameData, listGameData } from "./scripts/game-data-pipeline.mjs";
import { createRonEditorBridge } from "./scripts/ron-editor-bridge.mjs";
import {
  parseGameDataDatasetId,
  type GameDataDatasetId,
} from "./src/types/tool-identifiers.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildGitSha = resolveBuildGitSha();
const buildHash = resolveBuildHash(__dirname);
const imageViewerStatePath = path.join(
  __dirname,
  "data",
  "internal",
  "image-viewer-state.json",
);

export const generatedDataTomlWatchPattern =
  path.resolve(path.join(__dirname, "data")) + "/*.toml*";
export const generatedCardDataWatchPaths = [
  path.join(__dirname, "data", "cards.toml"),
  path.join(__dirname, "public", "card-data.json"),
  path.join(__dirname, "public", "cards_v2-data.json"),
  path.join(__dirname, "src", "generated", "config", "card-role-data.json"),
].map((filePath) => path.resolve(filePath));
export const cardEditorSourceWatchPaths = [
  path.join(__dirname, "data", "cards.ron"),
  path.join(__dirname, "data", "internal", "internal_card_metadata.ron"),
].map((filePath) => path.resolve(filePath));
export const gameDataPipelineWatchPatterns = [
  path.resolve(path.join(__dirname, ".game-data-stage-*")) + "/**",
  path.resolve(path.join(__dirname, ".game-data-transactions")) + "/**",
  path.resolve(path.join(__dirname, ".game-data-transaction.json")),
  path.resolve(path.join(__dirname, ".game-data.lock")),
];

function resolveBuildGitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

interface RonGenerationOptions {
  ensure?: typeof ensureGameData;
  list?: typeof listGameData;
  rootDir?: string;
  debounceMs?: number;
}

/** Materialize generated compatibility data and keep canonical RON hot. */
export function gameDataRonPlugin(options: RonGenerationOptions = {}): Plugin {
  const rootDir = options.rootDir ?? __dirname;
  const ensure = options.ensure ?? ensureGameData;
  const list = options.list ?? listGameData;
  const debounceMs = options.debounceMs ?? 120;
  return {
    name: "game-data-ron-generation",
    apply: "serve",
    async configureServer(server) {
      await ensure({ rootDir });
      const manifest = list({ rootDir });
      const datasets = new Map<
        string,
        { id: GameDataDatasetId; source: string }
      >();
      const watchedDirectories = new Map<string, Set<string>>();
      for (const dataset of manifest.datasets) {
        const source = path.resolve(rootDir, dataset.source);
        datasets.set(source, {
          id: parseGameDataDatasetId(dataset.id),
          source: dataset.source,
        });
        const names =
          watchedDirectories.get(path.dirname(source)) ?? new Set<string>();
        names.add(path.basename(source));
        watchedDirectories.set(path.dirname(source), names);
      }

      const timers = new Map<string, ReturnType<typeof setTimeout>>();
      const running = new Map<string, Promise<void>>();
      const regenerate = async (source: string): Promise<void> => {
        const dataset = datasets.get(source);
        if (dataset === undefined) return;
        const previous = running.get(dataset.id) ?? Promise.resolve();
        const next = previous.then(async () => {
          try {
            await ensure({ rootDir, dataset: dataset.id });
            server.ws.send({
              type: "custom",
              event: "game-data:generated",
              data: { datasetId: dataset.id, source: dataset.source },
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            console.error(`[game-data] ${dataset.id}: ${message}`);
            server.ws.send({
              type: "error",
              err: {
                message: `RON generation failed for ${dataset.id} (${dataset.source})`,
                stack: message,
              },
            });
          }
        });
        running.set(dataset.id, next);
        await next;
        if (running.get(dataset.id) === next) running.delete(dataset.id);
      };
      const schedule = (source: string): void => {
        const dataset = datasets.get(source);
        if (dataset === undefined) return;
        const pending = timers.get(dataset.id);
        if (pending !== undefined) clearTimeout(pending);
        timers.set(
          dataset.id,
          setTimeout(() => {
            timers.delete(dataset.id);
            void regenerate(source);
          }, debounceMs),
        );
      };
      const watchers = [...watchedDirectories].map(([directory, names]) =>
        fs.watch(directory, { persistent: false }, (_eventType, filename) => {
          if (filename === null) {
            for (const name of names) schedule(path.join(directory, name));
          } else if (names.has(filename.toString())) {
            schedule(path.join(directory, filename.toString()));
          }
        }),
      );
      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
        for (const watcher of watchers) watcher.close();
      };
      server.httpServer?.once("close", close);
      server.watcher.once("close", close);
    },
  };
}

/** Vite plugin that writes journey log events to disk during development. */
function journeyLogPlugin(): Plugin {
  const install = (server: {
    middlewares: ViteDevServer["middlewares"];
  }): void => {
    server.middlewares.use("/api/log", (req, res, next) => {
      if (req.method !== "POST") {
        next();
        return;
      }
      let body = "";
      req.on("data", (chunk: string) => {
        body += chunk;
      });
      req.on("end", () => {
        const logDir = path.join(__dirname, "logs");
        fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(path.join(logDir, "journey-log.jsonl"), body + "\n");
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
      });
    });
  };
  return {
    name: "journey-log-writer",
    configureServer: install,
    configurePreviewServer: install,
  };
}

/** Vite plugin that serves local card editor read/write endpoints. */
function cardEditorApiPlugin(): Plugin {
  return {
    name: "card-editor-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        createCardEditorApiMiddleware({ rootDir: __dirname }),
      );
    },
  };
}

/** Vite plugin that serves the TOML-backed Exploration production editor. */
function explorationEditorApiPlugin(): Plugin {
  return {
    name: "exploration-editor-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        createExplorationEditorApiMiddleware({
          rootDir: __dirname,
          onChanged(change) {
            server.ws.send({
              type: "custom",
              event: "exploration-data:changed",
              data: change,
            });
          },
        }),
      );
    },
  };
}

/** Vite plugin that serves local dreamsign editor read/write endpoints. */
function dreamsignEditorApiPlugin(): Plugin {
  return {
    name: "dreamsign-editor-api",
    apply: "serve",
    configureServer(server) {
      const editorRoot = process.env.DREAMTIDES_EDITOR_DATA_ROOT;
      server.middlewares.use(
        createDreamsignEditorApiMiddleware({
          rootDir:
            editorRoot === undefined ? __dirname : path.resolve(editorRoot),
        }),
      );
    },
  };
}

/** Vite plugin that serves the canonical RON-backed Info Card glossary editor. */
function glossaryEditorApiPlugin(): Plugin {
  return {
    name: "glossary-editor-api",
    apply: "serve",
    configureServer(server) {
      const editorRoot = process.env.DREAMTIDES_EDITOR_DATA_ROOT;
      server.middlewares.use(
        createGlossaryEditorApiMiddleware({
          rootDir:
            editorRoot === undefined ? __dirname : path.resolve(editorRoot),
        }),
      );
    },
  };
}

/**
 * Notify every non-glossary page when generated glossary.toml changes. The data
 * directory is outside Vite's watcher, so this small direct watcher lets open
 * gameplay/card surfaces reload their bundled explanatory copy while the
 * glossary editor keeps its local draft and save state.
 */
export const glossaryDataWatchPath = path.resolve(
  path.join(__dirname, "data", "glossary.toml"),
);

export function glossaryDataHotReloadPlugin(
  refreshSitesData: typeof regenerateSitesData = regenerateSitesData,
): Plugin {
  return {
    name: "glossary-data-hot-reload",
    apply: "serve",
    configureServer(server) {
      const tomlDir = path.dirname(glossaryDataWatchPath);
      const tomlBasename = path.basename(glossaryDataWatchPath);
      let pendingReload: ReturnType<typeof setTimeout> | null = null;
      const watcher = fs.watch(
        tomlDir,
        { persistent: false },
        (_eventType, filename) => {
          if (filename !== null && filename.toString() !== tomlBasename) {
            return;
          }
          if (pendingReload !== null) clearTimeout(pendingReload);
          pendingReload = setTimeout(() => {
            pendingReload = null;
            try {
              refreshSitesData({ rootDir: __dirname });
              // Generated TOML is excluded from Vite's normal watcher, so explicitly
              // invalidate the `glossary.toml?raw` module before reloading. A
              // reload without this step can reuse Vite's cached TOML transform.
              server.moduleGraph.onFileChange(glossaryDataWatchPath);
              server.ws.send({
                type: "custom",
                event: "glossary-data:changed",
              });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              console.error(`[glossary-data] hot reload failed: ${message}`);
              server.ws.send({
                type: "error",
                err: {
                  message:
                    "Failed to validate Atlas data after glossary change",
                  stack: message,
                },
              });
            }
          }, 120);
        },
      );
      const close = (): void => {
        if (pendingReload !== null) clearTimeout(pendingReload);
        pendingReload = null;
        watcher.close();
      };
      server.httpServer?.once("close", close);
      server.watcher.once("close", close);
    },
  };
}

/** Vite plugin that serves local dreamAvatar editor read/write endpoints. */
function dreamAvatarEditorApiPlugin(): Plugin {
  return {
    name: "dream-avatar-editor-api",
    apply: "serve",
    configureServer(server) {
      const editorRoot = process.env.DREAMTIDES_EDITOR_DATA_ROOT;
      server.middlewares.use(
        createDreamAvatarEditorApiMiddleware({
          rootDir:
            editorRoot === undefined ? __dirname : path.resolve(editorRoot),
        }),
      );
    },
  };
}

/** Vite plugin that serves the tides editor read/write endpoints (`/tides`). */
function tidesEditorApiPlugin(): Plugin {
  return {
    name: "tides-editor-api",
    apply: "serve",
    configureServer(server) {
      const editorRoot = process.env.DREAMTIDES_EDITOR_DATA_ROOT;
      server.middlewares.use(
        createTidesEditorApiMiddleware({
          rootDir:
            editorRoot === undefined ? __dirname : path.resolve(editorRoot),
        }),
      );
    },
  };
}

/** Vite plugin that serves local dreamscape editor read/write endpoints. */
function dreamscapeEditorApiPlugin(): Plugin {
  return {
    name: "dreamscape-editor-api",
    apply: "serve",
    configureServer(server) {
      const editorRoot = process.env.DREAMTIDES_EDITOR_DATA_ROOT;
      const rootDir =
        editorRoot === undefined ? __dirname : path.resolve(editorRoot);
      server.middlewares.use(createDreamGuideEditorApiMiddleware({ rootDir }));
      server.middlewares.use(createDreamscapeEditorApiMiddleware({ rootDir }));
    },
  };
}

/** Vite plugin that serves local figment editor read/write endpoints. */
function figmentEditorApiPlugin(): Plugin {
  return {
    name: "figment-editor-api",
    apply: "serve",
    configureServer(server) {
      const editorRoot = process.env.DREAMTIDES_EDITOR_DATA_ROOT;
      const rootDir =
        editorRoot === undefined ? __dirname : path.resolve(editorRoot);
      server.middlewares.use(createFigmentEditorApiMiddleware({ rootDir }));
    },
  };
}

/**
 * Dev-only Vite plugin that hot-reloads figment data into a running battle when
 * `data/figments.toml` is edited. Generated TOML is ignored by the
 * dev watcher (see `server.watch.ignored`), so this plugin watches the file
 * directly, regenerates `public/figments-data.json` via
 * {@link refreshFigmentDataJson}, and emits a `figment-data:changed` custom HMR
 * event. Only the battle/journey app reloads on that event (see src/main.tsx); the
 * editor pages ignore it, so saving in the figment editor never reloads the page
 * and closes an open art editor. `apply: "serve"` keeps it out of production
 * builds.
 */
function figmentDataHotReloadPlugin(): Plugin {
  return {
    name: "figment-data-hot-reload",
    apply: "serve",
    configureServer(server) {
      const editorRoot = process.env.DREAMTIDES_EDITOR_DATA_ROOT;
      const rootDir =
        editorRoot === undefined ? __dirname : path.resolve(editorRoot);
      const figmentTomlPath = path.resolve(
        path.join(rootDir, "data", "figments.toml"),
      );
      const tomlDir = path.dirname(figmentTomlPath);
      const tomlBasename = path.basename(figmentTomlPath);
      let pendingReload: ReturnType<typeof setTimeout> | null = null;

      const regenerateAndReload = (): void => {
        try {
          refreshFigmentDataJson({ rootDir });
          console.log(
            "[figment-data] figments.toml changed -> regenerated figments-data.json -> notifying running app",
          );
          // Send a targeted custom event rather than a full reload. Only the
          // running battle/journey app registers a handler for it (see
          // `figment-data:changed` in src/main.tsx) and reloads to pick up the
          // edit; the figment and card editor pages register no handler, so a
          // save from the editor does not reload the page out from under an open
          // art editor or an inline edit.
          server.ws.send({ type: "custom", event: "figment-data:changed" });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
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

/** Vite plugin that serves local Dreamwell editor read/write endpoints. */
function dreamwellEditorApiPlugin(): Plugin {
  return {
    name: "dreamwell-editor-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        createDreamwellEditorApiMiddleware({ rootDir: __dirname }),
      );
    },
  };
}

/** Dev-only filesystem persistence for the Tutorial Editor rail. */
function tutorialEditorApiPlugin(): Plugin {
  return {
    name: "tutorial-editor-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        createTutorialEditorApiMiddleware({ rootDir: __dirname }),
      );
    },
  };
}

/**
 * Dev-only Vite plugin that hot-reloads Dreamwell data into a running battle
 * when `data/dreamwell.toml` is edited. Generated TOML is ignored by
 * the dev watcher (see `server.watch.ignored`), so this plugin watches the file
 * directly, regenerates `public/dreamwell-data.json` via
 * {@link refreshDreamwellDataJson}, and emits a `dreamwell-data:changed` custom
 * HMR event. Only the battle/journey app reloads on that event (see src/main.tsx);
 * the editor pages ignore it, so saving in the Dreamwell editor never reloads
 * the page out from under an open card editor. `apply: "serve"` keeps it out of
 * production builds.
 */
function dreamwellDataHotReloadPlugin(): Plugin {
  const dreamwellTomlPath = path.resolve(
    path.join(__dirname, "data", "dreamwell.toml"),
  );
  const tomlDir = path.dirname(dreamwellTomlPath);
  const tomlBasename = path.basename(dreamwellTomlPath);

  return {
    name: "dreamwell-data-hot-reload",
    apply: "serve",
    configureServer(server) {
      let pendingReload: ReturnType<typeof setTimeout> | null = null;

      const regenerateAndReload = (): void => {
        try {
          refreshDreamwellDataJson({ rootDir: __dirname });
          console.log(
            "[dreamwell-data] dreamwell.toml changed -> regenerated dreamwell-data.json -> notifying running app",
          );
          server.ws.send({ type: "custom", event: "dreamwell-data:changed" });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`[dreamwell-data] hot reload failed: ${message}`);
          server.ws.send({
            type: "error",
            err: {
              message:
                "Failed to regenerate Dreamwell data from dreamwell.toml",
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

/**
 * Dev-only Vite plugin that hot-reloads the simple Dream Atlas config TOMLs into
 * a running battle/journey app when one is edited. The configs covered are the
 * single-TOML-to-single-JSON catalogs registered in scripts/config-data.mjs
 * (`dreamscapes.toml`, `dream_guides.toml`, `sites.toml`, `affiliations.toml`,
 * `atlas.toml` and `apollyon_incarnations.toml`).
 *
 * The dev watcher ignores generated TOML (see `server.watch.ignored`), so a
 * TOML save normally has no effect on the page. This plugin watches the directory
 * directly with `fs.watch`, and on a change to one of the registered TOMLs it
 * regenerates that config's JSON via {@link regenerateConfigData}, including
 * Atlas data when a referenced catalog changes (the same TOML->JSON transforms
 * `setup-assets` uses, so no full asset rebuild is needed),
 * and emits a `config-data:changed` custom HMR event. Only the battle/journey app
 * reloads on that event (see src/main.tsx) and re-fetches the config on load;
 * the editor pages register no handler, so a save never reloads them. The
 * generated JSON paths are added to `server.watch.ignored`, so writing them does
 * not also trigger Vite's own full-page reload. Rapid successive saves are
 * debounced. `apply: "serve"` keeps this out of production builds.
 */
function configDataHotReloadPlugin(): Plugin {
  const tomlDir = path.resolve(path.join(__dirname, "data"));
  const watchedBasenames = new Set(SIMPLE_CONFIG_TOML_BASENAMES);

  return {
    name: "config-data-hot-reload",
    apply: "serve",
    configureServer(server) {
      const pendingReloads = new Map<string, ReturnType<typeof setTimeout>>();

      const regenerateAndReload = (basename: string): void => {
        try {
          regenerateConfigData(basename, { rootDir: __dirname });
          console.log(
            `[config-data] ${basename} changed -> regenerated config JSON -> notifying running app`,
          );
          server.ws.send({ type: "custom", event: "config-data:changed" });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`[config-data] hot reload failed: ${message}`);
          server.ws.send({
            type: "error",
            err: {
              message: `Failed to regenerate config data from ${basename}`,
              stack: message,
            },
          });
        }
      };

      const scheduleReload = (basename: string): void => {
        const existing = pendingReloads.get(basename);
        if (existing !== undefined) {
          clearTimeout(existing);
        }
        pendingReloads.set(
          basename,
          setTimeout(() => {
            pendingReloads.delete(basename);
            regenerateAndReload(basename);
          }, 150),
        );
      };

      const watcher = fs.watch(
        tomlDir,
        { persistent: false },
        (_eventType, filename) => {
          if (filename === null) {
            return;
          }
          const basename = filename.toString();
          if (watchedBasenames.has(basename)) {
            scheduleReload(basename);
          }
        },
      );

      let closed = false;
      const closeWatcher = (): void => {
        if (closed) {
          return;
        }
        closed = true;
        for (const timer of pendingReloads.values()) {
          clearTimeout(timer);
        }
        pendingReloads.clear();
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
          cardsTomlPath: path.join(__dirname, "data", "cards.toml"),
          nameHistoryTomlPaths: [path.join(__dirname, "data", "cards.toml")],
          statePath: imageViewerStatePath,
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
      server.middlewares.use(
        createCardImageApiMiddleware({ rootDir: __dirname }),
      );
    },
  };
}

/** Vite plugin that serves the saved-journey read/write endpoints. */
function savedJourneysApiPlugin(): Plugin {
  return {
    name: "saved-journeys-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        createSavedJourneysApiMiddleware({ rootDir: __dirname }),
      );
    },
  };
}

/**
 * Dev-only Vite plugin that hot-reloads card data into the running browser when
 * `data/cards.toml` is edited. The dev watcher ignores the TOML
 * directory (see `server.watch.ignored`), so a TOML save normally has no effect
 * on the page; this plugin watches the file directly with `fs.watch`, and on
 * change:
 *
 *   1. Regenerates both runtime card JSON catalogs (`public/card-data.json` and
 *      `public/cards_v2-data.json`) via {@link regenerateCardData}, reusing the
 *      exact TOML->JSON transform `setup-assets` uses (no duplication). The
 *      writes are synchronous, so the fresh JSON is fully on disk before step 2.
 *   2. Emits a `card-data:changed` custom HMR event. Only the battle/journey app
 *      reloads on it (see src/main.tsx); the editor pages register no handler,
 *      so a card editor save does not reload the page and close an open art
 *      editor or discard an inline edit. Journey/battle state lives in the
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
  const cardTomlPath = path.resolve(path.join(__dirname, "data", "cards.toml"));
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
            "[card-data] cards.toml changed -> regenerated card JSON -> notifying running app",
          );
          // Targeted custom event rather than a full reload: only the running
          // battle/journey app reloads to pick up the edit (see
          // `card-data:changed` in src/main.tsx), so saving in the card editor
          // does not reload the page and close an open art editor.
          server.ws.send({ type: "custom", event: "card-data:changed" });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`[card-data] hot reload failed: ${message}`);
          server.ws.send({
            type: "error",
            err: {
              message: "Failed to regenerate card data from cards.toml",
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
  const suppressedHotUpdatePaths = new Set([
    ...cardEditorSourceWatchPaths,
    ...generatedCardDataWatchPaths,
  ]);

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

      const watchers = Array.from(
        watchedDirectories,
        ([directory, filenames]) =>
          fs.watch(directory, { persistent: false }, (_eventType, filename) => {
            if (filename === null) {
              scheduleCheck();
              return;
            }

            if (filenames.has(filename.toString())) {
              scheduleCheck();
            }
          }),
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
      const filePath = path.resolve(context.file);
      if (!suppressedHotUpdatePaths.has(filePath)) {
        return undefined;
      }

      if (isWatchedCardDataPath(filePath)) {
        reportCheckResult(runCheck(), context.server);
      }
      return [];
    },
  };
}

/**
 * Build-time guard that fails a production build when any required Firebase
 * config env var is empty. The deployed app defaults to the realtime database
 * (see `parseDatabaseMode` in src/runtime/runtime-config.ts), which reads these
 * values at runtime. `.env` is gitignored, so a build from a checkout, worktree,
 * or CI runner that lacks it would otherwise silently ship a config-less bundle
 * that throws "Missing Firebase config" in production. Failing the build here
 * turns that into an immediate, obvious error before anything is deployed.
 *
 * `apply: "build"` scopes it to `vite build`; the dev server and tests skip it,
 * and it only enforces in production builds (not a `--mode development` build).
 */
function firebaseConfigGuardPlugin(): Plugin {
  const requiredKeys = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_DATABASE_URL",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_APP_ID",
  ];

  return {
    name: "firebase-config-guard",
    apply: "build",
    configResolved(resolved) {
      if (!resolved.isProduction) {
        return;
      }

      const missing = requiredKeys.filter((key) => {
        const value = resolved.env[key];
        return typeof value !== "string" || value.trim() === "";
      });

      if (missing.length > 0) {
        throw new Error(
          `Production build is missing required Firebase config env vars: ` +
            `${missing.join(", ")}. These are read from .env, which is ` +
            `gitignored, so a fresh checkout/worktree/CI runner will not have ` +
            `them. Populate .env before building or deploying (see AGENTS.md ` +
            `"Deploy").`,
        );
      }
    },
  };
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_BUILD_GIT_SHA": JSON.stringify(buildGitSha),
    __BUILD_HASH__: JSON.stringify(buildHash),
  },
  plugins: [
    firebaseConfigGuardPlugin(),
    gameDataRonPlugin(),
    react(),
    tailwindcss(),
    journeyLogPlugin(),
    cardEditorApiPlugin(),
    explorationEditorApiPlugin(),
    dreamsignEditorApiPlugin(),
    glossaryEditorApiPlugin(),
    glossaryDataHotReloadPlugin(),
    dreamAvatarEditorApiPlugin(),
    tidesEditorApiPlugin(),
    dreamscapeEditorApiPlugin(),
    figmentEditorApiPlugin(),
    figmentDataHotReloadPlugin(),
    dreamwellEditorApiPlugin(),
    tutorialEditorApiPlugin(),
    dreamwellDataHotReloadPlugin(),
    imageViewerApiPlugin(),
    cardImageApiPlugin(),
    savedJourneysApiPlugin(),
    cardDataHotReloadPlugin(),
    configDataHotReloadPlugin(),
    generatedCardDataDriftPlugin(),
  ],
  server: {
    watch: {
      // Card editor transactions validate edits in temporary game-data trees,
      // publish the canonical Cards RON sources, and regenerate compatibility
      // TOML plus the public card JSON catalogs. The dedicated RON/card-data
      // watchers validate those writes and emit targeted custom events. Keeping
      // the transaction workspace and outputs out of Vite's generic watcher
      // preserves the open editor and any in-progress local state.
      //
      // Git worktrees live under .worktrees and .claude/worktrees inside the
      // project root, so they fall within the watched tree. Each checkout
      // writes a full repo copy (including a tsconfig.json), and Vite forces a
      // full reload on any tsconfig change. Ignoring these directories keeps
      // creating a worktree from reloading the dev server.
      ignored: [
        generatedDataTomlWatchPattern,
        imageViewerStatePath,
        // Exploration editor saves update canonical templates and regenerate
        // the public runtime catalog. Its targeted websocket event refreshes
        // journey pages while the editor keeps its in-progress UI state.
        path.resolve(path.join(__dirname, "public", "exploration-data.json")),
        // Saving a journey writes a JSON file here; ignore it so the save does
        // not trigger a full page reload that would close the debug overlay.
        path.resolve(path.join(__dirname, "saved-journeys")) + "/**",
        path.resolve(path.join(__dirname, ".worktrees")) + "/**",
        path.resolve(path.join(__dirname, ".claude", "worktrees")) + "/**",
        ...gameDataPipelineWatchPatterns,
        // The DreamAvatar and tides editors write the canonical tide catalogs and
        // regenerate the public DreamAvatar/tides JSON catalogs on every save.
        // These files are otherwise watched; ignoring them keeps a
        // dream-avatar-editor save from reloading the page mid-edit.
        path.resolve(path.join(__dirname, "data", "tides.ron")),
        path.resolve(path.join(__dirname, "data", "dream_avatars.ron")),
        path.resolve(
          path.join(__dirname, "public", "dream-avatars-v2-data.json"),
        ),
        path.resolve(path.join(__dirname, "public", "tides4-data.json")),
        // The Dreamwell editor regenerates public/dreamwell-data.json on every
        // save; ignore it so an editor save does not trigger a full page reload
        // that closes the open card editor mid-edit.
        path.resolve(path.join(__dirname, "public", "dreamwell-data.json")),
        ...cardEditorSourceWatchPaths,
        ...generatedCardDataWatchPaths,
        // The Dream Atlas content catalogs (atlas, dreamscapes,
        // dream_guides, affiliations, and apollyon_incarnations)
        // are regenerated under public/ on every matching TOML save by
        // configDataHotReloadPlugin, which sends a targeted config-data:changed
        // event; ignore the outputs so the write does not also trigger Vite's
        // own full-page reload.
        ...generatedConfigDataWatchPaths({ rootDir: __dirname }).map((p) =>
          path.resolve(p),
        ),
      ],
    },
  },
});
