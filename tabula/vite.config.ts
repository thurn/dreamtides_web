import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: resolve(__dirname, "../public"),
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: 1420, strictPort: true, fs: { allow: [resolve(__dirname, "..")] } },
  clearScreen: false,
});
