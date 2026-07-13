export type CardSizePreset = "small" | "medium" | "large";

const CARD_SIZE_STORAGE_KEY = "quest-prototype-card-size";

import { DRAFT_OFFER_CARD_WIDTH } from "../cumulus/components/card/card-aspect";

export { DRAFT_OFFER_CARD_WIDTH };

export const SIZE_PRESETS: Readonly<
  Record<
    CardSizePreset,
    { columns: string; cardWidth: string; gap: string; label: string }
  >
> = {
  small: {
    // FIND-01-8 (Stage 4): bump minimum small-card tile from 112px to 144px
    // so the 10px rules-text body reads at an acceptable visual size
    // without needing a cross-cutting CardDisplay typography change.
    columns: "repeat(auto-fill, minmax(144px, 1fr))",
    cardWidth: "144px",
    gap: "0.375rem",
    label: "S",
  },
  medium: {
    columns: "repeat(auto-fill, minmax(176px, 1fr))",
    cardWidth: "176px",
    gap: "0.5rem",
    label: "M",
  },
  large: {
    // Tile cards at the quest draft offer width so the "large" preset matches
    // the size players see while drafting. The track is a fixed length (no
    // `1fr`), so cards stay at the draft width instead of stretching to fill.
    columns: `repeat(auto-fill, ${DRAFT_OFFER_CARD_WIDTH})`,
    cardWidth: DRAFT_OFFER_CARD_WIDTH,
    gap: "0.75rem",
    label: "L",
  },
};

export function getPersistedCardSize(
  fallback: CardSizePreset,
): CardSizePreset {
  try {
    const stored = localStorage.getItem(CARD_SIZE_STORAGE_KEY);
    if (stored === "small" || stored === "medium" || stored === "large") {
      return stored;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function persistCardSize(size: CardSizePreset): void {
  try {
    localStorage.setItem(CARD_SIZE_STORAGE_KEY, size);
  } catch {
    return;
  }
}
