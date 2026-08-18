import { describe, expect, it } from "vitest";
import { normalizeExplorationAction } from "./exploration-editor-data.mjs";
import { EXPLORATION_EFFECT_KINDS } from "./exploration-effect-kinds.mjs";
import { transformExplorationData } from "./setup-assets.mjs";

const CARD_ID = "00000000-0000-4000-8000-000000000001";
const SOURCE_MESSAGE_REF = {
  format: "trox-source-message-ref",
  entry_id: "tx1_synthetic",
  source_signature: "synthetic-source-signature",
  contract_signature: "synthetic-contract-signature",
};
const TOML_KEYS = new Map([
  ["effectText", "effect-text"],
  ["followupTitle", "followup-title"],
  ["followupSubtitle", "followup-subtitle"],
  ["effectKind", "effect-kind"],
  ["canonicalMechanicId", "canonical-mechanic-id"],
  ["selectionPolicyId", "selection-policy-id"],
  ["offerCount", "offer-count"],
  ["nightmareCount", "nightmare-count"],
  ["cardId", "card-id"],
  ["cardType", "card-type"],
  ["deckTarget", "deck-target"],
  ["siteType", "site-type"],
]);

function generatorSource(action) {
  const compatibilityAction = Object.fromEntries(
    Object.entries(action).flatMap(([key, value]) =>
      value === undefined ? [] : [[TOML_KEYS.get(key) ?? key, value]],
    ),
  );
  return {
    "schema-version": 2,
    "effect-kinds": [...EXPLORATION_EFFECT_KINDS],
    encounter: [
      {
        "card-id": "synthetic-source",
        prose: "Synthetic prose",
        action: [compatibilityAction],
      },
    ],
  };
}

function accepts(callback) {
  try {
    callback();
    return true;
  } catch {
    return false;
  }
}

const base = {
  id: "synthetic-action",
  label: "Synthetic action",
};

const validActions = [
  {
    ...base,
    effectText: "Purge {starter_card}",
    effectKind: "purge-starter-card",
    canonicalMechanicId: "purge-deck-entry",
    selectionPolicyId: "uniform",
  },
  {
    ...base,
    effectText: "Transfigure two random cards",
    effectKind: "transfigure-fixed-random-cards",
    canonicalMechanicId: "transfigure-deck-entry",
    selectionPolicyId: "uniform",
    predicate: "character",
    count: 2,
    transfiguration: "Inspired",
  },
  {
    ...base,
    effectText: "Transfigure two chosen cards",
    effectKind: "transfigure-fixed-selected",
    canonicalMechanicId: "transfigure-deck-entry",
    selectionPolicyId: "transfiguration-value",
    predicate: "event",
    count: 2,
    transfiguration: "Empowered",
    deckTarget: "chosen",
    followupTitle: "Choose cards",
    followupSubtitle: "Choose two",
  },
  {
    ...base,
    effectText: "Replace a card with {fixed_card}",
    effectKind: "replace-random-with-card",
    canonicalMechanicId: "replace-deck-entry",
    selectionPolicyId: "uniform",
    predicate: "legendary",
    cardId: CARD_ID,
  },
  {
    ...base,
    effectText: "Add a site",
    effectKind: "add-fixed-site",
    canonicalMechanicId: "add-site",
    selectionPolicyId: "fixed",
    siteType: "Shop",
  },
  {
    ...base,
    effectText: "Choose a site",
    effectKind: "choose-site-type",
    canonicalMechanicId: "add-site",
    selectionPolicyId: "site-uniform",
    offerCount: 3,
    followupTitle: "Choose a site",
    followupSubtitle: "Choose one",
  },
  {
    ...base,
    effectText: "The next shop purchase is free",
    effectKind: "free-next-shop",
    canonicalMechanicId: "shop-purchase-modifier",
  },
  {
    ...base,
    effectText: "Purge {deck_card}",
    effectKind: "purge-disclosed-and-transfigure-same-type",
    canonicalMechanicId: "purge-deck-entry",
    selectionPolicyId: "purge-misfit",
    transfiguration: "Hastened",
  },
  {
    ...base,
    effectText: "Take one transfigured card and gain two Nightmares",
    effectKind: "take-transfigured-cards-and-gain-nightmares",
    canonicalMechanicId: "transfigured-card-chooser",
    selectionPolicyId: "card-fit",
    predicate: "warrior",
    offerCount: 4,
    transfiguration: "Resonant",
    nightmareCount: 2,
    followupTitle: "Choose a card",
    followupSubtitle: "Choose one",
  },
];

const invalidActions = [
  { ...validActions[0], effectText: "Purge a starter card" },
  { ...validActions[1], cardId: CARD_ID },
  { ...validActions[2], deckTarget: "offered" },
  { ...validActions[3], effectText: "Replace {deck_card}" },
  { ...validActions[4], count: 1 },
  { ...validActions[5], offerCount: 4 },
  { ...validActions[6], predicate: "event" },
  { ...validActions[7], effectText: "Purge a disclosed card" },
  { ...validActions[8], followupSubtitle: "" },
];

describe("shared Exploration effect validation", () => {
  it("accepts localized followup references without an effect override", () => {
    expect(() =>
      transformExplorationData(
        generatorSource({
          ...validActions[5],
          effectText: undefined,
          followupTitle: SOURCE_MESSAGE_REF,
          followupSubtitle: SOURCE_MESSAGE_REF,
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    ...validActions.map((action) => [action.effectKind, action, true]),
    ...invalidActions.map((action) => [
      `invalid ${action.effectKind}`,
      action,
      false,
    ]),
  ])(
    "keeps editor and generator acceptance in parity for %s",
    (_name, action, expected) => {
      const editorAccepted = accepts(() => normalizeExplorationAction(action));
      const generatorAccepted = accepts(() =>
        transformExplorationData(generatorSource(action)),
      );

      expect(editorAccepted).toBe(expected);
      expect(generatorAccepted).toBe(expected);
    },
  );
});
