/**
 * Pricing for transfigurations.
 *
 * Reforging a card at a Transfiguration site costs essence. The price scales
 * with the *magnitude* of the change — shaving four energy off a card or
 * doubling a five-spark character costs far more than trimming a single energy
 * or nudging a number up by one — and carries a little seeded randomness so two
 * visits to the same form do not always quote the same price.
 *
 * Every quoted cost is a multiple of 10 in the range `[0, 100]`. The cheapest
 * forms are free: granting Fast, or kindling a 0-spark character up to 1 spark,
 * never costs anything. Single-step numeric tweaks (−1 energy, +1 to a number,
 * −1 to an activated ability) sit at a small floor of 10. Keyword adds split by
 * weight: drawing a card is fairly cheap, while Reclaim and a widened trigger
 * are pricier and quoted from a wider 20–80 band. Stat changes climb with the
 * size of the delta:
 *
 * | Form / magnitude                     | Base | Jitter | Quoted range |
 * | ------------------------------------ | ---- | ------ | ------------ |
 * | Hastened (Fast)                      |   0  |   —    |      0       |
 * | Kindled, 0 → 1 spark                 |   0  |   —    |      0       |
 * | Amplified (+1 number)                |  10  |  ±20   |    10–30     |
 * | Attuned (−1 ability cost)            |  10  |  ±20   |    10–30     |
 * | Inspired (Draw a card)               |  20  |  ±20   |    10–40     |
 * | Empowered / Kindled, delta 1         |  10  |  ±20   |    10–30     |
 * | Empowered / Kindled, delta 2         |  30  |  ±20   |    10–50     |
 * | Empowered / Kindled, delta 3         |  50  |  ±20   |    30–70     |
 * | Empowered / Kindled, delta ≥ 4       |  70  |  ±20   |    50–90     |
 * | Enduring (Reclaim)                   |  50  |  ±30   |    20–80     |
 * | Resonant (widened trigger)           |  50  |  ±30   |    20–80     |
 *
 * The jitter is drawn from a deterministic per-visit stream salted by the quest
 * seed, the site id, the deck entry, and the form, so a given form's price is
 * stable for the whole visit and reproducible from the logged inputs.
 */

import type { CardData } from "../types/cards";
import type { TransfigurationType } from "../types/quest";
import { merchantRng } from "../journey_v2/signals/rng";

/** Lowest and highest essence a transfiguration can ever cost. */
export const MIN_TRANSFIGURATION_COST = 0;
export const MAX_TRANSFIGURATION_COST = 100;

/**
 * The shape of a form's price before randomness is applied. `base` is the
 * anchor cost, `jitter` is the symmetric half-width added on top, and `min` is
 * the floor the jittered price is clamped up to (so a small-but-not-free form
 * never rounds down to 0). All three are multiples of 10.
 */
export interface TransfigurationCostBand {
  base: number;
  jitter: number;
  min: number;
}

function clampCost(value: number): number {
  return Math.max(
    MIN_TRANSFIGURATION_COST,
    Math.min(MAX_TRANSFIGURATION_COST, value),
  );
}

/** A free form: no base, no jitter, no floor. */
const FREE: TransfigurationCostBand = { base: 0, jitter: 0, min: 0 };

/**
 * Base anchor for a stat change of the given delta: 10, 30, 50, then 70 for any
 * delta of 4 or more. Used by both Empowered (energy removed) and Kindled
 * (spark gained).
 */
function statBase(delta: number): number {
  return Math.min(70, Math.max(1, delta) * 20 - 10);
}

/**
 * The price band for transfiguring `card` into the given `type`, before the
 * seeded jitter is drawn. Magnitude is read straight off the card so the same
 * change always lands in the same band.
 */
export function transfigurationCostBand(
  card: CardData,
  type: TransfigurationType,
): TransfigurationCostBand {
  switch (type) {
    case "Hastened":
      return FREE;
    case "Empowered": {
      const energyCost = card.energyCost ?? 0;
      if (energyCost <= 0) {
        return FREE;
      }
      const delta = energyCost - Math.floor(energyCost / 2);
      return { base: statBase(delta), jitter: 20, min: 10 };
    }
    case "Kindled": {
      const oldSpark = card.spark ?? 0;
      // Kindling a 0-spark character up to 1 is the gentlest nudge — free.
      if (oldSpark === 0) {
        return FREE;
      }
      const delta = oldSpark; // doubling adds `oldSpark` spark.
      return { base: statBase(delta), jitter: 20, min: 10 };
    }
    case "Amplified":
    case "Attuned":
      // A single-step numeric tweak: small, but not free.
      return { base: 10, jitter: 20, min: 10 };
    case "Inspired":
      // Drawing a card is fairly cheap.
      return { base: 20, jitter: 20, min: 10 };
    case "Enduring":
    case "Resonant":
      // Reclaim and a widened trigger are pricier, from a wide 20–80 band.
      return { base: 50, jitter: 30, min: 20 };
    case "Perfected":
      // Perfected is never offered as a pickable form (see
      // `offeredTransfigurationForms`); price it at the ceiling defensively.
      return { base: 100, jitter: 0, min: 100 };
  }
}

/**
 * Draws the jittered cost for a band from a uniform `[0, 1)` stream. Picks one
 * of the discrete `±jitter` steps (in increments of 10) uniformly, adds it to
 * the base, then clamps to `[min, 100]`. A zero-jitter band returns its base
 * unchanged without consuming a draw.
 */
export function rollTransfigurationCost(
  band: TransfigurationCostBand,
  rng: () => number,
): number {
  if (band.jitter <= 0) {
    return clampCost(band.base);
  }
  const stepCount = (band.jitter / 10) * 2 + 1;
  const stepIndex = Math.min(Math.floor(rng() * stepCount), stepCount - 1);
  const offset = (stepIndex - band.jitter / 10) * 10;
  return clampCost(Math.max(band.min, band.base + offset));
}

/**
 * The essence cost to transfigure a specific deck entry into a specific form on
 * a specific site visit. Deterministic: the same `(seed, siteId, entryId, type,
 * card)` always quotes the same price, so the cost shown to the player matches
 * the cost charged on accept and can be reconstructed from the logs.
 */
export function transfigurationEssenceCost(
  seed: string,
  siteId: string,
  entryId: string,
  card: CardData,
  type: TransfigurationType,
): number {
  const band = transfigurationCostBand(card, type);
  const rng = merchantRng(seed, siteId, entryId, type, "transfiguration_cost");
  return rollTransfigurationCost(band, rng);
}
