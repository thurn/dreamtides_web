declare const contentHashBrand: unique symbol;
declare const foldHashBrand: unique symbol;

/** SHA-256 digest of a complete generated content artifact. */
export type ContentHash = string & {
  readonly [contentHashBrand]: "ContentHash";
};

/** SHA-256 digest of the subset of content that affects deterministic folding. */
export type FoldHash = string & {
  readonly [foldHashBrand]: "FoldHash";
};

const SHA256_HEX = /^[0-9a-f]{64}$/u;

export function parseContentHash(value: unknown): ContentHash {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    throw new Error("Content hash must be a lowercase SHA-256 digest.");
  }
  return value as ContentHash;
}

export function parseFoldHash(value: unknown): FoldHash {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    throw new Error("Fold hash must be a lowercase SHA-256 digest.");
  }
  return value as FoldHash;
}
