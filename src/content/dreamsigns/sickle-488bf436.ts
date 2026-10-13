import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyPurgeEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyPurgeEffect = { kind: "replaceEssenceWithPurge", count: 2 } as const satisfies JourneyPurgeEffect;

export default dreamsign({
  journeyPurge: journeyPurgeEffect,
  id: "488bf436-c6d5-4e38-8a19-e50041f53766",
  name: "Sickle",
  imageName: "sickle.png",
  imageAlt: "Silver crescent sickle with teal glow and wooden handle.",
  effectDescription:
    "At each essence site, you may forgo the essence to purge 2 cards.",
  rarity: "Uncommon",
  tideIds: ["7dfa6a52-04ce-42fc-9ef6-4e6571435510"],
  tags: ["J15", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("At each essence site, you may forgo the essence to purge 2 cards."),
});
