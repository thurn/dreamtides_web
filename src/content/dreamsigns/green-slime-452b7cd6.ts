import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyTransfigurationEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyTransfigurationEffect = { kind: "afterBattleTransfiguration", maxCount: 3 } as const satisfies JourneyTransfigurationEffect;

export default dreamsign({
  journeyTransfiguration: journeyTransfigurationEffect,
  id: "452b7cd6-9dc3-48a8-b9aa-412ca6dd5f19",
  name: "Green Slime",
  imageName: "speaces.png",
  imageAlt: "Translucent green slime mound with rounded gelatinous bulges.",
  effectDescription:
    "After each battle, you may apply random transfigurations to up to 3 cards.",
  rarity: "Uncommon",
  tideIds: ["22ca33d1-9d0f-4e0f-a2f5-b635e0ce184e"],
  tags: ["J16", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("After each battle, you may apply random transfigurations to up to 3 cards."),
});
