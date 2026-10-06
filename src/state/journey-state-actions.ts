import { parseJourneySeed, type JourneySeed } from "../types/journey-seed";

/**
 * Generate a fresh per-journey seed. Uses `crypto.randomUUID()` when available
 * (modern browsers, Node 19+, jsdom). Falls back to a `Math.random()`-derived
 * hex string for the rare environment without `crypto.randomUUID`. The exact
 * source does not matter for correctness — only that the value varies across
 * fresh journeys in the same browser session so the journey adapter cannot
 * collide two distinct journeys onto the same shape and dream art for a given
 * atlas site.
 */
export function generateJourneySeed(): JourneySeed {
  const cryptoCandidate: { randomUUID?: () => string } | undefined =
    typeof crypto === "undefined" ? undefined : crypto;
  if (cryptoCandidate?.randomUUID !== undefined) {
    return parseJourneySeed(cryptoCandidate.randomUUID());
  }
  const part = () =>
    Math.floor(Math.random() * 0x1_0000_0000)
      .toString(16)
      .padStart(8, "0");
  return parseJourneySeed(`${part()}${part()}${part()}${part()}`);
}
