import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyPurgeEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyPurgeEffect = { kind: "beforeBattlePurge", minimumDeckSize: 30 } as const satisfies JourneyPurgeEffect;

export default dreamsign({
  journeyPurge: journeyPurgeEffect,
  id: "71f77dd5-3bb5-4987-80f4-13dc69f74e6b",
  name: "Scorpion",
  imageName: "scorpion.png",
  imageAlt: "Copper-brown scorpion with segmented tail and raised claws.",
  effectDescription:
    "Before each battle, if you have more than 30 cards in your deck, you may purge cards of your choice while remaining at or above 30 cards.",
  rarity: "Uncommon",
  tideIds: ["7dfa6a52-04ce-42fc-9ef6-4e6571435510"],
  tags: ["J16", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("Before each battle, if you have more than 30 cards in your deck, you may purge cards of your choice while remaining at or above 30 cards."),
});
