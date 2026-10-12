import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyEssenceEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyEssenceEffect = { kind: "newDreamscapeEssence", numerator: 20, denominator: 100 } as const satisfies JourneyEssenceEffect;

export default dreamsign({
  journeyEssence: journeyEssenceEffect,
  id: "95a162c1-5fb0-4966-b631-eec1e8ec96ef",
  name: "Banded Worm",
  imageName: "worm.png",
  imageAlt:
    "Brown banded worm curled in an S shape with glossy segmented rings",
  effectDescription:
    "When you enter a new dreamscape, gain essence equal to 20% of your current essence.",
  rarity: "Uncommon",
  tideIds: ["d923b6e9-8572-4b27-b456-e70e69e80b31"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("When you enter a new dreamscape, gain essence equal to 20% of your current essence."),
});
