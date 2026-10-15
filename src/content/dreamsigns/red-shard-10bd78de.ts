import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyShopEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyShopEffect = { kind: "purchasedCardTransfiguration" } as const satisfies JourneyShopEffect;

export default dreamsign({
  journeyShop: journeyShopEffect,
  id: "10bd78de-87ec-44e4-9b16-e755da2a9717",
  name: "Red Shard",
  imageName: "stone-red.png",
  imageAlt: "Bright red faceted crystal gem with sharp reflective planes.",
  effectDescription:
    "Cards you purchase from dream bazaar sites gain a random transfiguration.",
  rarity: "Uncommon",
  tideIds: ["22ca33d1-9d0f-4e0f-a2f5-b635e0ce184e"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("Cards you purchase from dream bazaar sites gain a random transfiguration."),
});
