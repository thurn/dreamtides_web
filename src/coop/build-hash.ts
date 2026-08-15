/**
 * The source-and-runtime-content identity injected at build time by the
 * `__BUILD_HASH__` Vite `define` (see vite.config.ts). Declared here so
 * TypeScript knows the global exists in application code.
 */
declare global {
  const __BUILD_HASH__: string;
}

declare const buildHashBrand: unique symbol;

export type BuildHash = string & {
  readonly [buildHashBrand]: "BuildHash";
};

const BUILD_HASH_PATTERN = /^(?:test|[a-z0-9]+-[0-9a-f]{12})$/u;

export function isBuildHash(value: unknown): value is BuildHash {
  return typeof value === "string" && BUILD_HASH_PATTERN.test(value);
}

export function parseBuildHash(value: unknown): BuildHash {
  if (!isBuildHash(value)) {
    throw new Error("Build hash has an invalid format.");
  }
  return value;
}

/**
 * Returns the exact build identity of the currently running client for
 * diagnostics. Reducer compatibility is versioned separately in
 * `reducer-version.ts`.
 *
 * Under vitest the Vite `define` is not applied, so `__BUILD_HASH__` is
 * undefined; we fall back to `"test"` there.
 */
export function getBuildHash(): BuildHash {
  return parseBuildHash(
    typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "test",
  );
}
