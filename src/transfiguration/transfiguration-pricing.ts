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
import type { EconomyData, TransfigurationCostBand } from "../types/economy-data";
import { merchantRng } from "../journey_v2/signals/rng";

/** Lowest and highest essence a transfiguration can ever cost. */
function clampCost(config: EconomyData["transfiguration"], value: number): number {
  return Math.max(config.minimumCost, Math.min(config.maximumCost, value));
}

/** Resolves a magnitude to the compiler-validated stat-delta band table. */
function statBand(config: EconomyData["transfiguration"], delta: number): TransfigurationCostBand {
  return config.statDeltaBands.find((band) => delta >= band.minimumDelta && (band.maximumDelta === null || delta <= band.maximumDelta))!;
}

/**
 * The price band for transfiguring `card` into the given `type`, before the
 * seeded jitter is drawn. Magnitude is read straight off the card so the same
 * change always lands in the same band.
 */
export function transfigurationCostBand(
  config: EconomyData["transfiguration"],
  card: CardData,
  type: TransfigurationType,
): TransfigurationCostBand {
  switch (type) {
    case "Hastened":
      return config.freeBand;
    case "Empowered": {
      const energyCost = card.energyCost ?? 0;
      if (energyCost <= 0) {
        return config.freeBand;
      }
      const delta = energyCost - Math.floor(energyCost / 2);
      return statBand(config, delta);
    }
    case "Kindled": {
      const oldSpark = card.spark ?? 0;
      // Kindling a 0-spark character up to 1 is the gentlest nudge — free.
      if (oldSpark === 0) {
        return config.freeBand;
      }
      const delta = oldSpark; // doubling adds `oldSpark` spark.
      return statBand(config, delta);
    }
    default:
      return config.formBands[type];
  }
}

/**
 * Draws the jittered cost for a band from a uniform `[0, 1)` stream. Picks one
 * of the discrete `±jitter` steps (in authored increments) uniformly, adds it to
 * the base, then clamps to the authored global bounds. A zero-jitter band returns its base
 * unchanged without consuming a draw.
 */
export function rollTransfigurationCost(
  config: EconomyData["transfiguration"],
  band: TransfigurationCostBand,
  rng: () => number,
): number {
  if (band.jitter <= 0) {
    return clampCost(config, band.base);
  }
  const stepCount = (band.jitter / config.step) * 2 + 1;
  const stepIndex = Math.min(Math.floor(rng() * stepCount), stepCount - 1);
  const offset = (stepIndex - band.jitter / config.step) * config.step;
  return clampCost(config, Math.max(band.floor, band.base + offset));
}

/**
 * The essence cost to transfigure a specific deck entry into a specific form on
 * a specific site visit. Deterministic: the same `(seed, siteId, entryId, type,
 * card)` always quotes the same price, so the cost shown to the player matches
 * the cost charged on accept and can be reconstructed from the logs.
 */
export function transfigurationEssenceCost(
  config: EconomyData["transfiguration"],
  seed: string,
  siteId: string,
  entryId: string,
  card: CardData,
  type: TransfigurationType,
): number {
  const band = transfigurationCostBand(config, card, type);
  const rng = merchantRng(seed, siteId, entryId, type, "transfiguration_cost");
  return rollTransfigurationCost(config, band, rng);
}
