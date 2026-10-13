import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneySitesEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeySitesEffect = { kind: "transfigurationCount", count: 2 } as const satisfies JourneySitesEffect;

export default dreamsign({
  journeySites: journeySitesEffect,
  id: "d9f0f7ff-63c0-4247-8831-054d7fed931d",
  name: "Leaf Ledger",
  imageName: "book_8.png",
  imageAlt: "brown strapped book with leaf corners and parchment peeking out",
  effectDescription:
    "At each transfiguration site you visit, transfigure 2 cards instead of 1.",
  rarity: "Uncommon",
  tideIds: ["22ca33d1-9d0f-4e0f-a2f5-b635e0ce184e"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("At each transfiguration site you visit, transfigure 2 cards instead of 1."),
});
