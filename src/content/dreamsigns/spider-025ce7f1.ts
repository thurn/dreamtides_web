import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyDuplicationEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyDuplicationEffect = { kind: "afterBattleDuplication" } as const satisfies JourneyDuplicationEffect;

export default dreamsign({
  journeyDuplication: journeyDuplicationEffect,
  id: "025ce7f1-066b-480a-8a2f-364379890abd",
  name: "Spider",
  imageName: "spider.png",
  imageAlt: "Black and orange spider with blurred legs and open fangs.",
  effectDescription: "After each battle, you may duplicate a card.",
  rarity: "Uncommon",
  tideIds: ["f93cefb1-3a37-4075-98f0-c006571edd09"],
  tags: ["J16", "Tag OK"],
  abilities: () => [],
  verifiedText: expectedVerifiedText("After each battle, you may duplicate a card."),
});
