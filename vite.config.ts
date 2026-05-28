import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { createCardEditorApiMiddleware } from "./scripts/card-editor-api.mjs";
import { checkGeneratedCardData } from "./scripts/generated-card-data-drift.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

/** Vite plugin that detects stale generated card data during development. */
function generatedCardDataDriftPlugin(): Plugin {
  const watchedPaths = new Set([
    path.join(__dirname, "data", "tabula", "rendered-cards.toml"),
    path.join(__dirname, "public", "card-data.json"),
  ].map((filePath) => path.resolve(filePath)));

  const runCheck = (): ReturnType<typeof checkGeneratedCardData> =>
    checkGeneratedCardData({ rootDir: __dirname });

  return {
    name: "generated-card-data-drift-guard",
    apply: "serve",
    configureServer(server) {
      for (const watchedPath of watchedPaths) {
        server.watcher.add(watchedPath);
      }

      const initialResult = runCheck();
      if (!initialResult.ok) {
        throw new Error(initialResult.message);
      }
      console.info(`[card-data] ${initialResult.message}`);

      server.watcher.on("change", (changedPath) => {
        if (!watchedPaths.has(path.resolve(changedPath))) {
          return;
        }

        const result = runCheck();
        if (result.ok) {
          console.info(`[card-data] ${result.message}`);
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
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    questLogPlugin(),
    cardEditorApiPlugin(),
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
});
