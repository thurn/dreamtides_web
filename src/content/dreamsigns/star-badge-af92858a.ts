import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyEssenceEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyEssenceEffect = { kind: "multiplyEssenceSiteGain", factor: 2 } as const satisfies JourneyEssenceEffect;

export default dreamsign({
  journeyEssence: journeyEssenceEffect,
  id: "af92858a-0c50-4abf-a622-04c024ca32b3",
  name: "Star Badge",
  imageName: "Ring_2.png",
  imageAlt: "Red star emblem over a white and gray circular badge.",
  effectDescription: "Double the essence you gain from essence sites.",
  rarity: "Uncommon",
  tideIds: ["d923b6e9-8572-4b27-b456-e70e69e80b31"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("Double the essence you gain from essence sites."),
});
