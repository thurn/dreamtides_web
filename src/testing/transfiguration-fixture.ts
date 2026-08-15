import type {
  TransfigurationData,
  TransfigurationFormDefinition,
  TransfigurationPricing,
  TransfigurationRewardScore,
} from "../types/transfiguration-data";
import type { TransfigurationType } from "../types/journey";
import {
  testContentHash,
  testFoldHash,
  testGlossaryEntryId,
} from "../types/test-identities";

const FORM_IDS: readonly TransfigurationType[] = [
  "Empowered",
  "Amplified",
  "Kindled",
  "Inspired",
  "Enduring",
  "Hastened",
  "Resonant",
  "Attuned",
  "Perfected",
];

function fixtureForm(
  id: TransfigurationType,
  index: number,
  pricing: TransfigurationPricing,
  rewardScore: TransfigurationRewardScore,
): TransfigurationFormDefinition {
  return {
    id,
    glossaryUuid: testGlossaryEntryId(
      `00000000-0000-4000-8000-00000000000${String(index + 1)}`,
    ),
    name: `Fixture ${id}`,
    description: `Fixture ${id} effect`,
    glyph: `transfiguration${id}`,
    accentColor: `#${String(index + 1).repeat(6)}`,
    tintColor: `#${String(9 - index).repeat(6)}`,
    pricing,
    rewardScore,
  };
}

const FIXED_COSTS: Partial<Record<TransfigurationType, number>> = {
  Amplified: 10,
  Inspired: 20,
  Enduring: 30,
  Resonant: 40,
  Attuned: 10,
  Perfected: 100,
};

const FIXTURE: TransfigurationData = {
  schemaVersion: 1,
  contentHash: testContentHash("a"),
  foldHash: testFoldHash("b"),
  site: {
    standardChoiceLimit: 3,
    enhancedChoiceLimit: null,
    pricing: {
      minimumCost: 0,
      maximumCost: 100,
      step: 10,
      statDeltaBands: [
        {
          minimumDelta: 1,
          maximumDelta: 1,
          band: { base: 10, jitter: 0, floor: 10 },
        },
        {
          minimumDelta: 2,
          band: { base: 30, jitter: 0, floor: 30 },
        },
      ],
    },
  },
  forms: FORM_IDS.map((id, index) => {
    if (id === "Empowered" || id === "Kindled") {
      return fixtureForm(
        id,
        index,
        { kind: "statDelta" },
        { kind: "statDelta", divisor: id === "Empowered" ? 2 : 4 },
      );
    }
    if (id === "Hastened") {
      return fixtureForm(
        id,
        index,
        { kind: "free" },
        { kind: "flat", value: 0.5 },
      );
    }
    const cost = FIXED_COSTS[id];
    if (cost === undefined)
      throw new Error(`Missing fixed Transfiguration cost for ${id}`);
    return fixtureForm(
      id,
      index,
      { kind: "band", base: cost, jitter: 0, floor: cost },
      { kind: "flat", value: id === "Amplified" ? 0.4 : 0.5 },
    );
  }),
};

export function transfigurationFixture(): TransfigurationData {
  return FIXTURE;
}

export function transfigurationFormFixture(
  id: TransfigurationType,
): TransfigurationFormDefinition {
  const form = FIXTURE.forms.find((candidate) => candidate.id === id);
  if (form === undefined)
    throw new Error(`Missing Transfiguration fixture ${id}`);
  return form;
}
