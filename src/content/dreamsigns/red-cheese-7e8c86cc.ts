import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyOnGainEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyOnGainEffect = { kind: "afterBattleDreamsignChoice", offerCount: 3 } as const satisfies JourneyOnGainEffect;

export default dreamsign({
  id: "7e8c86cc-788f-4648-be84-e0935c40c31e",
  name: "Red Cheese",
  imageName: "red_cheese.png",
  imageAlt:
    "Glowing red wedge-shaped gem or cheese-like shard with oval cutouts.",
  effectDescription: "After each battle, pick 1 of 3 dreamsigns to gain.",
  rarity: "Common",
  tideIds: ["f93cefb1-3a37-4075-98f0-c006571edd09"],
  tags: ["J16", "Tag OK"],
  abilities: () => [],
  journeyOnGain: journeyOnGainEffect,
  verifiedText: expectedVerifiedText("After each battle, pick 1 of 3 dreamsigns to gain."),
});
