import type { ArtCrop } from "../types/cards";
import { parseDreamwellCardId, type DreamwellCardId } from "../types/identifiers";
import {
  parseDreamwellCardName,
  type DreamwellCardName,
} from "../types/catalog-names";

/**
 * The shared Dreamwell cards drawn one per turn during the Dreamwell phase
 * (docs/battle_rules/battle_rules.md). The catalog is generated from
 * canonical `data/dreamwell.ron` through the generated compatibility catalog
 * `data/dreamwell.toml`, then served at `/dreamwell-data.json`.
 */
export interface DreamwellCard {
  /** Stable UUID identity. Cards are referenced by id, never by name. */
  id: DreamwellCardId;
  name: DreamwellCardName;
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
  /** Curated pan/zoom crop framing the art; absent until the card is framed. */
  art?: ArtCrop;
  cardType?: "Dreamwell";
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
  return parseDreamwellCards(await response.json());
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function artCropFromUnknown(value: unknown): ArtCrop | null {
  if (
    !record(value) ||
    typeof value.x !== "number" ||
    !Number.isFinite(value.x) ||
    typeof value.y !== "number" ||
    !Number.isFinite(value.y) ||
    typeof value.scale !== "number" ||
    !Number.isFinite(value.scale)
  ) return null;
  return { x: value.x, y: value.y, scale: value.scale };
}

/** Validate the generated Dreamwell payload before it enters journey content. */
export function parseDreamwellCards(value: unknown): DreamwellCard[] {
  if (!Array.isArray(value)) throw new Error("Dreamwell data must be an array");
  return value.map((candidate, cardIndex) => {
    if (
      !record(candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.name !== "string" ||
      typeof candidate.renderedText !== "string" ||
      typeof candidate.order !== "number" ||
      typeof candidate.energyAdded !== "number" ||
      typeof candidate.cardNumber !== "number"
    ) {
      throw new Error(`Dreamwell card ${String(cardIndex + 1)} is malformed`);
    }
    const cardId = parseDreamwellCardId(candidate.id);
    const art = candidate.art === undefined ? undefined : artCropFromUnknown(candidate.art);
    if (
      candidate.imageNumber !== undefined &&
        (typeof candidate.imageNumber !== "number" ||
          !Number.isInteger(candidate.imageNumber)) ||
      art === null ||
      candidate.cardType !== undefined && candidate.cardType !== "Dreamwell" ||
      candidate.artOwned !== undefined && typeof candidate.artOwned !== "boolean"
    ) {
      throw new Error(`Dreamwell card ${cardId} is malformed`);
    }
    return {
      id: cardId,
      name: parseDreamwellCardName(candidate.name),
      renderedText: candidate.renderedText,
      order: candidate.order,
      energyAdded: candidate.energyAdded,
      cardNumber: candidate.cardNumber,
      ...(candidate.imageNumber === undefined
        ? {}
        : { imageNumber: candidate.imageNumber }),
      ...(art === undefined ? {} : { art }),
      ...(candidate.cardType === undefined
        ? {}
        : { cardType: candidate.cardType }),
      ...(candidate.artOwned === undefined
        ? {}
        : { artOwned: candidate.artOwned }),
    };
  });
}
