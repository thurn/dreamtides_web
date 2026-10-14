import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyOnGainEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyOnGainEffect = { kind: "randomTransfigurationOnGain", numerator: 1, denominator: 2 } as const satisfies JourneyOnGainEffect;

export default dreamsign({
  id: "ab1da9d3-376a-460a-a9dc-4737e59e558b",
  name: "White Rat",
  imageName: "white_rat.png",
  imageAlt: "Pale white mouse with red eyes and pink tail, curled in profile",
  effectDescription:
    "When you gain this dreamsign, apply random transfigurations to half the cards in your deck.",
  rarity: "Uncommon",
  tideIds: ["f93cefb1-3a37-4075-98f0-c006571edd09"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  journeyOnGain: journeyOnGainEffect,
  verifiedText: expectedVerifiedText("When you gain this dreamsign, apply random transfigurations to half the cards in your deck."),
});
