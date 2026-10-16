import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyShopEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyShopEffect = { kind: "replacePurchasedItem" } as const satisfies JourneyShopEffect;

export default dreamsign({
  journeyShop: journeyShopEffect,
  id: "883f88fb-ac50-419a-8382-c22edee29755",
  name: "Charm Staff",
  imageName: "magic_stick_6.png",
  imageAlt:
    "curved black staff with copper wrappings, feathers, and dark hanging charms",
  effectDescription:
    "After you buy an item at a shop site, replace it immediately with another item for purchase.",
  rarity: "Uncommon",
  tideIds: ["f93cefb1-3a37-4075-98f0-c006571edd09"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("After you buy an item at a shop site, replace it immediately with another item for purchase."),
});
