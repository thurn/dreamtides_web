import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyOnGainEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyOnGainEffect = { kind: "perfectStarterOnGain", transfiguration: "Perfected" } as const satisfies JourneyOnGainEffect;

export default dreamsign({
  id: "e7d23bf7-4d60-4b43-94c4-14a06c0f9116",
  name: "Rainbow Jellyfish",
  imageName: "rainbow_jellyfish.png",
  imageAlt:
    "Translucent aqua shell with rainbow-dotted cap and flowing ruffled skirt.",
  effectDescription:
    "When you gain this dreamsign, apply the Perfected Transfiguration to each starter card in your deck.",
  rarity: "Uncommon",
  tideIds: ["f93cefb1-3a37-4075-98f0-c006571edd09"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  journeyOnGain: journeyOnGainEffect,
  verifiedText: expectedVerifiedText("When you gain this dreamsign, apply the Perfected Transfiguration to each starter card in your deck."),
});
