import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyEssenceEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyEssenceEffect = { kind: "enemyRemovalOutsideChallengeEssence", amount: 10 } as const satisfies JourneyEssenceEffect;

export default dreamsign({
  id: "427c71e3-178f-4352-8d6f-f0789cb13c2d",
  name: "Carved Bone",
  imageName: "bone.png",
  imageAlt: "tan bone pipe or whistle with rounded joints and hollow end",
  effectDescription:
    "When you dissolve or banish an enemy character outside of a challenge, gain 10 essence.",
  rarity: "Uncommon",
  tideIds: ["7343b376-88d2-45fe-8b5e-79763480ee7e"],
  tags: ["J16", "Tag OK"],
  abilities: () => [],
  journeyEssence: journeyEssenceEffect,
  verifiedText: expectedVerifiedText("When you dissolve or banish an enemy character outside of a challenge, gain 10 essence."),
});
