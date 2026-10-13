import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyEssenceEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyEssenceEffect = { kind: "purgedCardEssence", amount: 50 } as const satisfies JourneyEssenceEffect;

export default dreamsign({
  journeyEssence: journeyEssenceEffect,
  id: "f4df5a74-7822-4552-a3ab-f50b00758593",
  name: "Strange Fruit",
  imageName: "strange_fruit.png",
  imageAlt:
    "Orange spiked egg with yellow spots and ember-like glowing highlights",
  effectDescription: "When you purge a card, gain 50 essence.",
  rarity: "Uncommon",
  tideIds: ["7dfa6a52-04ce-42fc-9ef6-4e6571435510"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("When you purge a card, gain 50 essence."),
});
