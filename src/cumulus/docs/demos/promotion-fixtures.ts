import { assertLocalized } from "@trox/runtime";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { GameCardModel } from "../../components/card/CardView";
import { localizedTransfigurationFormFixture } from "../../test-helpers/transfiguration-fixture";
import { asDreamsignId } from "../../../types/identifiers";
import { asDeckEntryId } from "../../../types/identifiers";

export function demoCard(index: number, _name: string): GameCardModel {
  const id = asCardId(
    `90000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  return {
    cardId: id,
    displaySnapshot: {
      id,
      name: asCardName("Bloodpact Berserker"),
      cardNumber: index,
      cardType: "Character",
      subtype: "Dreamer",
      isStarter: false,
      energyCost: 2,
      spark: 3,
      isFast: false,
      renderedText: "▸Challenge: Banish an enemy until end of turn.",
      imageNumber: index,
      artOwned: true,
    },
  };
}

export function demoInstanceId(index: number): string {
  return `92000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export const demoDreamsign = (index: number) => ({
  id: asDreamsignId(
    `91000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  ),
  name: assertLocalized(`Dreamsign ${String(index)}`),
  effectDescription: assertLocalized("Once per turn, gain 1 Essence."),
  imageAlt: assertLocalized(`Dreamsign ${String(index)}`),
});

export const demoDialogue = {
  portrait: { kind: "character-portrait", characterId: "mira" } as const,
  portraitAlt: assertLocalized("Mira"),
  speakerName: assertLocalized("Mira"),
  text: assertLocalized("Choose the path that keeps your intent clear."),
};

export const demoTransfigurationCandidate = {
  entryId: asDeckEntryId(demoInstanceId(1)),
  card: demoCard(1, "Wayfinder"),
  forms: [
    {
      type: "Empowered" as const,
      presentation: localizedTransfigurationFormFixture("Empowered"),
      change: { kind: "energy-delta" as const, from: 2, to: 1 },
      essenceCost: 20,
      affordable: true,
      previewModel: demoCard(2, "Wayfinder"),
    },
    {
      type: "Kindled" as const,
      presentation: localizedTransfigurationFormFixture("Kindled"),
      change: { kind: "spark-delta" as const, from: 3, to: 5 },
      essenceCost: 40,
      affordable: false,
      previewModel: demoCard(3, "Wayfinder"),
    },
    {
      type: "Resonant" as const,
      presentation: localizedTransfigurationFormFixture("Resonant"),
      change: { kind: "spark-delta" as const, from: 3, to: 4 },
      essenceCost: 30,
      affordable: true,
      previewModel: demoCard(4, "Wayfinder, Keeper of the Far Resonance"),
    },
  ],
};
