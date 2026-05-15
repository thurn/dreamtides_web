/**
 * Generates a stable seed for a Dream Journey based on the site and quest state.
 * The seed is used to initialize the RNG for deterministic journey generation.
 *
 * Future tasks will implement the real seed generation logic using labeled-hash RNG.
 */
export function journeySeedForSite(
  _site: unknown,
  _questState: unknown
): string {
  return "placeholder-seed";
}
