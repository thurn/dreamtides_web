/**
 * The source-and-runtime-content identity injected at build time by the
 * `__BUILD_HASH__` Vite `define` (see vite.config.ts). Declared here so
 * TypeScript knows the global exists in application code.
 */
declare global {
  const __BUILD_HASH__: string;
}

/**
 * Returns the exact build identity of the currently running client for
 * diagnostics. Reducer compatibility is versioned separately in
 * `reducer-version.ts`.
 *
 * Under vitest the Vite `define` is not applied, so `__BUILD_HASH__` is
 * undefined; we fall back to `"test"` there.
 */
export function getBuildHash(): string {
  return typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "test";
}
