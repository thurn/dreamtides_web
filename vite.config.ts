import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";
import { createSavedJourneysApiMiddleware } from "./scripts/saved-journeys-api.mjs";
import { resolveBuildHash } from "./scripts/build-hash.mjs";
import {
  parseBuildGitSha,
  type BuildGitRevision,
} from "./src/types/build-identity.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildGitSha = resolveBuildGitSha();
const buildHash = resolveBuildHash(__dirname);

function resolveBuildGitSha(): BuildGitRevision {
  try {
    return parseBuildGitSha(
      execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
        cwd: __dirname,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    return "unknown";
  }
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
    react(),
    tailwindcss(),
    journeyLogPlugin(),
    savedJourneysApiPlugin(),
  ],
  server: {
    watch: {
      // Git worktrees live under .worktrees and .claude/worktrees inside the
      // project root, so they fall within the watched tree. Each checkout
      // writes a full repo copy (including a tsconfig.json), and Vite forces a
      // full reload on any tsconfig change. Ignoring these directories keeps
      // creating a worktree from reloading the dev server.
      ignored: [
        // Saving a journey writes a JSON file here; ignore it so the save does
        // not trigger a full page reload that would close the debug overlay.
        path.resolve(path.join(__dirname, "saved-journeys")) + "/**",
        path.resolve(path.join(__dirname, ".worktrees")) + "/**",
        path.resolve(path.join(__dirname, ".claude", "worktrees")) + "/**",
      ],
    },
  },
});
