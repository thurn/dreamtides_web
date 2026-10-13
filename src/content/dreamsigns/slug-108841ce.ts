import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyPurgeEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyPurgeEffect = { kind: "afterBattlePurge", maxCount: 2 } as const satisfies JourneyPurgeEffect;

export default dreamsign({
  journeyPurge: journeyPurgeEffect,
  id: "108841ce-4feb-4c73-972e-0277c727c63e",
  name: "Slug",
  imageName: "slug.png",
  imageAlt: "Pale beige conch shell with scattered brown speckles.",
  effectDescription: "After each battle, you may purge up to 2 cards.",
  rarity: "Uncommon",
  tideIds: ["7dfa6a52-04ce-42fc-9ef6-4e6571435510"],
  tags: ["J16", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("After each battle, you may purge up to 2 cards."),
});
