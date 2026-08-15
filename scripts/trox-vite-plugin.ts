import path from "node:path";
import type { Plugin } from "vite";
import { buildDevelopmentTroxBundles } from "./trox-source-workspace.mjs";

const virtualTroxBundlesId = "virtual:trox-bundles";
const resolvedVirtualTroxBundlesId = `\0${virtualTroxBundlesId}`;

export function troxDevelopmentBundlesPlugin(options: {
  buildBundles?: typeof buildDevelopmentTroxBundles;
  rootDir?: string;
  debounceMs?: number;
} = {}): Plugin {
  const rootDir = options.rootDir ?? path.resolve(import.meta.dirname, "..");
  const buildBundles = options.buildBundles ?? buildDevelopmentTroxBundles;
  const debounceMs = options.debounceMs ?? 200;
  let bundles: ReturnType<typeof buildDevelopmentTroxBundles> | null = null;
  return {
    name: "trox-development-bundles",
    resolveId(id) {
      return id === virtualTroxBundlesId ? resolvedVirtualTroxBundlesId : null;
    },
    load(id) {
      if (id !== resolvedVirtualTroxBundlesId) return null;
      bundles ??= buildBundles({ root: rootDir });
      return [
        `export const enUSBundleJSON = ${JSON.stringify(bundles["en-US"])};`,
        `export const arBundleJSON = ${JSON.stringify(bundles.ar)};`,
        `export const esBundleJSON = ${JSON.stringify(bundles.es)};`,
        `export const jaBundleJSON = ${JSON.stringify(bundles.ja)};`,
        `export const ruBundleJSON = ${JSON.stringify(bundles.ru)};`,
      ].join("\n");
    },
    configureServer(server) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const localizationInput = (changedPath: string): boolean => {
        const relative = path.relative(rootDir, changedPath);
        return (
          relative === "trox.ron" ||
          relative === "localization/terms.ron" ||
          relative.startsWith(`localization${path.sep}qa${path.sep}`) ||
          (relative.startsWith(`data${path.sep}`) && relative.endsWith(".ron")) ||
          (relative.startsWith(`src${path.sep}`) && /\.tsx?$/u.test(relative) &&
            !/\.(test|spec)\.tsx?$/u.test(relative) &&
            !relative.startsWith(`src${path.sep}generated${path.sep}`))
        );
      };
      const scheduleRefresh = (changedPath: string): void => {
        if (!localizationInput(changedPath)) return;
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = undefined;
          try {
            bundles = buildBundles({ root: rootDir });
            const module = server.moduleGraph.getModuleById(resolvedVirtualTroxBundlesId);
            if (module !== undefined) server.moduleGraph.invalidateModule(module);
            server.ws.send({ type: "full-reload" });
            console.log("[trox] refreshed ephemeral development bundles");
          } catch (error) {
            console.error(`[trox] development bundle refresh failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }, debounceMs);
      };
      server.watcher.on("add", scheduleRefresh);
      server.watcher.on("change", scheduleRefresh);
      server.httpServer?.once("close", () => {
        if (timer !== undefined) clearTimeout(timer);
      });
    },
  };
}
