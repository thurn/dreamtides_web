import { describe, expect, it } from "vitest";
import {
  explorationEditorInternals,
  normalizeExplorationAction,
  readExplorationEditorData,
} from "./exploration-editor-data.mjs";
import { EXPLORATION_EFFECT_SCHEMAS } from "./exploration-editor-schema.mjs";

describe("exploration editor data", () => {
  it("maps compatibility site-type to the editor siteType field", () => {
    expect(explorationEditorInternals.camelAction({
      id: "fixed-site-action",
      label: "Synthetic action",
      "effect-text": "Add a duplication site",
      "effect-kind": "add-fixed-site",
      "site-type": "Duplication",
    })).toMatchObject({
      effectKind: "add-fixed-site",
      siteType: "Duplication",
    });
  });

  it("maps compatibility card-type to the editor cardType field", () => {
    expect(explorationEditorInternals.camelAction({
      id: "card-type-action",
      label: "Synthetic action",
      "effect-text": "Become {card_type}",
      "effect-kind": "change-random-card-type",
      count: 2,
      "card-type": "Event",
    })).toMatchObject({
      effectKind: "change-random-card-type",
      count: 2,
      cardType: "Event",
    });
  });

  it("loads action-local presentation with UUID-backed previews", () => {
    const data = readExplorationEditorData({ random: () => 0 });
    const actions = data.encounters.flatMap((encounter) => encounter.actions);

    expect(data.encounters.length).toBeGreaterThan(0);
    expect(actions).toHaveLength(data.encounters.length * 2);
    expect(actions.every((action) => action.effectText.length > 0)).toBe(true);
    expect(actions.flatMap((action) => action.runtimeCardSelections)
      .every((selection) => /^[0-9a-f-]{36}$/u.test(selection.cardId))).toBe(true);
    expect(actions
      .filter((action) => action.cardId !== undefined)
      .every((action) => action.runtimeCardSelections.some((selection) =>
        selection.placeholder === "{fixed_card}" &&
        selection.cardId.toLowerCase() === action.cardId.toLowerCase() &&
        selection.source === "fixed_reference"))).toBe(true);
    expect(actions
      .filter((action) => action.effectText.includes("{nightmare_card}"))
      .every((action) => action.runtimeCardSelections.some((selection) =>
        selection.placeholder === "{nightmare_card}" &&
        selection.source === "fixed_reference"))).toBe(true);
    expect(data).not.toHaveProperty("templates");
  });

  it("publishes a closed code-owned schema without player copy", () => {
    expect(EXPLORATION_EFFECT_SCHEMAS).toHaveLength(66);
    expect(new Set(EXPLORATION_EFFECT_SCHEMAS.map((entry) => entry.kind)).size)
      .toBe(EXPLORATION_EFFECT_SCHEMAS.length);
    for (const definition of EXPLORATION_EFFECT_SCHEMAS) {
      expect(definition).not.toHaveProperty("templateIds");
      expect(definition).not.toHaveProperty("copy");
    }
    expect(EXPLORATION_EFFECT_SCHEMAS.filter(({ kind }) => [
      "transfigure-all-cards", "purge-disclosed-and-transfigure-same-type",
      "make-predicate-fast-and-gain-nightmares",
      "take-transfigured-cards-and-gain-nightmares",
      "purge-one-transfigure-and-copy-others",
    ].includes(kind))).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "transfigure-all-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        defaultSelectionPolicyId: "uniform", fields: [] }),
      expect.objectContaining({ kind: "purge-disclosed-and-transfigure-same-type",
        canonicalMechanicId: "purge-deck-entry",
        defaultSelectionPolicyId: "purge-misfit",
        fields: [{ key: "transfiguration", label: "Transfiguration",
          control: "transfiguration" }] }),
      expect.objectContaining({ kind: "make-predicate-fast-and-gain-nightmares",
        canonicalMechanicId: "make-deck-fast", fields: [
          expect.objectContaining({ key: "predicate", control: "predicate" }),
          expect.objectContaining({ key: "nightmareCount", min: 1 }),
        ] }),
      expect.objectContaining({ kind: "take-transfigured-cards-and-gain-nightmares",
        canonicalMechanicId: "transfigured-card-chooser",
        defaultSelectionPolicyId: "card-fit", requiresFollowup: true,
        fields: [
          expect.objectContaining({ key: "predicate" }),
          expect.objectContaining({ key: "offerCount", min: 4, max: 4 }),
          expect.objectContaining({ key: "transfiguration" }),
          expect.objectContaining({ key: "nightmareCount", min: 1 }),
        ] }),
      expect.objectContaining({ kind: "purge-one-transfigure-and-copy-others",
        canonicalMechanicId: "transfigure-deck-entry",
        defaultSelectionPolicyId: "uniform", requiresFollowup: true,
        fields: [
          expect.objectContaining({ key: "offerCount", min: 4, max: 4 }),
          expect.objectContaining({ key: "transfiguration" }),
        ] }),
    ]));
    const effectOrder = EXPLORATION_EFFECT_SCHEMAS.map(({ kind }) => kind);
    for (const [before, after] of [
      ["purge-and-copy", "purge-one-transfigure-and-copy-others"],
      ["transfigure-all-starter-cards", "transfigure-all-cards"],
      ["take-cards", "take-transfigured-cards-and-gain-nightmares"],
      ["transfigure-all-for-essence", "purge-disclosed-and-transfigure-same-type"],
      ["make-fast-all", "make-predicate-fast-and-gain-nightmares"],
    ]) expect(effectOrder.indexOf(after)).toBe(effectOrder.indexOf(before) + 1);
    expect(
      EXPLORATION_EFFECT_SCHEMAS.find(
        (definition) => definition.kind === "add-fixed-site",
      ),
    ).toEqual({
      kind: "add-fixed-site",
      label: "Add a fixed site",
      canonicalMechanicId: "add-site",
      defaultSelectionPolicyId: "fixed",
      allowedSelectionPolicyIds: ["fixed"],
      fields: [{
        key: "siteType",
        label: "Site type",
        control: "site-type",
        defaultValue: "Shop",
        options: [
          { value: "Duplication", label: "Duplication" },
          { value: "Purge", label: "Purge" },
          { value: "Shop", label: "Shop" },
          { value: "DreamsignBazaar", label: "Dreamsign Bazaar" },
          { value: "Transfiguration", label: "Transfiguration" },
        ],
      }],
    });
    expect(EXPLORATION_EFFECT_SCHEMAS.find(
      (definition) => definition.kind === "choose-site-type",
    )).toEqual({
      kind: "choose-site-type",
      label: "Choose a site type",
      canonicalMechanicId: "add-site",
      defaultSelectionPolicyId: "site-uniform",
      allowedSelectionPolicyIds: ["site-uniform"],
      requiresFollowup: true,
      fields: [{
        key: "offerCount", label: "Offer count", control: "number",
        defaultValue: 3, min: 3, max: 3,
      }],
    });
    expect(EXPLORATION_EFFECT_SCHEMAS.filter((definition) => [
      "free-next-shop",
      "lose-half-essence-and-free-purchases",
    ].includes(definition.kind))).toEqual([
      {
        kind: "free-next-shop",
        label: "Make the next shop free",
        canonicalMechanicId: "shop-purchase-modifier",
        fields: [],
      },
      {
        kind: "lose-half-essence-and-free-purchases",
        label: "Lose half essence and grant free purchases",
        canonicalMechanicId: "shop-purchase-modifier",
        fields: [{
          key: "count",
          label: "Free purchase count",
          control: "number",
          defaultValue: 3,
          min: 1,
        }],
      },
    ]);
    expect(EXPLORATION_EFFECT_SCHEMAS.filter((definition) => [
      "change-card-type-selected",
      "replace-random-with-card",
    ].includes(definition.kind))).toEqual([
      {
        kind: "change-card-type-selected",
        label: "Change selected card type",
        canonicalMechanicId: "change-entry-card-type",
        defaultSelectionPolicyId: "deck-entry-centrality",
        allowedSelectionPolicyIds: ["deck-entry-centrality"],
        fields: [
          expect.objectContaining({
            key: "cardType", control: "card-type", defaultValue: "Character",
          }),
          expect.objectContaining({
            key: "deckTarget", control: "deck-target", defaultValue: "chosen",
          }),
        ],
      },
      {
        kind: "replace-random-with-card",
        label: "Replace random card with a fixed card",
        canonicalMechanicId: "replace-deck-entry",
        defaultSelectionPolicyId: "uniform",
        allowedSelectionPolicyIds: ["uniform"],
        fields: [
          expect.objectContaining({
            key: "predicate", control: "predicate", defaultValue: "character",
          }),
          expect.objectContaining({ key: "cardId", control: "card" }),
        ],
      },
    ]);
    expect(EXPLORATION_EFFECT_SCHEMAS.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        "change-card-type-selected",
        "replace-random-with-card",
      ]),
    );
    expect(EXPLORATION_EFFECT_SCHEMAS.findIndex(({ kind }) =>
      kind === "change-card-type-selected")).toBe(
      EXPLORATION_EFFECT_SCHEMAS.findIndex(({ kind }) =>
        kind === "change-random-card-type") - 1,
    );
    expect(EXPLORATION_EFFECT_SCHEMAS.findIndex(({ kind }) =>
      kind === "replace-random-with-card")).toBe(
      EXPLORATION_EFFECT_SCHEMAS.findIndex(({ kind }) =>
        kind === "replace-selected-with-card") + 1,
    );
    expect(EXPLORATION_EFFECT_SCHEMAS.findIndex(({ kind }) =>
      kind === "replace-selected")).toBe(
      EXPLORATION_EFFECT_SCHEMAS.findIndex(({ kind }) =>
        kind === "replace-random-with-card") + 1,
    );
    expect(
      EXPLORATION_EFFECT_SCHEMAS.find(
        (definition) => definition.kind === "transfigure-all-for-essence",
      ),
    ).toEqual({
      kind: "transfigure-all-for-essence",
      label: "Transfigure all eligible cards for essence",
      canonicalMechanicId: "transfigure-deck-for-essence",
      fields: [
        expect.objectContaining({ key: "essence", min: 1 }),
        expect.objectContaining({ key: "predicate", defaultValue: "event" }),
        expect.objectContaining({
          key: "transfiguration",
          defaultValue: "Inspired",
        }),
      ],
    });
    expect(
      EXPLORATION_EFFECT_SCHEMAS.filter((definition) =>
        [
          "gain-offered-dreamsign",
          "replace-selected-dreamsign-with-offered",
        ].includes(definition.kind),
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "gain-offered-dreamsign",
        canonicalMechanicId: "gain-dreamsign",
        defaultSelectionPolicyId: "dreamsign-match",
        fields: [expect.objectContaining({ key: "offerCount", min: 1 })],
      }),
      expect.objectContaining({
        kind: "replace-selected-dreamsign-with-offered",
        canonicalMechanicId: "gain-dreamsign",
        defaultSelectionPolicyId: "dreamsign-match",
        fields: [expect.objectContaining({ key: "offerCount", min: 1 })],
      }),
    ]);
    expect(
      EXPLORATION_EFFECT_SCHEMAS.filter((definition) =>
        [
          "gain-nightmare-and-dreamsign",
          "gain-nightmare-and-offered-dreamsign",
        ].includes(definition.kind),
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "gain-nightmare-and-dreamsign",
        canonicalMechanicId: "gain-dreamsign",
        defaultSelectionPolicyId: "fixed",
        fields: [
          expect.objectContaining({ key: "dreamsignId", control: "dreamsign" }),
          expect.objectContaining({ key: "nightmareCount", min: 1 }),
        ],
      }),
      expect.objectContaining({
        kind: "gain-nightmare-and-offered-dreamsign",
        canonicalMechanicId: "gain-dreamsign",
        defaultSelectionPolicyId: "dreamsign-match",
        fields: [
          expect.objectContaining({ key: "offerCount", min: 1 }),
          expect.objectContaining({ key: "nightmareCount", min: 1 }),
        ],
      }),
    ]);
    expect(
      EXPLORATION_EFFECT_SCHEMAS.find(
        (definition) => definition.kind === "replace-all-dreamsigns-random",
      ),
    ).toEqual(expect.objectContaining({
      canonicalMechanicId: "gain-dreamsign",
      defaultSelectionPolicyId: "uniform",
      fields: [],
    }));
    expect(
      EXPLORATION_EFFECT_SCHEMAS.find(
        (definition) => definition.kind === "purge-selected-dreamsign-and-gain-random",
      ),
    ).toEqual(expect.objectContaining({
      canonicalMechanicId: "gain-dreamsign",
      defaultSelectionPolicyId: "uniform",
      fields: [expect.objectContaining({ key: "count", min: 1 })],
    }));
    expect(EXPLORATION_EFFECT_SCHEMAS.filter((definition) => [
      "purge-starter-card",
      "purge-random-starter-card",
      "purge-random-starter-and-gain-card",
      "replace-all-starter-cards",
      "transfigure-random-starter-cards",
      "transfigure-all-starter-cards",
    ].includes(definition.kind))).toEqual([
      expect.objectContaining({
        kind: "purge-starter-card",
        canonicalMechanicId: "purge-deck-entry",
        defaultSelectionPolicyId: "uniform",
        fields: [],
      }),
      expect.objectContaining({
        kind: "purge-random-starter-card",
        canonicalMechanicId: "purge-deck-entry",
        defaultSelectionPolicyId: "uniform",
        fields: [],
      }),
      expect.objectContaining({
        kind: "purge-random-starter-and-gain-card",
        canonicalMechanicId: "replace-deck-entry",
        fields: [expect.objectContaining({ key: "predicate", defaultValue: "character" })],
      }),
      expect.objectContaining({
        kind: "replace-all-starter-cards",
        canonicalMechanicId: "replace-deck-entry",
        fields: [expect.objectContaining({ key: "predicate", defaultValue: "character" })],
      }),
      expect.objectContaining({
        kind: "transfigure-random-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        defaultSelectionPolicyId: "uniform",
        fields: [expect.objectContaining({ key: "count", defaultValue: 2, min: 1 })],
      }),
      expect.objectContaining({
        kind: "transfigure-all-starter-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        defaultSelectionPolicyId: "uniform",
        fields: [],
      }),
    ]);
    expect(EXPLORATION_EFFECT_SCHEMAS.filter((definition) => [
      "replace-selected",
      "transfigure-fixed-selected",
      "copy-random-cards",
    "change-random-card-type",
    ].includes(definition.kind))).toEqual([
      expect.objectContaining({
        kind: "change-random-card-type",
        canonicalMechanicId: "change-entry-card-type",
        defaultSelectionPolicyId: "uniform",
        fields: [
          expect.objectContaining({ key: "count", min: 1 }),
          expect.objectContaining({ key: "cardType", control: "card-type" }),
        ],
      }),
      expect.objectContaining({
        kind: "replace-selected",
        fields: [
          expect.objectContaining({ key: "predicate", control: "predicate" }),
          expect.objectContaining({ key: "count", defaultValue: 1, min: 1 }),
        ],
      }),
      expect.objectContaining({
        kind: "transfigure-fixed-selected",
        fields: [
          expect.objectContaining({ key: "predicate", optional: true }),
          expect.objectContaining({ key: "count", defaultValue: 1, min: 1 }),
          expect.objectContaining({ key: "transfiguration" }),
          expect.objectContaining({ key: "deckTarget" }),
        ],
      }),
      expect.objectContaining({
        kind: "copy-random-cards",
        canonicalMechanicId: "duplicate-deck-entry",
        defaultSelectionPolicyId: "uniform",
        fields: [
          expect.objectContaining({ key: "predicate" }),
          expect.objectContaining({ key: "count", min: 1 }),
        ],
      }),
    ]);
    expect(EXPLORATION_EFFECT_SCHEMAS.filter((definition) => [
      "purge-random-starter-and-gain-card",
      "replace-all-starter-cards",
    ].includes(definition.kind)).every((definition) =>
      definition.defaultSelectionPolicyId === undefined &&
      definition.allowedSelectionPolicyIds === undefined)).toBe(true);
    expect(EXPLORATION_EFFECT_SCHEMAS.filter((definition) => [
      "transfigure-selected",
      "transfigure-random-cards",
      "transfigure-fixed-random-cards",
    ].includes(definition.kind))).toEqual([
      expect.objectContaining({
        kind: "transfigure-selected",
        canonicalMechanicId: "transfigure-deck-entry",
        fields: [
          expect.objectContaining({ key: "predicate", optional: true }),
          expect.objectContaining({ key: "count", defaultValue: 1, min: 1 }),
        ],
      }),
      expect.objectContaining({
        kind: "transfigure-random-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        defaultSelectionPolicyId: "uniform",
        fields: [
          expect.objectContaining({ key: "predicate", control: "predicate" }),
          expect.objectContaining({ key: "count", defaultValue: 2, min: 1 }),
        ],
      }),
      expect.objectContaining({
        kind: "transfigure-fixed-random-cards",
        canonicalMechanicId: "transfigure-deck-entry",
        defaultSelectionPolicyId: "uniform",
        fields: [
          expect.objectContaining({ key: "predicate", control: "predicate" }),
          expect.objectContaining({ key: "count", defaultValue: 2, min: 1 }),
          expect.objectContaining({ key: "transfiguration", control: "transfiguration" }),
        ],
      }),
    ]);
  });

  it("normalizes mechanics without constructing presentation text", () => {
    const effectText = `Authored ${String(Math.random())}`;
    const normalized = normalizeExplorationAction({
      id: "synthetic-action",
      label: "Synthetic action",
      effectText,
      effectKind: "copy-selected-card",
      deckTarget: "offered",
      count: 2,
    });

    expect(normalized.effectText).toBe(effectText);
    expect(normalized.deckTarget).toBe("offered");
    expect(normalized.canonicalMechanicId).toBe("duplicate-deck-entry");
  });

  it("normalizes exact Wave 8 contracts and rejects malformed fields", () => {
    const base = { id: "wave8", label: "Synthetic action", effectText: "Synthetic effect" };
    const actions = [
      { ...base, effectKind: "transfigure-all-cards" },
      { ...base, effectKind: "purge-disclosed-and-transfigure-same-type",
        effectText: "Purge {deck_card} and transfigure matching cards",
        transfiguration: "Inspired" },
      { ...base, effectKind: "make-predicate-fast-and-gain-nightmares",
        predicate: "event", nightmareCount: 2 },
      { ...base, effectKind: "take-transfigured-cards-and-gain-nightmares",
        predicate: "character", offerCount: 4, transfiguration: "Empowered",
        nightmareCount: 1, followupTitle: "Choose rewards",
        followupSubtitle: "Take cards" },
      { ...base, effectKind: "purge-one-transfigure-and-copy-others",
        offerCount: 4, transfiguration: "Kindled", followupTitle: "Choose one",
        followupSubtitle: "Purge one card" },
    ];
    const normalized = actions.map((action) => normalizeExplorationAction(action));
    expect(normalized.map(({ canonicalMechanicId, selectionPolicyId }) =>
      [canonicalMechanicId, selectionPolicyId])).toEqual([
      ["transfigure-deck-entry", "uniform"],
      ["purge-deck-entry", "purge-misfit"],
      ["make-deck-fast", undefined],
      ["transfigured-card-chooser", "card-fit"],
      ["transfigure-deck-entry", "uniform"],
    ]);
    for (const action of [
      { ...actions[0], count: 1 },
      { ...actions[1], effectText: "Purge a disclosed card" },
      { ...actions[1], effectText: "Purge {deck_card} and copy {deck_card}" },
      { ...actions[2], nightmareCount: 0 },
      { ...actions[2], selectionPolicyId: "uniform" },
      { ...actions[3], canonicalMechanicId: "gain-card" },
      { ...actions[3], offerCount: 3 },
      { ...actions[3], followupSubtitle: "" },
      { ...actions[4], predicate: "event" },
    ]) expect(() => normalizeExplorationAction(action)).toThrow();
  });

  it("normalizes fixed site insertion and rejects malformed variants", () => {
    const fixedSite = normalizeExplorationAction({
      id: "fixed-site",
      label: "Synthetic action",
      effectText: "Add a duplication site",
      effectKind: "add-fixed-site",
      siteType: "Duplication",
    });

    expect(fixedSite).toMatchObject({
      canonicalMechanicId: "add-site",
      selectionPolicyId: "fixed",
      siteType: "Duplication",
    });

    for (const [action, message] of [
      [{ ...fixedSite, siteType: undefined }, /supported siteType/u],
      [{ ...fixedSite, siteType: "UnknownSite" }, /supported siteType/u],
      [{ ...fixedSite, count: 1 }, /count does not apply/u],
      [{ ...fixedSite, followupTitle: "Choose", followupSubtitle: "Choose" }, /does not support a followup/u],
      [{ ...fixedSite, effectText: "Add {site_type}" }, /does not support presentation tokens/u],
      [{ ...fixedSite, effectText: "Add $SITE_TYPE" }, /does not support presentation tokens/u],
      [{ ...fixedSite, effectKind: "add-site" }, /siteType does not apply/u],
    ]) {
      expect(() => normalizeExplorationAction(action)).toThrow(message);
    }
  });

  it("normalizes the exact site-type chooser contract", () => {
    const chooser = normalizeExplorationAction({
      id: "site-type-chooser",
      label: "Synthetic action",
      effectText: "Choose a destination",
      followupTitle: "Choose a destination",
      followupSubtitle: "Choose one of the offered destinations",
      effectKind: "choose-site-type",
      offerCount: 3,
    });

    expect(chooser).toMatchObject({
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
    });
    for (const [action, message] of [
      [{ ...chooser, offerCount: 2 }, /requires offerCount 3/u],
      [{ ...chooser, offerCount: 4 }, /requires offerCount 3/u],
      [{ ...chooser, followupTitle: undefined }, /authored together|paired followup/u],
      [{ ...chooser, followupSubtitle: "" }, /paired followup/u],
      [{ ...chooser, siteType: "Shop" }, /siteType does not apply/u],
      [{ ...chooser, count: 1 }, /count does not apply/u],
      [{ ...chooser, effectText: "Choose {site_type}" }, /presentation tokens/u],
    ]) {
      expect(() => normalizeExplorationAction(action)).toThrow(message);
    }
  });

  it("normalizes strict fieldless and counted shop purchase modifiers", () => {
    const base = {
      id: "shop-modifier",
      label: "Synthetic action",
      effectText: "Synthetic shop modifier",
    };
    expect(normalizeExplorationAction({
      ...base,
      effectKind: "free-next-shop",
      canonicalMechanicId: "gain-card",
      selectionPolicyId: "uniform",
    })).toMatchObject({
      effectKind: "free-next-shop",
      canonicalMechanicId: "shop-purchase-modifier",
    });
    expect(normalizeExplorationAction({
      ...base,
      effectKind: "lose-half-essence-and-free-purchases",
      count: 3,
    })).toMatchObject({
      effectKind: "lose-half-essence-and-free-purchases",
      canonicalMechanicId: "shop-purchase-modifier",
      count: 3,
    });
    for (const action of [
      { ...base, effectKind: "free-next-shop", count: 1 },
      { ...base, effectKind: "free-next-shop", predicate: "event" },
      { ...base, effectKind: "lose-half-essence-and-free-purchases" },
      { ...base, effectKind: "lose-half-essence-and-free-purchases", count: 0 },
      { ...base, effectKind: "lose-half-essence-and-free-purchases", count: 1.5 },
      { ...base, effectKind: "lose-half-essence-and-free-purchases", count: 3,
        followupTitle: "Choose", followupSubtitle: "Choose" },
      { ...base, effectKind: "lose-half-essence-and-free-purchases", count: 3,
        effectText: "Free {count} purchases" },
    ]) {
      expect(() => normalizeExplorationAction(action)).toThrow();
    }
  });

  it("rejects unknown action card and Dreamsign references before staging", () => {
    const references = {
      cardIds: new Set(["00000000-0000-4000-8000-000000000001"]),
      dreamsignIds: new Set(["00000000-0000-4000-8000-000000000002"]),
    };
    expect(() => normalizeExplorationAction({
      id: "unknown-card",
      label: "Synthetic action",
      effectText: "Synthetic effect",
      effectKind: "gain-card",
      cardId: "00000000-0000-4000-8000-000000000099",
    }, references)).toThrow(/Unknown card reference/u);
    expect(() => normalizeExplorationAction({
      id: "unknown-dreamsign",
      label: "Synthetic action",
      effectText: "Synthetic effect",
      effectKind: "gain-dreamsign",
      dreamsignId: "00000000-0000-4000-8000-000000000099",
    }, references)).toThrow(/Unknown Dreamsign reference/u);
  });

  it("validates exact Nightmare Dreamsign editor fields before staging", () => {
    const references = {
      dreamsignIds: new Set(["00000000-0000-4000-8000-000000000002"]),
    };
    const fixed = normalizeExplorationAction({
      id: "fixed-nightmare-dreamsign",
      label: "Synthetic action",
      effectText: "Synthetic effect",
      effectKind: "gain-nightmare-and-dreamsign",
      dreamsignId: "00000000-0000-4000-8000-000000000002",
      nightmareCount: 2,
    }, references);
    expect(fixed).toMatchObject({
      canonicalMechanicId: "gain-dreamsign",
      selectionPolicyId: "fixed",
      nightmareCount: 2,
    });

    const offered = normalizeExplorationAction({
      id: "offered-nightmare-dreamsign",
      label: "Synthetic action",
      effectText: "Synthetic effect",
      effectKind: "gain-nightmare-and-offered-dreamsign",
      offerCount: 3,
      nightmareCount: 1,
    });
    expect(offered).toMatchObject({
      canonicalMechanicId: "gain-dreamsign",
      selectionPolicyId: "dreamsign-match",
      offerCount: 3,
      nightmareCount: 1,
    });

    for (const [action, message] of [
      [{ ...fixed, nightmareCount: 0 }, /positive integer nightmareCount/u],
      [{ ...offered, offerCount: 1.5 }, /positive integer offerCount/u],
      [{ ...fixed, offerCount: 3 }, /offerCount does not apply/u],
      [{ ...offered, dreamsignId: fixed.dreamsignId }, /dreamsignId does not apply/u],
    ]) {
      expect(() => normalizeExplorationAction(action, references)).toThrow(message);
    }
  });

  it("validates exact starter-card editor fields before staging", () => {
    const disclosed = normalizeExplorationAction({
      id: "disclosed-starter",
      label: "Synthetic action",
      effectText: "Purge {starter_card}",
      effectKind: "purge-starter-card",
    });
    expect(disclosed).toMatchObject({
      canonicalMechanicId: "purge-deck-entry",
      selectionPolicyId: "uniform",
    });
    const replaceAll = normalizeExplorationAction({
      id: "replace-all-starters",
      label: "Synthetic action",
      effectText: "Synthetic effect",
      effectKind: "replace-all-starter-cards",
      predicate: "event",
    });
    expect(replaceAll).toMatchObject({
      canonicalMechanicId: "replace-deck-entry",
      predicate: "event",
    });
    expect(replaceAll).not.toHaveProperty("selectionPolicyId");

    for (const [action, message] of [
      [{ ...disclosed, predicate: "character" }, /predicate does not apply/u],
      [{ ...replaceAll, predicate: "any" }, /supported non-Any predicate/u],
      [{ ...replaceAll, predicate: "mythic" }, /supported non-Any predicate/u],
      [{ ...replaceAll, cardId: "00000000-0000-4000-8000-000000000001" }, /cardId does not apply/u],
      [{ ...replaceAll, followupTitle: "Choose", followupSubtitle: "Choose" }, /does not support a followup/u],
    ]) {
      expect(() => normalizeExplorationAction(action)).toThrow(message);
    }
  });

  it("normalizes automatic starter transfigurations and rejects foreign fields", () => {
    const random = normalizeExplorationAction({
      id: "random-starter-transfiguration",
      label: "Synthetic action",
      effectText: "Transfigure 2 random starter cards",
      effectKind: "transfigure-random-starter-cards",
      count: 2,
    });
    const all = normalizeExplorationAction({
      id: "all-starter-transfiguration",
      label: "Synthetic action",
      effectText: "Transfigure all starter cards",
      effectKind: "transfigure-all-starter-cards",
    });

    expect(random).toMatchObject({
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "uniform",
      count: 2,
    });
    expect(all).toMatchObject({
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "uniform",
    });

    for (const [action, message] of [
      [{ ...random, count: 0 }, /positive integer count/u],
      [{ ...random, count: undefined }, /positive integer count/u],
      [{ ...random, predicate: "character" }, /predicate does not apply/u],
      [{ ...random, transfiguration: "Inspired" }, /transfiguration does not apply/u],
      [{ ...all, count: 2 }, /count does not apply/u],
      [{ ...all, cardId: "00000000-0000-4000-8000-000000000001" }, /cardId does not apply/u],
      [{ ...all, followupTitle: "Choose", followupSubtitle: "Choose" }, /does not support a followup/u],
      [{ ...all, effectText: "Transfigure {starter_card}" }, /does not support presentation tokens/u],
      [{ ...all, effectText: "Transfigure $DECK_CARD" }, /does not support presentation tokens/u],
    ]) {
      expect(() => normalizeExplorationAction(action)).toThrow(message);
    }
  });

  it("normalizes chosen and automatic multi-card transfigurations", () => {
    const chosen = normalizeExplorationAction({
      id: "chosen-multi-transfiguration",
      label: "Synthetic action",
      effectText: "Transfigure 2 chosen Events",
      followupTitle: "Choose cards",
      followupSubtitle: "Choose two cards and a form for each",
      effectKind: "transfigure-selected",
      predicate: "event",
      count: 2,
    });
    const random = normalizeExplorationAction({
      id: "random-multi-transfiguration",
      label: "Synthetic action",
      effectText: "Transfigure 2 random Events",
      effectKind: "transfigure-random-cards",
      predicate: "event",
      count: 2,
    });
    const fixed = normalizeExplorationAction({
      id: "fixed-random-multi-transfiguration",
      label: "Synthetic action",
      effectText: "Kindle 2 random Events",
      effectKind: "transfigure-fixed-random-cards",
      predicate: "event",
      count: 2,
      transfiguration: "Kindled",
    });

    expect(chosen).toMatchObject({
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "transfiguration-value",
      predicate: "event",
      count: 2,
    });
    expect(random).toMatchObject({
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "uniform",
    });
    expect(fixed).toMatchObject({
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "uniform",
      transfiguration: "Kindled",
    });

    for (const [action, message] of [
      [{ ...chosen, count: 0 }, /positive integer count/u],
      [{ ...chosen, predicate: undefined }, /supported non-Any predicate/u],
      [{ ...chosen, followupTitle: undefined, followupSubtitle: undefined }, /paired followup/u],
      [{ ...random, followupTitle: "Choose", followupSubtitle: "Choose" }, /does not support a followup/u],
      [{ ...random, effectText: "Transfigure {deck_card}" }, /does not support presentation tokens/u],
      [{ ...random, transfiguration: "Kindled" }, /transfiguration does not apply/u],
      [{ ...fixed, transfiguration: undefined }, /supported transfiguration/u],
      [{ ...fixed, transfiguration: "Unknown" }, /supported transfiguration/u],
      [{ ...fixed, deckTarget: "chosen" }, /deckTarget does not apply/u],
    ]) {
      expect(() => normalizeExplorationAction(action)).toThrow(message);
    }
  });

  it("normalizes counted replacement, fixed transfiguration, copy, and card-type effects", () => {
    const replacement = normalizeExplorationAction({
      id: "replacement",
      label: "Synthetic action",
      effectText: "Replace up to two Events",
      followupTitle: "Choose cards",
      followupSubtitle: "Choose up to two Events",
      effectKind: "replace-selected",
      predicate: "event",
      count: 2,
    });
    const fixed = normalizeExplorationAction({
      id: "fixed-transfiguration",
      label: "Synthetic action",
      effectText: "Kindle two chosen Events",
      followupTitle: "Choose cards",
      followupSubtitle: "Choose exactly two Events",
      effectKind: "transfigure-fixed-selected",
      predicate: "event",
      count: 2,
      transfiguration: "Kindled",
      deckTarget: "chosen",
    });
    const copy = normalizeExplorationAction({
      id: "copy-random",
      label: "Synthetic action",
      effectText: "Copy two random Events",
      effectKind: "copy-random-cards",
      predicate: "event",
      count: 2,
    });
    const cardType = normalizeExplorationAction({
      id: "change-random-type",
      label: "Synthetic action",
      effectText: "Change two random cards into {card_type} cards",
      effectKind: "change-random-card-type",
      count: 2,
      cardType: "Character",
    });
    const legacyReplacement = normalizeExplorationAction({
      ...replacement,
      id: "legacy-replacement",
      count: undefined,
    });
    const legacyFixed = normalizeExplorationAction({
      ...fixed,
      id: "legacy-fixed",
      predicate: undefined,
      count: undefined,
    });

    expect(replacement).toMatchObject({
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "card-fit-quality",
    });
    expect(fixed).toMatchObject({
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "transfiguration-value",
    });
    expect(copy).toMatchObject({
      canonicalMechanicId: "duplicate-deck-entry",
      selectionPolicyId: "uniform",
    });
    expect(cardType).toMatchObject({
      canonicalMechanicId: "change-entry-card-type",
      selectionPolicyId: "uniform",
      cardType: "Character",
    });
    expect(legacyReplacement.count).toBeUndefined();
    expect(legacyFixed.count).toBeUndefined();

    for (const [action, message] of [
      [{ ...replacement, count: 0 }, /positive integer count/u],
      [{ ...replacement, count: 2, followupTitle: undefined, followupSubtitle: undefined }, /paired followup/u],
      [{ ...fixed, deckTarget: "offered" }, /chosen target/u],
      [{ ...fixed, predicate: undefined }, /supported predicate/u],
      [{ ...copy, predicate: undefined }, /supported non-Any predicate/u],
      [{ ...copy, followupTitle: "Choose", followupSubtitle: "Choose" }, /does not support a followup/u],
      [{ ...copy, effectText: "Copy {deck_card}" }, /target-disclosing presentation tokens/u],
      [{ ...cardType, cardType: "Dreamwell" }, /Character or Event/u],
      [{ ...cardType, predicate: "event" }, /predicate does not apply/u],
      [{ ...cardType, effectText: "Change {deck_card} into an Event" }, /target-disclosing presentation tokens/u],
    ]) {
      expect(() => normalizeExplorationAction(action)).toThrow(message);
    }
  });

  it("normalizes exact Wave7 deck-mutation fields and rejects missing or foreign fields", () => {
    const cardId = "00000000-0000-4000-8000-000000000001";
    const references = { cardIds: new Set([cardId]) };
    const replacement = normalizeExplorationAction({
      id: "replace-random-with-card",
      label: "Synthetic action",
      effectText: "Replace a random legendary card with {fixed_card}",
      effectKind: "replace-random-with-card",
      predicate: "legendary",
      cardId,
    }, references);
    const offered = normalizeExplorationAction({
      id: "change-card-type-offered",
      label: "Synthetic action",
      effectText: "Change {deck_card} into an {card_type}",
      effectKind: "change-card-type-selected",
      cardType: "Event",
      deckTarget: "offered",
    });
    const chosen = normalizeExplorationAction({
      ...offered,
      id: "change-card-type-chosen",
      effectText: "Change a chosen card into a {card_type}",
      cardType: "Character",
      deckTarget: "chosen",
    });

    expect(replacement).toMatchObject({
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "uniform",
      predicate: "legendary",
      cardId,
    });
    for (const action of [offered, chosen]) {
      expect(action).toMatchObject({
        canonicalMechanicId: "change-entry-card-type",
        selectionPolicyId: "deck-entry-centrality",
      });
    }

    for (const [action, message] of [
      [{ ...replacement, predicate: undefined }, /requires a supported non-Any predicate/u],
      [{ ...replacement, cardId: undefined }, /requires cardId/u],
      [{ ...replacement, count: 1 }, /count does not apply/u],
      [{ ...replacement, followupTitle: "Choose", followupSubtitle: "Choose" }, /does not support a followup/u],
      [{ ...replacement, effectText: "Replace {deck_card}" }, /unsupported presentation token/u],
      [{ ...offered, cardType: "Dreamwell" }, /Character or Event/u],
      [{ ...offered, deckTarget: undefined }, /chosen or offered/u],
      [{ ...offered, predicate: "legendary" }, /predicate does not apply/u],
      [{ ...chosen, effectText: "Change {deck_card}" }, /unsupported presentation token/u],
    ]) {
      expect(() => normalizeExplorationAction(action, references)).toThrow(message);
    }
  });

  it("keeps followup copy on the individual actions", () => {
    const data = readExplorationEditorData({ random: () => 0 });
    const actions = data.encounters.flatMap((encounter) => encounter.actions);
    const withFollowup = actions.filter((action) => action.followupTitle !== undefined);

    expect(withFollowup.length).toBeGreaterThan(0);
    expect(withFollowup.every((action) => action.followupSubtitle !== undefined)).toBe(true);
  });
});
