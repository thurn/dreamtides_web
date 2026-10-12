import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyEssenceEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyEssenceEffect = { kind: "replaceEssenceSiteReward", offerCount: 1 } as const satisfies JourneyEssenceEffect;

export default dreamsign({
  journeyEssence: journeyEssenceEffect,
  id: "be59c0ba-6286-49e3-a88d-86b0977cc30a",
  name: "Pearl Shell",
  imageName: "shell.png",
  imageAlt: "Open blue-gray clam shell holding a glowing pearl.",
  effectDescription:
    "At each essence site you visit, you are instead offered a Dreamsign.",
  rarity: "Uncommon",
  tideIds: ["f93cefb1-3a37-4075-98f0-c006571edd09"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("At each essence site you visit, you are instead offered a Dreamsign."),
});
