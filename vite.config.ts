import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

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

export default defineConfig({
  plugins: [react(), tailwindcss(), questLogPlugin()],
  test: {
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
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
