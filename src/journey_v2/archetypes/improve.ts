import type { CardData } from "../../types/cards";
import type { TransfigurationType } from "../../types/quest";

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * The single source of truth for the v3 transfiguration benefit table.
 *
 * Benefit is mechanical where the effect is numeric (Viridian halves an energy
 * cost, Scarlet doubles a character's spark) and a flat constant where the
 * effect is textual. `preview` is the result of
 * `applyTransfigurationToCard(card, transfiguration)`; the mechanical types read
 * the before/after fields off `card` and `preview` so they never re-derive the
 * transfiguration math.
 *
 * Consumed by both the `transfigured_draft` grant archetype and the improve
 * archetypes (`transfigure`, `starter_transfigure`) added in later tasks.
 */
export function transfigurationBenefit(
  card: CardData,
  transfiguration: TransfigurationType,
  preview: CardData,
): number {
  switch (transfiguration) {
    case "Viridian": {
      const oldCost = card.energyCost ?? 0;
      const newCost = preview.energyCost ?? 0;
      return clamp01((oldCost - newCost) / 2);
    }
    case "Scarlet": {
      const oldSpark = card.spark ?? 0;
      const newSpark = preview.spark ?? 0;
      return clamp01((newSpark - oldSpark) / 4);
    }
    case "Golden":
      return 0.4;
    case "Azure":
      return 0.55;
    case "Bronze":
      return 0.55;
    case "Magenta":
      return 0.5;
    case "Rose":
      return 0.5;
    case "Prismatic":
      return 0.65;
  }
}
