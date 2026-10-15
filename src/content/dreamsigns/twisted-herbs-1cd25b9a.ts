import { all, characterYouControl, staticAbility } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { sparkModifier } from "../../engine/effects/primitives";
import { dreamsign } from "../define";
import type { JourneyOnGainEffect } from "../../types/journey";

export const journeyOnGainEffect = { kind: "addNightmaresOnGain", count: 5 } as const satisfies JourneyOnGainEffect;

export default dreamsign({
  id: "1cd25b9a-b176-4c51-8349-bb4df35cbf05",
  name: "Twisted Herbs",
  imageName: "twisting_herbs.png",
  imageAlt: "Bound bundle of pale green herbs with purple and yellow flowers",
  effectDescription:
    "When you gain this dreamsign, add 5 Nightmare cards to your deck.\n\nCharacters you control have +1✦.",
  rarity: "Uncommon",
  tideIds: ["51903b9a-825b-4d9a-8a6d-071670c3caaa"],
  tags: ["J16", "Tag OK", "Ally Audit"],
  abilities: () => [staticAbility(sparkModifier(all(characterYouControl()), 1))],
  verifiedText: expectedVerifiedText(
    "When you gain this dreamsign, add 5 Nightmare cards to your deck.\n\nCharacters you control have +1✦.",
  ),
  journeyOnGain: journeyOnGainEffect,
});
