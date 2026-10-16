import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyTransfigurationEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyTransfigurationEffect = { kind: "additionalRandomTransfiguration" } as const satisfies JourneyTransfigurationEffect;

export default dreamsign({
  journeyTransfiguration: journeyTransfigurationEffect,
  id: "34ce9428-dda9-4efa-bacd-5ec2698561c1",
  name: "Glow Pouch",
  imageName: "bag_3.png",
  imageAlt: "Gray cloth pouch tied at the neck, glowing with cyan light.",
  effectDescription:
    "When you apply a transfiguration to a card, apply an additional random transfiguration to it.",
  rarity: "Uncommon",
  tideIds: ["22ca33d1-9d0f-4e0f-a2f5-b635e0ce184e"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("When you apply a transfiguration to a card, apply an additional random transfiguration to it."),
});
