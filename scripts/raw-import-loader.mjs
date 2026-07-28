import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Node loader hook for Vite-style `?raw` imports used by command-line scripts
 * whose import graph reaches browser data modules.
 */
export async function load(url, context, nextLoad) {
  const parsed = new URL(url);
  if (parsed.protocol !== "file:" || parsed.searchParams.has("raw") === false) {
    return nextLoad(url, context);
  }

  const source = await readFile(fileURLToPath(parsed), "utf8");
  return {
    format: "module",
    shortCircuit: true,
    source: `export default ${JSON.stringify(source)};`,
  };
}
