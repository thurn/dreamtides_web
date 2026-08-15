declare const journeySeedBrand: unique symbol;

/** Stable entropy chosen once for a room/run and reused by every deterministic generator. */
export type JourneySeed = string & {
  readonly [journeySeedBrand]: "JourneySeed";
};

export function parseJourneySeed(value: unknown): JourneySeed {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Journey seed must be a non-empty string.");
  }
  return value as JourneySeed;
}

export function journeySeedFromUnknown(value: unknown): JourneySeed | null {
  try {
    return parseJourneySeed(value);
  } catch {
    return null;
  }
}
