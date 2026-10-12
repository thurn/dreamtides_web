import type { DreamsignId } from "../../types/identifiers";
import type { JourneyEssenceEffect, JourneyState } from "../../types/journey";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";

/** Project the collected amount from the immutable quote and live holdings. */
export function essenceSiteGain(
  journey: Pick<JourneyState, "dreamsigns">,
  baseAmount: number,
  registry: JourneyModifierRegistry,
): number {
  return journey.dreamsigns.reduce((amount, sign) => {
    const effect = registry.lookup(sign.id)?.journeyEssence;
    return effect?.kind === "multiplyEssenceSiteGain" ? amount * effect.factor : amount;
  }, baseAmount);
}

/** A replacement applies once, attributed to the first held replacement source. */
export function essenceReplacementSource(
  journey: Pick<JourneyState, "dreamsigns">,
  registry: JourneyModifierRegistry,
): { dreamsignId: DreamsignId; offerCount: 1 } | null {
  for (const sign of journey.dreamsigns) {
    const effect = registry.lookup(sign.id)?.journeyEssence;
    if (effect?.kind === "replaceEssenceSiteReward") {
      return { dreamsignId: sign.id, offerCount: effect.offerCount };
    }
  }
  return null;
}

/** Register one validated catalog clause as a deterministic post-event hook. */
export function journeyEssence(dreamsignId: DreamsignId, descriptor: JourneyEssenceEffect): JourneyModifierDefinition {
  const effect = Object.freeze({ ...descriptor });
  if (effect.kind === "multiplyEssenceSiteGain" && (!Number.isFinite(effect.factor) || effect.factor <= 0) ||
    effect.kind === "replaceEssenceSiteReward" && effect.offerCount !== 1 ||
    effect.kind === "newDreamscapeEssence" && (!Number.isFinite(effect.numerator) || effect.numerator < 0 ||
      !Number.isFinite(effect.denominator) || effect.denominator <= 0)) {
    throw new RangeError("Invalid journeyEssence catalog arithmetic.");
  }
  return {
    dreamsignId,
    journeyEssence: effect,
    afterJourneyEvent({ before, journey, eventType, siteId, heldIndex }): ReturnType<JourneyModifierDefinition["afterJourneyEvent"]> {
      if (effect.kind === "newDreamscapeEssence") {
        const nodeId = journey.currentDreamscape;
        if ((eventType !== "START_JOURNEY" && eventType !== "TRAVEL_TO_DREAMSCAPE") ||
          nodeId === null || nodeId === before.currentDreamscape) return null;
        const amount = journey.essence * (effect.numerator / effect.denominator);
        const essence = journey.essence + amount;
        return { journey: { ...journey, essence }, before: { essence: journey.essence },
          after: { essence, gained: amount }, target: { nodeId, siteIds: [] } };
      }
      if (siteId === null) return null;
      const runtime = journey.siteRuntime[siteId];
      const previous = before.siteRuntime[siteId];
      const node = Object.values(journey.atlas.nodes).find((candidate) =>
        candidate.sites.some((site) => site.id === siteId));
      if (effect.kind === "replaceEssenceSiteReward") {
        if ((eventType !== "OPEN_SITE" && eventType !== "ACCEPT_ESSENCE") || previous !== undefined ||
          runtime?.kind !== "reward" || runtime.journeyEssenceSource !== dreamsignId ||
          runtime.reward.rewardType !== "dreamsign" ||
          journey.dreamsigns.findIndex((sign) => sign.id === dreamsignId) !== heldIndex) return null;
        return { journey, before: { offered: 0, essence: before.essence },
          after: { offered: 1, essence: journey.essence },
          target: { siteIds: [siteId], nodeId: node?.id, incomingDreamsignId: runtime.reward.dreamsign.id } };
      }
      if (eventType !== "ACCEPT_ESSENCE" || runtime?.kind !== "essence" ||
        !runtime.accepted || previous?.kind === "essence" && previous.accepted) return null;
      const gained = journey.essence - before.essence;
      if (gained <= 0) return null;
      const multiplied = gained * effect.factor;
      const essence = before.essence + multiplied;
      return { journey: { ...journey, essence }, before: { gained, essence: journey.essence },
        after: { gained: multiplied, essence }, target: { siteIds: [siteId], nodeId: node?.id } };
    },
  };
}
