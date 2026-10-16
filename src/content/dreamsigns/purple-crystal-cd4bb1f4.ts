import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyShopEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyShopEffect = { kind: "firstCardPurchase", discountPercent: 25 } as const satisfies JourneyShopEffect;

export default dreamsign({
  journeyShop: journeyShopEffect,
  id: "cd4bb1f4-66bb-45ea-abfe-ce0c66e4ec4f",
  name: "Purple Crystal",
  imageName: "crystal.png",
  imageAlt: "large faceted purple crystal on a brown pedestal",
  effectDescription:
    "The first card you purchase at each dream bazaar site costs 25% less and gains a random transfiguration.",
  rarity: "Uncommon",
  tideIds: ["22ca33d1-9d0f-4e0f-a2f5-b635e0ce184e"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("The first card you purchase at each dream bazaar site costs 25% less and gains a random transfiguration."),
});
