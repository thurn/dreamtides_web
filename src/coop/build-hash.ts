/**
 * The source-and-runtime-content identity injected at build time by the
 * `__BUILD_HASH__` Vite `define` (see vite.config.ts). Declared here so
 * TypeScript knows the global exists in application code.
 */
declare global {
  const __BUILD_HASH__: string;
}

/**
 * Returns the build hash of the currently running client.
 *
 * Used as the coop reducer version: `createRoom` stamps the genesis's
 * `reducerVersion` with this value, and a joining client compares it against
 * its own build to decide whether it is on a compatible build (writable) or a
 * mismatched build (read-only version gate).
 *
 * Under vitest the Vite `define` is not applied, so `__BUILD_HASH__` is
 * undefined; we fall back to `"test"` there.
 */
export function getBuildHash(): string {
  return typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "test";
}
