/**
 * Pricing for transfigurations.
 *
 * Reforging a card at a Transfiguration site costs essence. The price scales
 * with the *magnitude* of the change — shaving four energy off a card or
 * doubling a five-spark character costs far more than trimming a single energy
 * or nudging a number up by one — and carries a little seeded randomness so two
 * visits to the same form do not always quote the same price.
 *
 * The authored economy configuration supplies the global bounds, discrete step,
 * form bands, and magnitude bands. Hastened and kindling a zero-spark character
 * select the compiler-validated zero-cost band. The algorithm owns form-to-band
 * selection and deterministic sampling; the TOML owns all numeric tuning.
 *
 * The jitter is drawn from a deterministic per-visit stream salted by the journey
 * seed, the site id, the deck entry, and the form, so a given form's price is
 * stable for the whole visit and reproducible from the logged inputs.
 */

import type { CardData } from "../types/cards";
import type { TransfigurationType } from "../types/journey";
import type {
  TransfigurationCostBand,
  TransfigurationData,
} from "../types/transfiguration-data";
import { merchantRng } from "../journey_v2/signals/rng";
import { transfigurationForm } from "../data/transfiguration-data";
import { transfigurationMechanic } from "./transfiguration-logic";
import type { SiteId } from "../types/identifiers";
import type { DeckEntryId } from "../types/identifiers";

/** Lowest and highest essence a transfiguration can ever cost. */
function clampCost(data: TransfigurationData, value: number): number {
  return Math.max(
    data.site.pricing.minimumCost,
    Math.min(data.site.pricing.maximumCost, value),
  );
}

/** Resolves a magnitude to the compiler-validated stat-delta band table. */
function statBand(
  data: TransfigurationData,
  delta: number,
): TransfigurationCostBand {
  const band = data.site.pricing.statDeltaBands.find(
    (candidate) =>
      delta >= candidate.minimumDelta &&
      (candidate.maximumDelta === undefined || delta <= candidate.maximumDelta),
  );
  if (band === undefined)
    throw new Error(
      `Missing Transfiguration stat-delta band for ${String(delta)}`,
    );
  return band.band;
}

/**
 * The price band for transfiguring `card` into the given `type`, before the
 * seeded jitter is drawn. Magnitude is read straight off the card so the same
 * change always lands in the same band.
 */
export function transfigurationCostBand(
  data: TransfigurationData,
  card: CardData,
  type: TransfigurationType,
): TransfigurationCostBand {
  const form = transfigurationForm(data, type);
  switch (form.pricing.kind) {
    case "free":
      return { base: 0, jitter: 0, floor: 0 };
    case "band":
      return form.pricing;
    case "statDelta": {
      const operation = transfigurationMechanic(type).operation;
      if (operation.kind === "halveEnergyCost") {
        const energyCost = card.energyCost ?? 0;
        if (energyCost <= 0) return { base: 0, jitter: 0, floor: 0 };
        const delta = energyCost - Math.floor(energyCost / 2);
        return statBand(data, delta);
      }
      if (operation.kind !== "doubleSpark")
        throw new Error(`Invalid stat-delta form ${type}`);
      const oldSpark = card.spark ?? 0;
      if (oldSpark === 0) return { base: 0, jitter: 0, floor: 0 };
      return statBand(data, oldSpark);
    }
  }
}

/**
 * Draws the jittered cost for a band from a uniform `[0, 1)` stream. Picks one
 * of the discrete `±jitter` steps (in authored increments) uniformly, adds it to
 * the base, then clamps to the authored global bounds. A zero-jitter band returns its base
 * unchanged without consuming a draw.
 */
export function rollTransfigurationCost(
  data: TransfigurationData,
  band: TransfigurationCostBand,
  rng: () => number,
): number {
  if (band.jitter <= 0) {
    return clampCost(data, band.base);
  }
  const stepCount = (band.jitter / data.site.pricing.step) * 2 + 1;
  const stepIndex = Math.min(Math.floor(rng() * stepCount), stepCount - 1);
  const offset =
    (stepIndex - band.jitter / data.site.pricing.step) * data.site.pricing.step;
  return clampCost(data, Math.max(band.floor, band.base + offset));
}

/**
 * The essence cost to transfigure a specific deck entry into a specific form on
 * a specific site visit. Deterministic: the same `(seed, siteId, entryId, type,
 * card)` always quotes the same price, so the cost shown to the player matches
 * the cost charged on accept and can be reconstructed from the logs.
 */
export function transfigurationEssenceCost(
  data: TransfigurationData,
  seed: string,
  siteId: SiteId,
  entryId: DeckEntryId,
  card: CardData,
  type: TransfigurationType,
): number {
  const band = transfigurationCostBand(data, card, type);
  const rng = merchantRng(seed, siteId, entryId, type, "transfiguration_cost");
  return rollTransfigurationCost(data, band, rng);
}
