import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import type { JourneyDraftEffect, JourneyPurgeEffect } from "../../types/journey";
import { dreamsign } from "../define";

export const journeyDraftEffect: JourneyDraftEffect = { kind: "additionalDraftChoices", additionalCards: 1 };

export const journeyPurgeEffect: JourneyPurgeEffect = { kind: "preventPurge" };

export default dreamsign({
  id: "e377c3ed-16f5-4424-a9f1-73f9750ace9f",
  name: "Tortoise Shell",
  imageName: "White tortoise shell.png",
  imageAlt: "Silver segmented shell or armored dome, shaded white and gray.",
  effectDescription:
    "Cards in your deck cannot be purged.\n\nDraft site choices show an additional card.",
  rarity: "Uncommon",
  tideIds: ["f93cefb1-3a37-4075-98f0-c006571edd09"],
  tags: ["J16", "Tag OK"],
  journeyPurge: journeyPurgeEffect,
  journeyDraft: journeyDraftEffect,
  abilities: () => [],
  verifiedText: expectedVerifiedText("Cards in your deck cannot be purged.\n\nDraft site choices show an additional card."),
});
