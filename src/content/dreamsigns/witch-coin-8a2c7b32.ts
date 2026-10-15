import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyShopEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyShopEffect = { kind: "firstRestockFree" } as const satisfies JourneyShopEffect;

export default dreamsign({
  journeyShop: journeyShopEffect,
  id: "8a2c7b32-26ea-40e2-845a-689da5673b4d",
  name: "Witch Coin",
  imageName: "witch_coin.png",
  imageAlt:
    "Silver circular emblem with a white shard symbol on lavender and magenta background",
  effectDescription: "The first Restock at each shop site costs 0.",
  rarity: "Uncommon",
  tideIds: ["f93cefb1-3a37-4075-98f0-c006571edd09"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("The first Restock at each shop site costs 0."),
});
