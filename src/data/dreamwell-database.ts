/**
 * The shared Dreamwell cards drawn one per turn during the Dreamwell phase
 * (docs/battle_rules/battle_rules.md). The catalog is generated from
 * `data/tabula/dreamwell.toml` by `scripts/setup-assets.mjs` and served at
 * `/dreamwell-data.json`.
 */
export interface DreamwellCard {
  /** Stable UUID identity. Cards are referenced by id, never by name. */
  id: string;
  name: string;
  /** Rules text with the same symbol/glossary markup as regular cards. */
  renderedText: string;
  /**
   * Position in the Dreamwell deck (0-4). Order-0 cards are the per-player
   * starting cards and appear only in the first cycle; #1 cards shuffle above
   * #2, and so on (rules §The Dreamwell and Energy).
   */
  order: number;
  /** Energy permanently added to the drawing player's maximum ● (may be 0). */
  energyAdded: number;
  /** Catalog ordinal. */
  cardNumber: number;
  /** Art key for `/cards/<imageNumber>.webp`; 0/absent renders an identicon. */
  imageNumber?: number;
  cardType?: string;
  artOwned?: boolean;
}

const DREAMWELL_JSON_PATH = "/dreamwell-data.json";

/**
 * Fetches the Dreamwell catalog generated from `dreamwell.toml`. Returns the
 * cards in their authored TOML order; the battle deck builder
 * (`buildDreamwellDeck`) groups and shuffles them by `order` at battle init.
 */
export async function loadDreamwellCards(): Promise<DreamwellCard[]> {
  const response = await fetch(DREAMWELL_JSON_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load Dreamwell data: ${String(response.status)} ${response.statusText}`,
    );
  }
  return (await response.json()) as DreamwellCard[];
}
