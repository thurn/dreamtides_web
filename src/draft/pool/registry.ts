import { DEFAULT_POOL_VARIANT, type PoolVariant } from "./types.ts";

export const POOL_VARIANT_IDS: readonly PoolVariant[] = ["tides4"];

export function isPoolVariant(value: unknown): value is PoolVariant {
  return value === "tides4";
}

/** Resolve an optional configured value to the production draft-pool strategy. */
export function resolvePoolVariant(value: unknown): PoolVariant {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_POOL_VARIANT;
  }
  if (!isPoolVariant(value)) {
    throw new Error(
      `Unrecognized draft-pool variant: ${JSON.stringify(value)}. ` +
        "Valid variant: tides4.",
    );
  }
  return value;
}
