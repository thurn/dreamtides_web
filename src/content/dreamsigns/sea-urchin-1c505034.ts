import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { dreamsign } from "../define";

export const journeyDraftEffect = { kind: "additionalDraftChoices", additionalCards: 1, minimumEssence: 300 } as const;

export default dreamsign({
  id: "1c505034-e405-495d-8418-6e3c06d974f0",
  name: "Sea Urchin",
  imageName: "sea_urchin.png",
  imageAlt: "Olive-green spiny shell or seed pod dotted with bumps.",
  effectDescription:
    "While you have at least 300 essence, draft site choices show an additional card.",
  rarity: "Uncommon",
  tideIds: ["f93cefb1-3a37-4075-98f0-c006571edd09"],
  tags: ["J16", "Tag OK"],
  journeyDraft: journeyDraftEffect,
  abilities: () => [],
  verifiedText: expectedVerifiedText("While you have at least 300 essence, draft site choices show an additional card."),
});
