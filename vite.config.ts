import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";
import {
  parseBuildGitSha,
  type BuildGitRevision,
} from "./src/types/build-identity.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildGitSha = resolveBuildGitSha();

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

/**
 * Source modules compiled only into development builds (P7): the QA scenes,
 * the prompt-lab and card-lab, the engine's test tooling, the engine debug
 * actions, and the battle screen's debug panel. Development builds load them
 * behind `import.meta.env.DEV` (`src/runtime/qa-scene-entry.ts`,
 * `src/engine/development.ts`, `EngineBattleScreen`).
 */
const DEV_ONLY_MODULES = [
  "src/engine/testing/",
  "src/engine/debug/",
  "src/runtime/qa-scenes.ts",
  "src/runtime/qa-journey-foundation.ts",
  "src/battle/components/EngineDebugPanel.tsx",
];

/**
 * Fails a production build, the app's or the policy worker's, whose chunks
 * render any development-only module: the production bundle assertion that
 * `npm run review:full` and every `--prod` QA run make.
 */
function devOnlyModulesPlugin(): Plugin {
  let production = false;
  return {
    name: "dev-only-modules",
    apply: "build",
    configResolved(config) {
      production = config.isProduction;
    },
    generateBundle(_options, bundle) {
      if (!production) return;
      const leaked = Object.values(bundle).flatMap((output) =>
        output.type !== "chunk"
          ? []
          : Object.entries(output.modules)
              .filter(([id, module]) => {
                const file = path.relative(__dirname, id.split("?")[0] ?? id);
                return module.renderedLength > 0 && DEV_ONLY_MODULES.some((prefix) => file.startsWith(prefix));
              })
              .map(([id]) => `${output.fileName}: ${path.relative(__dirname, id)}`),
      );
      if (leaked.length > 0) {
        this.error(`The production bundle holds development-only modules (P7):\n${leaked.join("\n")}`);
      }
    },
  };
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_BUILD_GIT_SHA": JSON.stringify(buildGitSha),
  },
  plugins: [
    react(),
    tailwindcss(),
    journeyLogPlugin(),
    devOnlyModulesPlugin(),
  ],
  // The AI's policy worker (src/battle/engine-ai/policy.worker.ts) is an ES
  // module worker, so its chunks can share the app's code-split modules.
  worker: {
    format: "es",
    plugins: () => [devOnlyModulesPlugin()],
  },
  server: {
    watch: {
      // Git worktrees live under .worktrees and .claude/worktrees inside the
      // project root, so they fall within the watched tree. Each checkout
      // writes a full repo copy (including a tsconfig.json), and Vite forces a
      // full reload on any tsconfig change. Ignoring these directories keeps
      // creating a worktree from reloading the dev server.
      ignored: [
        path.resolve(path.join(__dirname, ".worktrees")) + "/**",
        path.resolve(path.join(__dirname, ".claude", "worktrees")) + "/**",
      ],
    },
  },
});
