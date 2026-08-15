declare const stableDigestBrand: unique symbol;

/** Canonical lowercase SHA-256 digest of a stable projection. */
export type StableDigest = string & {
  readonly [stableDigestBrand]: "StableDigest";
};

const STABLE_DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

export function isStableDigest(value: unknown): value is StableDigest {
  return typeof value === "string" && STABLE_DIGEST_PATTERN.test(value);
}

export function parseStableDigest(
  value: unknown,
  label = "stable digest",
): StableDigest {
  if (!isStableDigest(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}
