import { energy, event } from "../../dsl/builders";
import { gainPoints } from "../../effects/primitives/gain-points";
import type { EngineCardDefinition } from "../../catalog";
import { syntheticId } from "../../testing/synthetic-cards";

export const FORM_EVENT: EngineCardDefinition = { id: syntheticId(0x2760), cardType: "event", costs: [energy(1)], spark: null, subtype: "", speed: "standard", status: "authored", abilities: () => [event(gainPoints(1))] };
export const FORM_FILLER: EngineCardDefinition = { id: syntheticId(0x2761), cardType: "character", costs: [energy(1)], spark: 1, subtype: "Warrior", speed: "standard", status: "vanilla", abilities: () => [] };

/** Fully synthetic authored content for the loader/text eligibility boundary. */
export function formContent(changes: Partial<import("../../../content/define").CardDefinition> = {}): import("../../../content/define").CardDefinition {
  return { id: "5e5e5e5e-0000-4000-8000-000000002762", name: "Synthetic form source", mtgName: "", renderedText: "Gain 1⍟.", energyCost: 3,
    cardType: "Event", subtype: "", rarity: "Special", isFast: false, isInterrupt: false, spark: null, tags: [], imageNumber: 0, artOwned: false,
    cardNumber: 1, isStarter: false, abilities: () => [event(gainPoints(1))], verifiedText: "synthetic", ...changes } as import("../../../content/define").CardDefinition;
}

export function metadata(change: import("../../../transfiguration/transfiguration-logic").ResonantChange | null = null) {
  return { amplified: true, resonant: { base: change, amplified: change } } as const;
}
