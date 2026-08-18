// @vitest-environment node

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "smol-toml";
import {
  generateCardLocalizationProjection,
  generateCardTransfigurationLocalizationProjection,
  cardTransfigurationTextVariants,
  generateOpponentsData,
  imageHash,
  linkExplorationArt,
  parseEnergyCost,
  parseSpark,
  setupAssets,
  transformCard,
  transformExplorationData,
  validateAvatarMapping,
} from "./setup-assets.mjs";
import { EXPLORATION_EFFECT_KINDS } from "./exploration-effect-kinds.mjs";

describe("generateOpponentsData", () => {
  it("writes the compiled browser artifact during asset setup", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "opponents-assets-"));
    const opponentsJsonPath = join(tempRoot, "opponents-data.json");
    const opponentsTomlPath = join(
      import.meta.dirname,
      "../data/opponents.toml",
    );
    const cardIds = parse(
      readFileSync(join(import.meta.dirname, "../data/cards.toml"), "utf8"),
    ).cards.map((card) => card.id);

    const compiled = generateOpponentsData({
      opponentsTomlPath,
      opponentsJsonPath,
      cardIds,
    });

    expect(existsSync(opponentsJsonPath)).toBe(true);
    expect(JSON.parse(readFileSync(opponentsJsonPath, "utf8"))).toEqual(
      compiled,
    );
    expect(compiled.foldHash).toBe(compiled.contentHash);
  });
});

describe("transformExplorationData", () => {
  it("compiles a non-empty UUID-keyed catalog with two actions per encounter", () => {
    const source = parse(
      readFileSync(
        join(import.meta.dirname, "../data/exploration_site.toml"),
        "utf8",
      ),
    );
    const compiled = transformExplorationData(source);
    expect(compiled.schemaVersion).toBe(2);
    expect(compiled).not.toHaveProperty("effectKinds");
    expect(compiled.foldHash).toBe(compiled.contentHash);
    const actions = compiled.encounters.flatMap(
      (encounter) => encounter.action,
    );

    expect(compiled.encounters.length).toBeGreaterThan(0);
    expect(actions).toHaveLength(compiled.encounters.length * 2);
    expect(
      new Set(compiled.encounters.map((encounter) => encounter.cardId)).size,
    ).toBe(compiled.encounters.length);
    expect(new Set(actions.map((action) => action.id)).size).toBe(
      actions.length,
    );
    expect(
      actions.every(
        (action) =>
          action.label?.format === "trox-source-message-ref" &&
          (action.effectText === undefined ||
            action.effectText.format === "trox-source-message-ref"),
      ),
    ).toBe(true);
    expect(
      actions
        .filter((action) => action.cardId !== undefined)
        .every((action) => typeof action.cardId === "string"),
    ).toBe(true);
    expect(
      actions
        .filter(
          (action) =>
            action.nightmareCount !== undefined &&
            ![
              "make-predicate-fast-and-gain-nightmares",
              "take-transfigured-cards-and-gain-nightmares",
            ].includes(action.effectKind),
        )
        .every((action) => action.nightmareCount > 0),
    ).toBe(true);
    expect(actions.map((action) => action.effectKind)).toEqual(
      expect.arrayContaining([
        "make-fast-all",
        "reduce-cost-all-and-gain-nightmares",
        "gain-random-dreamsign",
        "purge-dreamsign-for-essence",
        "copy-selected-card",
        "copy-offered-deck-card",
        "next-battle-opening-hand",
        "next-battle-starting-energy",
        "choose-avatar",
        "purge-duplicates-and-grant-reclaim",
      ]),
    );
  });

  function syntheticExplorationSource(essencePerCard = 15) {
    const encounters = Array.from({ length: 2 }, (_, encounterIndex) => ({
      "card-id": `source-${String(encounterIndex)}`,
      prose: `Synthetic prose ${String(encounterIndex)}`,
      action: Array.from({ length: 2 }, (_, actionIndex) => ({
        id: `action-${String(encounterIndex)}-${String(actionIndex)}`,
        label: "Synthetic action",
        "effect-text": "Synthetic effect",
        "effect-kind": "make-fast-all",
      })),
    }));
    encounters[0].action[0] = {
      ...encounters[0].action[0],
      "effect-kind": "gain-offered-card",
      "effect-text": "Gain {offered_card}",
      predicate: "character",
    };
    encounters[0].action[1] = {
      ...encounters[0].action[1],
      "effect-kind": "gain-essence-per-card",
      "essence-per-card": essencePerCard,
    };
    encounters[1].action[0] = {
      ...encounters[1].action[0],
      "effect-kind": "increase-spark-all",
      "spark-bonus": 1,
    };
    encounters[1].action[1] = {
      ...encounters[1].action[1],
      "effect-kind": "purge-random-subtype-and-increase-spark",
      subtype: "Warrior",
      "spark-bonus": 1,
    };
    return {
      "schema-version": 2,
      "effect-kinds": [...EXPLORATION_EFFECT_KINDS],
      encounter: encounters,
    };
  }

  it("compiles the redesigned encounter effect kinds", () => {
    const compiled = transformExplorationData(syntheticExplorationSource());
    const effectKinds = compiled.encounters.flatMap((encounter) =>
      encounter.action.map((action) => action.effectKind),
    );

    expect(effectKinds).toContain("gain-offered-card");
    expect(effectKinds).toContain("gain-essence-per-card");
    expect(effectKinds).toContain("increase-spark-all");
    expect(effectKinds).toContain("purge-random-subtype-and-increase-spark");
  });

  it("compiles the five exact Wave 8 compound contracts", () => {
    const source = syntheticExplorationSource();
    const actions = [
      {
        id: "w8-40",
        label: "Synthetic",
        "effect-text": "Transfigure every card",
        "effect-kind": "transfigure-all-cards",
      },
      {
        id: "w8-75",
        label: "Synthetic",
        "effect-text": "Purge {deck_card} and transfigure matching cards",
        "effect-kind": "purge-disclosed-and-transfigure-same-type",
        transfiguration: "Inspired",
      },
      {
        id: "w8-77",
        label: "Synthetic",
        "effect-text": "Make Events fast and gain 2 Nightmares",
        "effect-kind": "make-predicate-fast-and-gain-nightmares",
        predicate: "event",
        "nightmare-count": 2,
      },
      {
        id: "w8-78",
        label: "Synthetic",
        "effect-text": "Take transfigured cards and gain a Nightmare",
        "followup-title": "Choose rewards",
        "followup-subtitle": "Take cards",
        "effect-kind": "take-transfigured-cards-and-gain-nightmares",
        predicate: "character",
        "offer-count": 4,
        transfiguration: "Empowered",
        "nightmare-count": 1,
      },
      {
        id: "w8-80",
        label: "Synthetic",
        "effect-text": "Purge one, transfigure and copy the others",
        "followup-title": "Choose one",
        "followup-subtitle": "Purge one card",
        "effect-kind": "purge-one-transfigure-and-copy-others",
        "offer-count": 4,
        transfiguration: "Kindled",
      },
    ];
    source.encounter[0].action = actions.slice(0, 3);
    source.encounter[1].action = actions.slice(3);
    const compiled = transformExplorationData(source).encounters.flatMap(
      (encounter) => encounter.action,
    );
    expect(
      compiled.map(({ canonicalMechanicId, selectionPolicyId }) => [
        canonicalMechanicId,
        selectionPolicyId,
      ]),
    ).toEqual([
      ["transfigure-deck-entry", "uniform"],
      ["purge-deck-entry", "purge-misfit"],
      ["make-deck-fast", undefined],
      ["transfigured-card-chooser", "card-fit"],
      ["transfigure-deck-entry", "uniform"],
    ]);
  });

  it("rejects malformed Wave 8 compound compatibility fields", () => {
    const base = {
      id: "w8-invalid",
      label: "Synthetic",
      "effect-text": "Synthetic effect",
    };
    const invalidActions = [
      { ...base, "effect-kind": "transfigure-all-cards", count: 1 },
      {
        ...base,
        "effect-kind": "purge-disclosed-and-transfigure-same-type",
        transfiguration: "Inspired",
      },
      {
        ...base,
        "effect-kind": "purge-disclosed-and-transfigure-same-type",
        "effect-text": "Purge {deck_card} and copy {deck_card}",
        transfiguration: "Inspired",
      },
      {
        ...base,
        "effect-kind": "make-predicate-fast-and-gain-nightmares",
        predicate: "event",
        "nightmare-count": 0,
      },
      {
        ...base,
        "effect-kind": "make-predicate-fast-and-gain-nightmares",
        "selection-policy-id": "uniform",
        predicate: "event",
        "nightmare-count": 1,
      },
      {
        ...base,
        "effect-kind": "take-transfigured-cards-and-gain-nightmares",
        predicate: "event",
        "offer-count": 3,
        transfiguration: "Empowered",
        "nightmare-count": 1,
        "followup-title": "Choose",
        "followup-subtitle": "Cards",
      },
    ];
    for (const action of invalidActions) {
      const source = syntheticExplorationSource();
      source.encounter[0].action[0] = action;
      expect(() => transformExplorationData(source)).toThrow();
    }
  });

  it("compiles fixed site insertion and rejects malformed compatibility fields", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action[0] = {
      id: "fixed-site-action",
      label: "Synthetic fixed site",
      "effect-text": "Add a duplication site",
      "effect-kind": "add-fixed-site",
      "canonical-mechanic-id": "add-site",
      "selection-policy-id": "fixed",
      "site-type": "Duplication",
    };

    const [action] = transformExplorationData(source).encounters[0].action;
    expect(action).toEqual({
      id: "fixed-site-action",
      label: "Synthetic fixed site",
      effectText: "Add a duplication site",
      effectKind: "add-fixed-site",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "fixed",
      siteType: "Duplication",
    });

    for (const [field, value, message] of [
      ["site-type", undefined, /requires a supported site-type/u],
      ["site-type", "UnknownSite", /requires a supported site-type/u],
      ["count", 1, /field count does not apply/u],
      ["followup-title", "Choose", /does not support a followup/u],
      [
        "effect-text",
        "Add {site_type}",
        /does not support presentation tokens/u,
      ],
      [
        "effect-text",
        "Add $SITE_TYPE",
        /does not support presentation tokens/u,
      ],
    ]) {
      const malformed = structuredClone(source);
      if (value === undefined) delete malformed.encounter[0].action[0][field];
      else malformed.encounter[0].action[0][field] = value;
      if (field === "followup-title")
        malformed.encounter[0].action[0]["followup-subtitle"] = value;
      expect(() => transformExplorationData(malformed)).toThrow(message);
    }

    const randomSite = structuredClone(source);
    randomSite.encounter[0].action[0]["effect-kind"] = "add-site";
    randomSite.encounter[0].action[0]["selection-policy-id"] = "site-uniform";
    expect(() => transformExplorationData(randomSite)).toThrow(
      /field siteType does not apply/u,
    );

    const purgeSite = structuredClone(source);
    purgeSite.encounter[0].action[0]["site-type"] = "Purge";
    expect(
      transformExplorationData(purgeSite).encounters[0].action[0],
    ).toMatchObject({ effectKind: "add-fixed-site", siteType: "Purge" });
  });

  it("compiles the exact site-type chooser and rejects malformed fields", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action[0] = {
      id: "site-type-chooser",
      label: "Synthetic chooser",
      "effect-text": "Choose a destination",
      "followup-title": "Choose a destination",
      "followup-subtitle": "Choose one of the offered destinations",
      "effect-kind": "choose-site-type",
      "canonical-mechanic-id": "add-site",
      "selection-policy-id": "site-uniform",
      "offer-count": 3,
    };

    expect(
      transformExplorationData(source).encounters[0].action[0],
    ).toMatchObject({
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
    });
    for (const [field, value, message] of [
      ["offer-count", undefined, /explicit offer-count 3/u],
      ["offer-count", 2, /explicit offer-count 3/u],
      ["offer-count", 4, /explicit offer-count 3/u],
      ["followup-subtitle", "", /invalid followup override/u],
      ["site-type", "Shop", /field siteType does not apply/u],
      ["count", 1, /field count does not apply/u],
      [
        "effect-text",
        "Choose {site_type}",
        /does not support presentation tokens/u,
      ],
    ]) {
      const malformed = structuredClone(source);
      if (value === undefined) delete malformed.encounter[0].action[0][field];
      else malformed.encounter[0].action[0][field] = value;
      expect(() => transformExplorationData(malformed)).toThrow(message);
    }
  });

  it("compiles strict fieldless and counted shop purchase modifiers", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action = [
      {
        id: "free-next-shop-action",
        label: "Synthetic free shop",
        "effect-text": "All items in the next shop are free",
        "effect-kind": "free-next-shop",
        "canonical-mechanic-id": "shop-purchase-modifier",
      },
      {
        id: "free-purchases-action",
        label: "Synthetic free purchases",
        "effect-text": "Lose half your essence and gain three free purchases",
        "effect-kind": "lose-half-essence-and-free-purchases",
        "canonical-mechanic-id": "shop-purchase-modifier",
        count: 3,
      },
    ];

    const actions = transformExplorationData(source).encounters[0].action;
    expect(actions).toEqual([
      expect.objectContaining({
        effectKind: "free-next-shop",
        canonicalMechanicId: "shop-purchase-modifier",
      }),
      expect.objectContaining({
        effectKind: "lose-half-essence-and-free-purchases",
        canonicalMechanicId: "shop-purchase-modifier",
        count: 3,
      }),
    ]);
    expect(
      actions.every((action) => action.selectionPolicyId === undefined),
    ).toBe(true);
    expect(actions[0]).not.toHaveProperty("count");

    for (const [actionIndex, field, value, message] of [
      [0, "count", 1, /field count does not apply/u],
      [0, "predicate", "event", /field predicate does not apply/u],
      [0, "selection-policy-id", "fixed", /without a selection policy/u],
      [
        0,
        "effect-text",
        "Free {shop_item}",
        /does not support presentation tokens/u,
      ],
      [1, "count", undefined, /requires count/u],
      [1, "count", 0, /positive whole-number count/u],
      [1, "count", 1.5, /positive whole-number count/u],
      [1, "followup-title", "Choose", /does not support a followup/u],
      [1, "site-type", "Shop", /field siteType does not apply/u],
    ]) {
      const malformed = structuredClone(source);
      if (value === undefined)
        delete malformed.encounter[0].action[actionIndex][field];
      else malformed.encounter[0].action[actionIndex][field] = value;
      if (field === "followup-title") {
        malformed.encounter[0].action[actionIndex]["followup-subtitle"] = value;
      }
      expect(() => transformExplorationData(malformed)).toThrow(message);
    }
  });

  it("compiles exact starter-card effects and rejects foreign fields", () => {
    const source = syntheticExplorationSource();
    const starterActions = [
      {
        kind: "purge-starter-card",
        effectText: "Purge {starter_card}",
        fields: {},
        policy: "uniform",
      },
      {
        kind: "purge-random-starter-card",
        effectText: "Purge a random starter card",
        fields: {},
        policy: "uniform",
      },
      {
        kind: "purge-random-starter-and-gain-card",
        effectText: "Replace a random starter card",
        fields: { predicate: "character" },
        policy: undefined,
      },
      {
        kind: "replace-all-starter-cards",
        effectText: "Replace all starter cards",
        fields: { predicate: "event" },
        policy: undefined,
      },
    ];
    source.encounter
      .flatMap((encounter) => encounter.action)
      .forEach((action, index) => {
        const definition = starterActions[index];
        Object.keys(action).forEach((key) => delete action[key]);
        Object.assign(action, {
          id: `starter-action-${String(index)}`,
          label: "Synthetic starter action",
          "effect-text": definition.effectText,
          "effect-kind": definition.kind,
          ...definition.fields,
        });
      });

    const actions = transformExplorationData(source).encounters.flatMap(
      (encounter) => encounter.action,
    );
    expect(
      actions.map((action) => ({
        kind: action.effectKind,
        mechanic: action.canonicalMechanicId,
        policy: action.selectionPolicyId,
        predicate: action.predicate,
      })),
    ).toEqual(
      starterActions.map((definition) => ({
        kind: definition.kind,
        mechanic:
          definition.kind.startsWith("purge-") &&
          !definition.kind.includes("gain-card")
            ? "purge-deck-entry"
            : "replace-deck-entry",
        policy: definition.policy,
        predicate: definition.fields.predicate,
      })),
    );

    source.encounter[0].action[0].predicate = "character";
    expect(() => transformExplorationData(source)).toThrow(
      /field predicate does not apply/u,
    );
    delete source.encounter[0].action[0].predicate;
    source.encounter[1].action[0].predicate = "any";
    expect(() => transformExplorationData(source)).toThrow(
      /requires a non-Any predicate/u,
    );
    source.encounter[1].action[0].predicate = "character";
    source.encounter[1].action[0]["selection-policy-id"] = "card-fit-quality";
    expect(() => transformExplorationData(source)).toThrow(
      /top-level selection-policy-id/u,
    );
    delete source.encounter[1].action[0]["selection-policy-id"];
    source.encounter[1].action[1]["card-id"] =
      "00000000-0000-4000-8000-000000000001";
    expect(() => transformExplorationData(source)).toThrow(
      /field cardId does not apply/u,
    );
    delete source.encounter[1].action[1]["card-id"];
    source.encounter[0].action[0]["effect-text"] = "Purge a starter card";
    expect(() => transformExplorationData(source)).toThrow(
      /must present \{starter_card\}/u,
    );
  });

  it("compiles automatic starter transfigurations with exact generated fields", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action = [
      {
        id: "random-starter-transfiguration",
        label: "Synthetic action",
        "effect-text": "Transfigure random starter cards",
        "effect-kind": "transfigure-random-starter-cards",
        count: 3,
      },
      {
        id: "all-starter-transfiguration",
        label: "Synthetic action",
        "effect-text": "Transfigure all starter cards",
        "effect-kind": "transfigure-all-starter-cards",
      },
    ];

    const [random, all] = transformExplorationData(source).encounters[0].action;

    expect(random).toMatchObject({
      effectKind: "transfigure-random-starter-cards",
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "uniform",
      count: 3,
    });
    expect(all).toMatchObject({
      effectKind: "transfigure-all-starter-cards",
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "uniform",
    });
    expect(all).not.toHaveProperty("count");

    const defaulted = structuredClone(source);
    delete defaulted.encounter[0].action[0].count;
    expect(
      transformExplorationData(defaulted).encounters[0].action[0].count,
    ).toBe(2);
  });

  it.each([
    ["random non-positive count", 0, "count", /positive whole-number count/u],
    [
      "random predicate",
      "character",
      "predicate",
      /field predicate does not apply/u,
    ],
    [
      "random fixed transfiguration",
      "Inspired",
      "transfiguration",
      /field transfiguration does not apply/u,
    ],
    ["all count", 2, "count", /field count does not apply/u],
    [
      "all card reference",
      "fixed-card-id",
      "card-id",
      /field cardId does not apply/u,
    ],
    [
      "all followup",
      "Choose",
      "followup-title",
      /does not support a followup/u,
    ],
  ])(
    "rejects foreign starter transfiguration data: %s",
    (_label, value, key, message) => {
      const source = syntheticExplorationSource();
      source.encounter[0].action[0] = {
        id: "starter-transfiguration",
        label: "Synthetic action",
        "effect-text": "Transfigure starter cards",
        "effect-kind":
          key === "count" && value === 0
            ? "transfigure-random-starter-cards"
            : key === "predicate" || key === "transfiguration"
              ? "transfigure-random-starter-cards"
              : "transfigure-all-starter-cards",
        ...(key === "predicate" || key === "transfiguration"
          ? { count: 2 }
          : {}),
        [key]: value,
        ...(key === "followup-title" ? { "followup-subtitle": "Choose" } : {}),
      };

      expect(() => transformExplorationData(source)).toThrow(message);
    },
  );

  it.each(["Transfigure {starter_card}", "Transfigure $DECK_CARD"])(
    "rejects starter transfiguration presentation token %s",
    (effectText) => {
      const source = syntheticExplorationSource();
      source.encounter[0].action[0] = {
        id: "starter-transfiguration",
        label: "Synthetic action",
        "effect-text": effectText,
        "effect-kind": "transfigure-all-starter-cards",
      };

      expect(() => transformExplorationData(source)).toThrow(/presentation/u);
    },
  );

  it("compiles chosen and automatic multi-card transfigurations", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action = [
      {
        id: "chosen-multi-transfiguration",
        label: "Synthetic action",
        "effect-text": "Transfigure two chosen Events",
        "followup-title": "Choose cards",
        "followup-subtitle": "Choose two Events and a form for each",
        "effect-kind": "transfigure-selected",
        predicate: "event",
        count: 2,
      },
      {
        id: "random-multi-transfiguration",
        label: "Synthetic action",
        "effect-text": "Transfigure two random Events",
        "effect-kind": "transfigure-random-cards",
        predicate: "event",
        count: 2,
      },
      {
        id: "fixed-random-multi-transfiguration",
        label: "Synthetic action",
        "effect-text": "Kindle two random Events",
        "effect-kind": "transfigure-fixed-random-cards",
        predicate: "event",
        count: 2,
        transfiguration: "Kindled",
      },
    ];

    const [chosen, random, fixed] =
      transformExplorationData(source).encounters[0].action;
    expect(chosen).toMatchObject({
      effectKind: "transfigure-selected",
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "transfiguration-value",
      predicate: "event",
      count: 2,
    });
    expect(random).toMatchObject({
      effectKind: "transfigure-random-cards",
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "uniform",
      predicate: "event",
      count: 2,
    });
    expect(fixed).toMatchObject({
      effectKind: "transfigure-fixed-random-cards",
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "uniform",
      predicate: "event",
      count: 2,
      transfiguration: "Kindled",
    });

    const single = structuredClone(source);
    single.encounter[0].action = [
      {
        id: "single-transfiguration",
        label: "Synthetic action",
        "effect-text": "Transfigure a chosen card",
        "effect-kind": "transfigure-selected",
        count: 1,
      },
    ];
    const singleAction =
      transformExplorationData(single).encounters[0].action[0];
    expect(singleAction.count).toBe(1);
    expect(singleAction).not.toHaveProperty("predicate");
  });

  it.each([
    [
      "chosen non-positive count",
      "transfigure-selected",
      { count: 0 },
      /positive whole-number count/u,
    ],
    [
      "chosen multi without predicate",
      "transfigure-selected",
      { count: 2 },
      /requires predicate/u,
    ],
    [
      "random without predicate",
      "transfigure-random-cards",
      { count: 2 },
      /requires predicate/u,
    ],
    [
      "random fixed field",
      "transfigure-random-cards",
      { count: 2, predicate: "event", transfiguration: "Kindled" },
      /does not apply/u,
    ],
    [
      "fixed without transfiguration",
      "transfigure-fixed-random-cards",
      { count: 2, predicate: "event" },
      /requires transfiguration/u,
    ],
    [
      "fixed deck target",
      "transfigure-fixed-random-cards",
      {
        count: 2,
        predicate: "event",
        transfiguration: "Kindled",
        "deck-target": "chosen",
      },
      /does not apply/u,
    ],
    [
      "automatic followup",
      "transfigure-random-cards",
      {
        count: 2,
        predicate: "event",
        "followup-title": "Choose",
        "followup-subtitle": "Choose",
      },
      /does not support a followup/u,
    ],
    [
      "automatic token",
      "transfigure-random-cards",
      {
        count: 2,
        predicate: "event",
        "effect-text": "Transfigure {deck_card}",
      },
      /does not support presentation tokens/u,
    ],
  ])(
    "rejects malformed multi-card transfiguration data: %s",
    (_label, effectKind, fields, message) => {
      const source = syntheticExplorationSource();
      source.encounter[0].action[0] = {
        id: "multi-card-transfiguration",
        label: "Synthetic action",
        "effect-text": "Synthetic transfiguration",
        "effect-kind": effectKind,
        ...fields,
      };
      expect(() => transformExplorationData(source)).toThrow(message);
    },
  );

  it("compiles counted replacement, fixed transfiguration, copying, and card-type effects", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action = [
      {
        id: "replace-selected-multiple",
        label: "Synthetic action",
        "effect-text": "Replace up to two Events",
        "followup-title": "Choose cards",
        "followup-subtitle": "Choose up to two Events",
        "effect-kind": "replace-selected",
        predicate: "event",
        count: 2,
      },
      {
        id: "transfigure-fixed-selected-multiple",
        label: "Synthetic action",
        "effect-text": "Kindle two chosen Events",
        "followup-title": "Choose cards",
        "followup-subtitle": "Choose exactly two Events",
        "effect-kind": "transfigure-fixed-selected",
        predicate: "event",
        count: 2,
        transfiguration: "Kindled",
        "deck-target": "chosen",
      },
      {
        id: "copy-random-cards",
        label: "Synthetic action",
        "effect-text": "Copy two random Events",
        "effect-kind": "copy-random-cards",
        predicate: "event",
        count: 2,
      },
    ];

    const [replacement, fixed, copy] =
      transformExplorationData(source).encounters[0].action;
    expect(replacement).toMatchObject({
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "card-fit-quality",
      predicate: "event",
      count: 2,
    });
    expect(fixed).toMatchObject({
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "transfiguration-value",
      predicate: "event",
      count: 2,
      transfiguration: "Kindled",
      deckTarget: "chosen",
    });
    expect(copy).toMatchObject({
      effectKind: "copy-random-cards",
      canonicalMechanicId: "duplicate-deck-entry",
      selectionPolicyId: "uniform",
      predicate: "event",
      count: 2,
    });

    const legacy = syntheticExplorationSource();
    legacy.encounter[0].action = [
      {
        id: "legacy-replacement",
        label: "Synthetic action",
        "effect-text": "Replace one Event",
        "followup-title": "Choose a card",
        "followup-subtitle": "Choose one Event",
        "effect-kind": "replace-selected",
        predicate: "event",
      },
      {
        id: "legacy-fixed-transfiguration",
        label: "Synthetic action",
        "effect-text": "Kindle one card",
        "followup-title": "Choose a card",
        "followup-subtitle": "Choose one card",
        "effect-kind": "transfigure-fixed-selected",
        transfiguration: "Kindled",
        "deck-target": "chosen",
      },
    ];
    expect(
      transformExplorationData(legacy).encounters[0].action.map(
        (action) => action.count,
      ),
    ).toEqual([1, 1]);
  });

  it.each([
    [
      "replacement count",
      "replace-selected",
      { predicate: "event", count: 0 },
      /positive whole-number count/u,
    ],
    [
      "fixed offered multi",
      "transfigure-fixed-selected",
      {
        predicate: "event",
        count: 2,
        transfiguration: "Kindled",
        "deck-target": "offered",
        "followup-title": "Choose",
        "followup-subtitle": "Choose",
      },
      /chosen deck-target/u,
    ],
    [
      "fixed missing predicate",
      "transfigure-fixed-selected",
      {
        count: 2,
        transfiguration: "Kindled",
        "deck-target": "chosen",
        "followup-title": "Choose",
        "followup-subtitle": "Choose",
      },
      /predicate/u,
    ],
    [
      "copy predicate",
      "copy-random-cards",
      { count: 2 },
      /requires predicate/u,
    ],
    [
      "copy count",
      "copy-random-cards",
      { predicate: "event", count: 0 },
      /positive whole-number count/u,
    ],
    [
      "copy followup",
      "copy-random-cards",
      {
        predicate: "event",
        count: 2,
        "followup-title": "Choose",
        "followup-subtitle": "Choose",
      },
      /does not support a followup/u,
    ],
    [
      "copy target token",
      "copy-random-cards",
      { predicate: "event", count: 2, "effect-text": "Copy {deck_card}" },
      /target-disclosing/u,
    ],
  ])(
    "rejects malformed Wave4b generated data: %s",
    (_label, effectKind, fields, message) => {
      const source = syntheticExplorationSource();
      source.encounter[0].action[0] = {
        id: "wave4b-action",
        label: "Synthetic action",
        "effect-text": "Synthetic effect",
        "effect-kind": effectKind,
        ...fields,
      };
      expect(() => transformExplorationData(source)).toThrow(message);
    },
  );

  it("compiles Wave7 replacement and chosen/offered card-type contracts", () => {
    const source = syntheticExplorationSource();
    source.encounter
      .flatMap((encounter) => encounter.action)
      .forEach((action, index) => {
        const definitions = [
          {
            kind: "replace-random-with-card",
            effectText: "Replace a random legendary card with {fixed_card}",
            fields: {
              predicate: "legendary",
              "card-id": "00000000-0000-4000-8000-000000000001",
            },
          },
          {
            kind: "change-card-type-selected",
            effectText: "Change {deck_card} into an {card_type}",
            fields: { "card-type": "Event", "deck-target": "offered" },
          },
          {
            kind: "change-card-type-selected",
            effectText: "Change a chosen card into a {card_type}",
            fields: { "card-type": "Character", "deck-target": "chosen" },
          },
          {
            kind: "make-fast-all",
            effectText: "Make every card fast",
            fields: {},
          },
        ];
        const definition = definitions[index];
        Object.keys(action).forEach((key) => delete action[key]);
        Object.assign(action, {
          id: `wave7-action-${String(index)}`,
          label: "Synthetic action",
          "effect-text": definition.effectText,
          "effect-kind": definition.kind,
          ...definition.fields,
        });
      });

    const [replacement, offered, chosen] = transformExplorationData(
      source,
    ).encounters.flatMap((encounter) => encounter.action);
    expect(replacement).toMatchObject({
      effectKind: "replace-random-with-card",
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "uniform",
      predicate: "legendary",
      cardId: "00000000-0000-4000-8000-000000000001",
    });
    expect(offered).toMatchObject({
      effectKind: "change-card-type-selected",
      canonicalMechanicId: "change-entry-card-type",
      selectionPolicyId: "deck-entry-centrality",
      cardType: "Event",
      deckTarget: "offered",
    });
    expect(chosen).toMatchObject({
      effectKind: "change-card-type-selected",
      canonicalMechanicId: "change-entry-card-type",
      selectionPolicyId: "deck-entry-centrality",
      cardType: "Character",
      deckTarget: "chosen",
    });
  });

  it.each([
    [
      "replacement predicate",
      "replace-random-with-card",
      { "card-id": "00000000-0000-4000-8000-000000000001" },
      /requires predicate/u,
    ],
    [
      "replacement card",
      "replace-random-with-card",
      { predicate: "legendary" },
      /requires cardId/u,
    ],
    [
      "replacement foreign count",
      "replace-random-with-card",
      {
        predicate: "legendary",
        "card-id": "00000000-0000-4000-8000-000000000001",
        count: 1,
      },
      /count does not apply/u,
    ],
    [
      "replacement followup",
      "replace-random-with-card",
      {
        predicate: "legendary",
        "card-id": "00000000-0000-4000-8000-000000000001",
        "followup-title": "Choose",
        "followup-subtitle": "Choose",
      },
      /does not support a followup/u,
    ],
    [
      "selected card type",
      "change-card-type-selected",
      { "deck-target": "offered", "card-type": "Dreamwell" },
      /Character or Event/u,
    ],
    [
      "selected target",
      "change-card-type-selected",
      { "card-type": "Event", "deck-target": "random" },
      /chosen or offered/u,
    ],
    [
      "selected foreign predicate",
      "change-card-type-selected",
      {
        "card-type": "Event",
        "deck-target": "offered",
        predicate: "legendary",
      },
      /predicate does not apply/u,
    ],
    [
      "chosen target token",
      "change-card-type-selected",
      {
        "card-type": "Event",
        "deck-target": "chosen",
        "effect-text": "Change {deck_card}",
      },
      /unsupported presentation token/u,
    ],
  ])(
    "rejects malformed Wave7 generated data: %s",
    (_label, effectKind, fields, message) => {
      const source = syntheticExplorationSource();
      source.encounter[0].action[0] = {
        id: "wave7-action",
        label: "Synthetic action",
        "effect-text": "Synthetic effect",
        "effect-kind": effectKind,
        ...fields,
      };
      expect(() => transformExplorationData(source)).toThrow(message);
    },
  );

  it("compiles explicit Dreamsign mutations and rejects non-positive fields", () => {
    const source = syntheticExplorationSource();
    const dreamsignActions = [
      {
        kind: "gain-offered-dreamsign",
        fields: { "offer-count": 3 },
        policy: "dreamsign-match",
      },
      {
        kind: "replace-selected-dreamsign-with-offered",
        fields: { "offer-count": 4 },
        policy: "dreamsign-match",
      },
      {
        kind: "replace-all-dreamsigns-random",
        fields: {},
        policy: "uniform",
      },
      {
        kind: "purge-selected-dreamsign-and-gain-random",
        fields: { count: 2 },
        policy: "uniform",
      },
    ];
    source.encounter
      .flatMap((encounter) => encounter.action)
      .forEach((action, index) => {
        const definition = dreamsignActions[index];
        Object.keys(action).forEach((key) => delete action[key]);
        Object.assign(action, {
          id: `dreamsign-action-${String(index)}`,
          label: "Synthetic Dreamsign action",
          "effect-text": "Synthetic Dreamsign effect",
          "effect-kind": definition.kind,
          ...definition.fields,
        });
      });

    const actions = transformExplorationData(source).encounters.flatMap(
      (encounter) => encounter.action,
    );
    expect(
      actions.map((action) => ({
        kind: action.effectKind,
        mechanic: action.canonicalMechanicId,
        policy: action.selectionPolicyId,
      })),
    ).toEqual(
      dreamsignActions.map((definition) => ({
        kind: definition.kind,
        mechanic: "gain-dreamsign",
        policy: definition.policy,
      })),
    );
    expect(actions[2]).not.toHaveProperty("offerCount");
    expect(actions[2]).not.toHaveProperty("count");

    source.encounter[0].action[0]["offer-count"] = 0;
    expect(() => transformExplorationData(source)).toThrow(
      /requires a positive whole-number offer-count/u,
    );
    source.encounter[0].action[0]["offer-count"] = 3;
    source.encounter[1].action[1].count = 0;
    expect(() => transformExplorationData(source)).toThrow(
      /requires a positive whole-number count/u,
    );
  });

  it("compiles Nightmare Dreamsign variants with exact positive-integer fields", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action[0] = {
      ...source.encounter[0].action[0],
      "effect-kind": "gain-nightmare-and-dreamsign",
      "effect-text": "Gain {nightmare_card} and a fixed Dreamsign",
      "dreamsign-id": "00000000-0000-4000-8000-000000000002",
      "nightmare-count": 2,
    };
    delete source.encounter[0].action[0].predicate;
    source.encounter[0].action[1] = {
      ...source.encounter[0].action[1],
      "effect-kind": "gain-nightmare-and-offered-dreamsign",
      "effect-text": "Gain {nightmare_card} and an offered Dreamsign",
      "offer-count": 3,
      "nightmare-count": 1,
    };
    delete source.encounter[0].action[1]["essence-per-card"];

    const [fixed, offered] =
      transformExplorationData(source).encounters[0].action;
    expect(fixed).toMatchObject({
      effectKind: "gain-nightmare-and-dreamsign",
      canonicalMechanicId: "gain-dreamsign",
      selectionPolicyId: "fixed",
      dreamsignId: "00000000-0000-4000-8000-000000000002",
      nightmareCount: 2,
    });
    expect(fixed).not.toHaveProperty("offerCount");
    expect(offered).toMatchObject({
      effectKind: "gain-nightmare-and-offered-dreamsign",
      canonicalMechanicId: "gain-dreamsign",
      selectionPolicyId: "dreamsign-match",
      offerCount: 3,
      nightmareCount: 1,
    });
    expect(offered).not.toHaveProperty("dreamsignId");

    for (const [field, value, message] of [
      ["nightmare-count", 0, /positive whole-number nightmare-count/u],
      ["nightmare-count", 1.5, /positive whole-number nightmare-count/u],
      ["offer-count", 0, /positive whole-number offer-count/u],
      ["offer-count", 1.5, /positive whole-number offer-count/u],
    ]) {
      const malformed = structuredClone(source);
      malformed.encounter[0].action[1][field] = value;
      expect(() => transformExplorationData(malformed)).toThrow(message);
    }

    const foreignOffer = structuredClone(source);
    foreignOffer.encounter[0].action[0]["offer-count"] = 3;
    expect(() => transformExplorationData(foreignOffer)).toThrow(
      /field offerCount does not apply/u,
    );
    const foreignDreamsign = structuredClone(source);
    foreignDreamsign.encounter[0].action[1]["dreamsign-id"] =
      "00000000-0000-4000-8000-000000000002";
    expect(() => transformExplorationData(foreignDreamsign)).toThrow(
      /field dreamsignId does not apply/u,
    );
  });

  it("compiles Exploration encounters with one through four actions", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action.push({
      ...source.encounter[0].action[0],
      id: "synthetic-third-action",
    });
    expect(transformExplorationData(source).encounters[0].action).toHaveLength(
      3,
    );

    source.encounter[0].action = [];
    expect(() => transformExplorationData(source)).toThrow(
      /between one and four actions/u,
    );
  });

  it("rejects drift between compiler, runtime, and editor effect kinds", () => {
    const source = syntheticExplorationSource();
    source["effect-kinds"] = source["effect-kinds"].slice(1);

    expect(() => transformExplorationData(source)).toThrow(
      /compiler, runtime, and editor effect kinds must match/u,
    );
  });

  it("compiles custom Dreamsigns as canonical collectible data", () => {
    const source = syntheticExplorationSource();
    source["custom-dreamsign"] = [
      {
        id: "custom-sign",
        name: "Custom Sign",
        "rendered-text": "A synthetic effect.",
      },
    ];

    const [dreamsign] = transformExplorationData(source).customDreamsigns;

    expect(dreamsign).toMatchObject({ id: "custom-sign" });
    expect(dreamsign).not.toHaveProperty("isNegative");
  });

  it("rejects a non-positive per-card essence reward", () => {
    expect(() =>
      transformExplorationData(syntheticExplorationSource(0)),
    ).toThrow(/requires positive essence-per-card/);
  });

  it("compiles and validates paid bulk transfiguration fields", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action[0] = {
      ...source.encounter[0].action[0],
      "effect-kind": "transfigure-all-for-essence",
      "effect-text": "Transfigure all Events.",
      essence: 100,
      predicate: "event",
      transfiguration: "Inspired",
    };

    const [action] = transformExplorationData(source).encounters[0].action;
    expect(action).toMatchObject({
      effectKind: "transfigure-all-for-essence",
      canonicalMechanicId: "transfigure-deck-for-essence",
      essence: 100,
      predicate: "event",
      transfiguration: "Inspired",
    });

    source.encounter[0].action[0].essence = 0;
    expect(() => transformExplorationData(source)).toThrow(
      /requires positive whole-number essence, predicate, and transfiguration/u,
    );
  });

  it("rejects invalid cardinalities for new Exploration mechanics", () => {
    const countSource = syntheticExplorationSource();
    countSource.encounter[0].action[0] = {
      ...countSource.encounter[0].action[0],
      "effect-text": "Synthetic effect",
      "effect-kind": "copy-selected-card",
      "deck-target": "chosen",
      count: 0,
    };
    expect(() => transformExplorationData(countSource)).toThrow(
      /requires a positive whole-number count/,
    );

    const offerSource = syntheticExplorationSource();
    offerSource.encounter[0].action[0] = {
      ...offerSource.encounter[0].action[0],
      "effect-text": "Synthetic effect",
      "effect-kind": "choose-avatar",
      "offer-count": 0,
    };
    expect(() => transformExplorationData(offerSource)).toThrow(
      /requires a positive whole-number offer-count/,
    );
  });

  it("rejects a non-positive spark-priced purge reward", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action[0] = {
      ...source.encounter[0].action[0],
      "effect-text": "Synthetic effect",
      "effect-kind": "purge-for-essence",
      "essence-per-spark": 0,
    };

    expect(() => transformExplorationData(source)).toThrow(
      /requires positive essence-per-spark/,
    );
  });

  it("compiles multi-copy, spark-priced purge, and compound battle effects", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action[0] = {
      ...source.encounter[0].action[0],
      "effect-text": "Synthetic effect",
      "effect-kind": "copy-selected-cards",
      count: 2,
    };
    source.encounter[0].action[1] = {
      ...source.encounter[0].action[1],
      "effect-kind": "purge-for-essence",
      "essence-per-spark": 20,
    };
    source.encounter[1].action[0] = {
      ...source.encounter[1].action[0],
      "effect-kind": "next-battle-smaller-hand-and-cost-discount",
    };

    expect(() => transformExplorationData(source)).not.toThrow();
  });

  it("requires a concrete subtype for selected subtype changes", () => {
    const source = syntheticExplorationSource();
    source.encounter[0].action[0] = {
      ...source.encounter[0].action[0],
      "effect-text": "Synthetic effect",
      "effect-kind": "change-subtype-selected",
      "deck-target": "chosen",
      predicate: "cheap-character",
      subtype: "",
    };

    expect(() => transformExplorationData(source)).toThrow(
      /requires a non-empty subtype/,
    );
  });

  it("validates the fields required by offered copies, fixed replacement, and fixed transfiguration", () => {
    const offered = syntheticExplorationSource();
    offered.encounter[0].action[0] = {
      ...offered.encounter[0].action[0],
      "effect-kind": "gain-offered-card",
      "effect-text": "Gain {offered_card}",
      predicate: "spirit-animal",
      count: 3,
    };
    offered.encounter[0].action[1] = {
      ...offered.encounter[0].action[1],
      "effect-kind": "replace-selected-with-card",
      "effect-text": "Replace the selection with {fixed_card}",
      "card-id": "fixed-card-id",
    };
    offered.encounter[1].action[0] = {
      id: offered.encounter[1].action[0].id,
      label: offered.encounter[1].action[0].label,
      "effect-text": offered.encounter[1].action[0]["effect-text"],
      "effect-kind": "transfigure-fixed-selected",
      "deck-target": "chosen",
      transfiguration: "Empowered",
    };
    expect(() => transformExplorationData(offered)).not.toThrow();

    const missingCount = structuredClone(offered);
    delete missingCount.encounter[0].action[0].count;
    expect(
      transformExplorationData(missingCount).encounters[0].action[0].count,
    ).toBe(1);
    const missingCard = structuredClone(offered);
    delete missingCard.encounter[0].action[1]["card-id"];
    expect(() => transformExplorationData(missingCard)).toThrow(
      /requires card-id/,
    );
    const missingForm = structuredClone(offered);
    delete missingForm.encounter[1].action[0].transfiguration;
    expect(
      transformExplorationData(missingForm).encounters[1].action[0]
        .transfiguration,
    ).toBe("Empowered");
  });

  it("requires UUID-backed presentation slots for fixed and Nightmare cards", () => {
    const fixed = syntheticExplorationSource();
    fixed.encounter[0].action[0] = {
      ...fixed.encounter[0].action[0],
      "effect-kind": "gain-card",
      "effect-text": "Gain a referenced card",
      "card-id": "fixed-card-id",
    };
    expect(() => transformExplorationData(fixed)).toThrow(
      /must present \{fixed_card\}/u,
    );

    const nightmare = syntheticExplorationSource();
    nightmare.encounter[0].action[0] = {
      ...nightmare.encounter[0].action[0],
      "effect-kind": "reduce-cost-all-and-gain-nightmares",
      "effect-text": "Apply an effect and gain cards",
      "energy-cost-reduction": 1,
      "nightmare-count": 2,
    };
    expect(() => transformExplorationData(nightmare)).toThrow(
      /must present \{nightmare_card\}/u,
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateAvatarMapping", () => {
  // Synthetic fixtures only — this exercises the invariant logic, never the
  // production TOML, so editing the real mapping cannot break these tests.
  const scape = (id, avatarIds, isStarter = false) => ({
    id,
    isStarter,
    avatarIds,
  });

  it("accepts a starter plus 3-4 caller regions and returns per-region counts", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const counts = validateAvatarMapping(
      [
        scape("starter", [], true),
        scape("a", ["dc-1", "dc-2", "dc-3"]),
        scape("b", ["dc-4", "dc-5", "dc-6", "dc-7"]),
      ],
      ["dc-1", "dc-2", "dc-3", "dc-4", "dc-5", "dc-6", "dc-7"],
    );
    expect(counts).toEqual({ starter: 0, a: 3, b: 4 });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("matches ids case-insensitively", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    validateAvatarMapping(
      [scape("a", ["DC-1", "dc-2", "Dc-3"])],
      ["dc-1", "DC-2", "dc-3"],
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("throws when one Avatar is assigned to two dreamscapes", () => {
    expect(() =>
      validateAvatarMapping(
        [
          scape("a", ["dc-1", "dc-2", "dc-3"]),
          scape("b", ["dc-3", "dc-4", "dc-5"]),
        ],
        ["dc-1", "dc-2", "dc-3", "dc-4", "dc-5"],
      ),
    ).toThrow(/assigned to both/);
  });

  it("throws when a non-starter region has fewer than 3 or more than 4", () => {
    expect(() =>
      validateAvatarMapping([scape("a", ["dc-1", "dc-2"])], ["dc-1", "dc-2"]),
    ).toThrow(/must have 3-4/);
    expect(() =>
      validateAvatarMapping(
        [scape("a", ["dc-1", "dc-2", "dc-3", "dc-4", "dc-5"])],
        ["dc-1", "dc-2", "dc-3", "dc-4", "dc-5"],
      ),
    ).toThrow(/must have 3-4/);
  });

  it("throws when the starter dreamscape lists residents", () => {
    expect(() =>
      validateAvatarMapping([scape("starter", ["dc-1"], true)], ["dc-1"]),
    ).toThrow(/starter dreamscape/);
  });

  it("warns (does not throw) on unknown and unassigned ids", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateAvatarMapping(
      [scape("a", ["dc-1", "dc-2", "ghost"])],
      ["dc-1", "dc-2", "dc-orphan"],
    );
    const messages = warn.mock.calls.map((call) => call[0]).join("\n");
    expect(messages).toMatch(/resolve to no Avatar/);
    expect(messages).toMatch(/not assigned to any dreamscape/);
  });
});

describe("setupAssets", () => {
  it("normalizes TOML cards and avatars into runtime JSON artifacts", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "journey-setup-assets-"));
    const publicDir = join(tempRoot, "public");
    const imageCacheDir = join(tempRoot, "image-cache");
    const avatarArtDir = join(tempRoot, "avatar-art");
    const dreamsignArtDir = join(tempRoot, "dreamsign-art");
    const mainMenuBackgroundArtPath = join(
      tempRoot,
      "licensed-art",
      "main-menu-background.jpg",
    );
    const tutorialDialogueFrameArtPath = join(
      tempRoot,
      "licensed-art",
      "tutorial-round-frame.png",
    );
    const cardTomlPath = join(tempRoot, "cards.toml");
    const avatarV2TomlPath = join(tempRoot, "avatars.toml");
    const dreamsignTomlPath = join(tempRoot, "dreamsigns.toml");
    const dreamsignAltTextPath = join(tempRoot, "dreamsign-image-alts.tsv");
    const cachedImagePath = join(imageCacheDir, imageHash(101));

    mkdirSync(imageCacheDir, { recursive: true });
    mkdirSync(avatarArtDir, { recursive: true });
    mkdirSync(dreamsignArtDir, { recursive: true });
    mkdirSync(dirname(mainMenuBackgroundArtPath), { recursive: true });
    mkdirSync(dirname(cachedImagePath), { recursive: true });
    writeFileSync(cachedImagePath, "fake-webp");
    writeFileSync(join(avatarArtDir, "0007.png"), "fake-png");
    writeFileSync(join(dreamsignArtDir, "test-sign.png"), "fake-png");
    writeFileSync(mainMenuBackgroundArtPath, "fake-jpg");
    writeFileSync(tutorialDialogueFrameArtPath, "fake-png");
    writeFileSync(
      dreamsignAltTextPath,
      "test-sign.png\tSmall idol with a violet glow.\n",
    );
    writeFileSync(
      cardTomlPath,
      `[[cards]]
name = "Null Spark"
id = "null-spark"
card-number = 1
card-type = "Character"
energy-cost = "*"
is-fast = false
tides = ["core", "ally_formation"]
rendered-text = "Rules text."
image-number = 101
art-owned = true

[[cards]]
name = "Missing Subtype"
id = "missing-subtype"
card-number = 2
card-type = "Event"
energy-cost = 2
spark = ""
is-fast = true
tides = ["support"]
rendered-text = ""
image-number = 102
art-owned = false

[[cards]]
name = "Starter Card"
id = "starter-card"
card-number = 3
card-type = "Character"
subtype = "Beast"
rarity = "Starter"
roles = ["starter-deck"]
energy-cost = 1
spark = 1
is-fast = false
tides = ["ignored"]
rendered-text = ""
image-number = 103
art-owned = true
`,
    );
    writeFileSync(
      avatarV2TomlPath,
      `[[avatar]]
id = "dc-1"
name = "Avatar One"
title = "Keeper of Test Cases"
rendered-text = "Trigger an ability."
image-number = "0007"
`,
    );
    writeFileSync(
      dreamsignTomlPath,
      `[[dreamsign]]
id = "sign-1"
name = "Test Sign"
image_name = "test-sign.png"
tides = ["core", "support"]
rendered-text = "Use the canonical Dreamsign text."
`,
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    setupAssets({
      catalogFixtureOnly: true,
      cardTomlPath,
      avatarV2TomlPath,
      dreamsignTomlPath,
      publicDir,
      imageCacheDir,
      avatarArtDir,
      dreamsignArtDir,
      dreamsignAltTextPath,
      mainMenuBackgroundArtPath,
      tutorialDialogueFrameArtPath,
    });

    const cards = JSON.parse(
      readFileSync(join(publicDir, "card-data.json"), "utf8"),
    );
    const avatars = JSON.parse(
      readFileSync(join(publicDir, "avatars-v2-data.json"), "utf8"),
    );
    const dreamsigns = JSON.parse(
      readFileSync(join(publicDir, "dreamsign-data.json"), "utf8"),
    );
    expect(
      readFileSync(join(publicDir, "main-menu", "background.jpg"), "utf8"),
    ).toBe("fake-jpg");
    expect(
      readFileSync(join(publicDir, "atlas", "Round_frame.png"), "utf8"),
    ).toBe("fake-png");

    expect(cards).toEqual([
      {
        name: "Null Spark",
        id: "null-spark",
        cardNumber: 1,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: null,
        spark: null,
        isFast: false,
        renderedText: "Rules text.",
        imageNumber: 101,
        artOwned: true,
      },
      {
        name: "Missing Subtype",
        id: "missing-subtype",
        cardNumber: 2,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        energyCost: 2,
        spark: null,
        isFast: true,
        renderedText: "",
        imageNumber: 102,
        artOwned: false,
      },
      {
        name: "Starter Card",
        id: "starter-card",
        cardNumber: 3,
        cardType: "Character",
        rarity: "Starter",
        subtype: "Beast",
        isStarter: true,
        roles: ["starter-deck"],
        energyCost: 1,
        spark: 1,
        isFast: false,
        renderedText: "",
        imageNumber: 103,
        artOwned: true,
      },
    ]);
    expect(avatars).toEqual([
      {
        id: "dc-1",
        name: "Avatar One",
        title: "Keeper of Test Cases",
        renderedText: "Trigger an ability.",
        imageNumber: "0007",
      },
    ]);
    expect(dreamsigns).toEqual([
      {
        id: "sign-1",
        name: "Test Sign",
        imageName: "test-sign.png",
        imageAlt: "Small idol with a violet glow.",
        effectDescription: "Use the canonical Dreamsign text.",
        tags: [],
      },
    ]);
    expect(existsSync(join(publicDir, "cards", "101.webp"))).toBe(true);
    expect(existsSync(join(publicDir, "avatars", "0007.png"))).toBe(true);
    expect(existsSync(join(publicDir, "dreamsigns", "test-sign.png"))).toBe(
      true,
    );
  });

  it("passes through tuned starting-essence values from the TOML", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "journey-setup-assets-"));
    const publicDir = join(tempRoot, "public");
    const imageCacheDir = join(tempRoot, "image-cache");
    const avatarArtDir = join(tempRoot, "avatar-art");
    const dreamsignArtDir = join(tempRoot, "dreamsign-art");
    const cardTomlPath = join(tempRoot, "cards.toml");
    const avatarV2TomlPath = join(tempRoot, "avatars.toml");
    const dreamsignTomlPath = join(tempRoot, "dreamsigns.toml");

    mkdirSync(imageCacheDir, { recursive: true });
    mkdirSync(avatarArtDir, { recursive: true });
    mkdirSync(dreamsignArtDir, { recursive: true });
    writeFileSync(join(avatarArtDir, "0007.png"), "fake-png");
    writeFileSync(join(avatarArtDir, "0008.png"), "fake-png");
    writeFileSync(cardTomlPath, "");
    writeFileSync(
      cardTomlPath,
      `[[cards]]
name = "Solo"
id = "solo"
card-number = 1
card-type = "Event"
rarity = "Starter"
roles = ["starter-deck"]
energy-cost = 1
spark = 1
is-fast = false
tides = ["core"]
rendered-text = ""
image-number = 901
art-owned = true
`,
    );
    writeFileSync(
      avatarV2TomlPath,
      `[[avatar]]
id = "dc-low"
name = "Discount Caller"
title = "Cheap Engine"
rendered-text = "Strong opener."
image-number = "0007"
starting-essence = 220

[[avatar]]
id = "dc-default"
name = "Steady Caller"
title = "Average Engine"
rendered-text = "Even keel."
image-number = "0008"
`,
    );
    writeFileSync(
      dreamsignTomlPath,
      `[[dreamsign]]
id = "sign-1"
name = "Test Sign"
image_name = "test-sign.png"
tides = ["core"]
rendered-text = ""
`,
    );
    writeFileSync(join(dreamsignArtDir, "test-sign.png"), "fake-png");

    vi.spyOn(console, "warn").mockImplementation(() => {});

    setupAssets({
      catalogFixtureOnly: true,
      cardTomlPath,
      avatarV2TomlPath,
      dreamsignTomlPath,
      publicDir,
      imageCacheDir,
      avatarArtDir,
      dreamsignArtDir,
    });

    const avatars = JSON.parse(
      readFileSync(join(publicDir, "avatars-v2-data.json"), "utf8"),
    );
    expect(avatars[0].startingEssence).toBe(220);
    expect(avatars[1]).not.toHaveProperty("startingEssence");
  });

  it("retains the rarity field on Legendary cards and omits it otherwise", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "journey-setup-assets-"));
    const publicDir = join(tempRoot, "public");
    const imageCacheDir = join(tempRoot, "image-cache");
    const avatarArtDir = join(tempRoot, "avatar-art");
    const dreamsignArtDir = join(tempRoot, "dreamsign-art");
    const cardTomlPath = join(tempRoot, "cards.toml");
    const avatarV2TomlPath = join(tempRoot, "avatars.toml");
    const dreamsignTomlPath = join(tempRoot, "dreamsigns.toml");

    mkdirSync(imageCacheDir, { recursive: true });
    mkdirSync(avatarArtDir, { recursive: true });
    mkdirSync(dreamsignArtDir, { recursive: true });
    writeFileSync(join(avatarArtDir, "0007.png"), "fake-png");
    writeFileSync(
      cardTomlPath,
      `[[cards]]
name = "Hero Card"
id = "hero-card"
card-number = 401
card-type = "Character"
subtype = "Warrior"
rarity = "Legendary"
energy-cost = 5
spark = 5
is-fast = false
tides = ["core"]
rendered-text = ""
image-number = 401
art-owned = true

[[cards]]
name = "Filler"
id = "filler"
card-number = 402
card-type = "Event"
energy-cost = 1
spark = ""
is-fast = false
tides = ["core"]
rendered-text = ""
image-number = 402
art-owned = true
`,
    );
    writeFileSync(
      avatarV2TomlPath,
      `[[avatar]]
id = "dc-1"
name = "Caller"
title = "Title"
rendered-text = ""
image-number = "0007"
`,
    );
    writeFileSync(
      dreamsignTomlPath,
      `[[dreamsign]]
id = "sign-1"
name = "Test Sign"
image_name = "test-sign.png"
tides = ["core"]
rendered-text = ""
`,
    );
    writeFileSync(join(dreamsignArtDir, "test-sign.png"), "fake-png");

    vi.spyOn(console, "warn").mockImplementation(() => {});

    setupAssets({
      catalogFixtureOnly: true,
      cardTomlPath,
      avatarV2TomlPath,
      dreamsignTomlPath,
      publicDir,
      imageCacheDir,
      avatarArtDir,
      dreamsignArtDir,
    });

    const cards = JSON.parse(
      readFileSync(join(publicDir, "card-data.json"), "utf8"),
    );
    const byNumber = new Map(cards.map((c) => [c.cardNumber, c]));
    expect(byNumber.get(401)?.rarity).toBe("Legendary");
    expect(byNumber.get(402)?.rarity).toBe(undefined);
  });
});

describe("linkExplorationArt", () => {
  it("prefers curated Exploration art and falls back to source art", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "exploration-art-"));
    const destinationDir = join(tempRoot, "public", "exploration");
    const highResArtDir = join(tempRoot, "curated");
    const sourceArtDir = join(tempRoot, "source");
    mkdirSync(highResArtDir, { recursive: true });
    mkdirSync(sourceArtDir, { recursive: true });
    writeFileSync(join(highResArtDir, "101.jpg"), "curated-101");
    writeFileSync(
      join(sourceArtDir, "stock-photo-first-101.jpg"),
      "source-101",
    );
    writeFileSync(
      join(sourceArtDir, "stock-photo-second-202.jpg"),
      "source-202",
    );

    const result = linkExplorationArt({
      destinationDir,
      highResArtDir,
      sourceArtDir,
      imageNumbers: [101, 202, 303],
    });

    expect(result).toEqual({
      highResolutionCount: 1,
      sourceCount: 1,
      missingCount: 1,
    });
    expect(readFileSync(join(destinationDir, "101.jpg"), "utf8")).toBe(
      "curated-101",
    );
    expect(readFileSync(join(destinationDir, "202.jpg"), "utf8")).toBe(
      "source-202",
    );
    expect(existsSync(join(destinationDir, "303.jpg"))).toBe(false);
  });

  it("falls back to recursively categorized source art", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "exploration-tagged-art-"));
    const destinationDir = join(tempRoot, "public", "exploration");
    const highResArtDir = join(tempRoot, "curated");
    const sourceArtDir = join(tempRoot, "missing-source");
    const taggedArtDir = join(tempRoot, "tagged");
    const nestedTaggedDir = join(taggedArtDir, "tinkerer", "selected");
    mkdirSync(nestedTaggedDir, { recursive: true });
    writeFileSync(
      join(nestedTaggedDir, "stock-photo-engineer-686903233.jpg"),
      "tagged-source",
    );

    const result = linkExplorationArt({
      destinationDir,
      highResArtDir,
      sourceArtDir,
      taggedArtDir,
      imageNumbers: [686903233],
    });

    expect(result).toEqual({
      highResolutionCount: 0,
      sourceCount: 1,
      missingCount: 0,
    });
    expect(readFileSync(join(destinationDir, "686903233.jpg"), "utf8")).toBe(
      "tagged-source",
    );
  });
});

describe("parseEnergyCost", () => {
  it("preserves a numeric single cost without orb labels", () => {
    expect(parseEnergyCost(3)).toEqual({ energyCost: 3, energyCosts: null });
  });

  it("treats blank and variable single values as a null cost", () => {
    expect(parseEnergyCost("")).toEqual({
      energyCost: null,
      energyCosts: null,
    });
    expect(parseEnergyCost("*")).toEqual({
      energyCost: null,
      energyCosts: null,
    });
    expect(parseEnergyCost("X")).toEqual({
      energyCost: null,
      energyCosts: null,
    });
  });

  it("splits a comma-separated multi-cost into orb labels and a base cost", () => {
    expect(parseEnergyCost("2,X")).toEqual({
      energyCost: 2,
      energyCosts: ["2", "X"],
    });
  });

  it("accepts the legacy newline-separated multi-cost form", () => {
    expect(parseEnergyCost("3\nX")).toEqual({
      energyCost: 3,
      energyCosts: ["3", "X"],
    });
  });

  it("uses the first numeric segment as the base cost", () => {
    expect(parseEnergyCost("X,2")).toEqual({
      energyCost: 2,
      energyCosts: ["X", "2"],
    });
  });
});

describe("transformCard energy cost", () => {
  const base = {
    name: "Multi Cost",
    id: "multi-cost",
    "card-number": 1,
    "card-type": "Event",
    "is-fast": false,
    tides: [],
    "rendered-text": "",
    "image-number": 1,
    "art-owned": false,
  };

  it("emits an energyCosts array for a multi-cost card", () => {
    const result = transformCard({ ...base, "energy-cost": "2,X" });
    expect(result.energyCost).toBe(2);
    expect(result.energyCosts).toEqual(["2", "X"]);
  });

  it("omits energyCosts for a single-cost card", () => {
    const result = transformCard({ ...base, "energy-cost": 4 });
    expect(result.energyCost).toBe(4);
    expect("energyCosts" in result).toBe(false);
  });
});

describe("transformCard Amplified text", () => {
  it("drops compact replacement metadata from the runtime shape", () => {
    const result = transformCard({
      name: "Amplified fixture",
      id: "amplified-fixture",
      "card-number": 1,
      "card-type": "Event",
      "energy-cost": 2,
      "is-fast": false,
      "rendered-text": "Gain 2●.",
      "amplified-text": "Gain 3●.",
      "amplified-replacement": "3●.",
      "image-number": 1,
      "art-owned": false,
    });
    expect(result.amplifiedText).toBe("Gain 3●.");
    expect(result).not.toHaveProperty("amplifiedReplacement");
  });

  it("projects complete card messages for localization", () => {
    const projection = generateCardLocalizationProjection([
      {
        name: "Amplified fixture",
        "card-type": "Character",
        "energy-cost": 2,
        "is-fast": false,
        "rendered-text": "Gain 2●.\n\nDraw a card.",
        "amplified-text": "Gain 3●.\n\nDraw a card.",
        "amplified-replacement": "3●.",
      },
      {
        name: "Inspired fixture",
        "card-type": "Event",
        "energy-cost": 1,
        "is-fast": false,
        "rendered-text": "Give a character +3✦.",
        "amplified-text": "Give a character +4✦.",
      },
    ]);
    expect(projection).toContain("CardDefinition(");
    expect(projection).toContain(
      'ability_text: [Tx("Gain 2●."), Tx("Draw a card.")]',
    );
    expect(projection).toContain(
      'amplified_text: [Tx("Gain 3●."), Tx("Draw a card.")]',
    );
    expect(projection).not.toContain("amplified_replacement");
    expect(projection).not.toContain("transfigured_text:");

    const transfigurations =
      generateCardTransfigurationLocalizationProjection([
        {
          name: "Inspired fixture",
          "card-type": "Event",
          "energy-cost": 1,
          "is-fast": false,
          "rendered-text": "Give a character +3✦.",
          "amplified-text": "Give a character +4✦.",
        },
      ]);
    expect(transfigurations).toContain(
      'Tx("Give a character +3✦. Draw a card.")',
    );
    expect(transfigurations).toContain(
      'Tx("Give a character +3✦. Reclaim.")',
    );
    expect(transfigurations).toContain(
      'Tx("Give a character +4✦. Draw a card. Reclaim.")',
    );
  });

  it("projects complete Resonant, Attuned, and Perfected rules variants", () => {
    const variants = cardTransfigurationTextVariants({
      name: "Triggered fixture",
      "card-type": "Character",
      "energy-cost": 3,
      "rendered-text": "▸Dawn: 2●, ☾: Act.",
    });

    expect(variants).toEqual([
      "▸Materialized, Dawn: 2●, ☾: Act.",
      "▸Dawn: 1●, ☾: Act.",
      "▸Materialized, Dawn: 1●, ☾: Act.",
    ]);
  });

  it("carries an authored Amplified form into the runtime shape", () => {
    const result = transformCard({
      name: "Amplified fixture",
      id: "amplified-fixture",
      "card-number": 1,
      "card-type": "Event",
      "energy-cost": 2,
      "is-fast": false,
      "rendered-text": "Gain 2●.",
      "amplified-text": "Gain 3●.",
      "image-number": 1,
      "art-owned": false,
    });
    expect(result.amplifiedText).toBe("Gain 3●.");
  });

  it("allows an authored Amplified form to increase draw", () => {
    const result = transformCard({
      name: "Amplified fixture",
      id: "amplified-fixture",
      "card-number": 1,
      "card-type": "Event",
      "energy-cost": 2,
      "is-fast": false,
      "rendered-text": "Draw a card.",
      "amplified-text": "Draw 2 cards.",
      "image-number": 1,
      "art-owned": false,
    });
    expect(result.amplifiedText).toBe("Draw 2 cards.");
  });

  it("allows an authored Character Amplified form to add draw", () => {
    const result = transformCard({
      name: "Amplified fixture",
      id: "amplified-fixture",
      "card-number": 1,
      "card-type": "Character",
      "energy-cost": 2,
      "is-fast": false,
      "rendered-text": "Gain 2●.",
      "amplified-text": "Gain 2●. Draw a card.",
      "image-number": 1,
      "art-owned": false,
    });
    expect(result.amplifiedText).toContain("Draw a card");
  });

  it("rejects an authored Event Amplified form that adds draw", () => {
    expect(() =>
      transformCard({
        name: "Amplified fixture",
        id: "amplified-fixture",
        "card-number": 1,
        "card-type": "Event",
        "energy-cost": 2,
        "is-fast": false,
        "rendered-text": "Gain 2●.",
        "amplified-text": "Gain 2●. Draw a card.",
        "image-number": 1,
        "art-owned": false,
      }),
    ).toThrow(/adds draw to an Event without base draw/u);
  });

  it("allows an Amplified form to improve a discovered card after selection", () => {
    const result = transformCard({
      name: "Amplified fixture",
      id: "amplified-fixture",
      "card-number": 1,
      "card-type": "Event",
      "energy-cost": 2,
      "is-fast": false,
      "rendered-text": "Discover a ≤2● cost character, then materialize it.",
      "amplified-text":
        "Discover a ≤2● cost character, then materialize it with awakened.",
      "image-number": 1,
      "art-owned": false,
    });
    expect(result.amplifiedText).toContain("with awakened");
  });

  it("rejects an authored Amplified form that changes Discover criteria", () => {
    expect(() =>
      transformCard({
        name: "Amplified fixture",
        id: "amplified-fixture",
        "card-number": 1,
        "card-type": "Event",
        "energy-cost": 2,
        "is-fast": false,
        "rendered-text": "Discover a ≤2● cost character, then materialize it.",
        "amplified-text": "Discover a ≤3● cost character, then materialize it.",
        "image-number": 1,
        "art-owned": false,
      }),
    ).toThrow(/changes Discover criteria/u);
  });

  it("rejects authored text that changes activated costs", () => {
    expect(() =>
      transformCard({
        name: "Amplified fixture",
        id: "amplified-fixture",
        "card-number": 1,
        "card-type": "Character",
        "energy-cost": 2,
        "is-fast": false,
        "rendered-text": "3●: Store 1⧗.",
        "amplified-text": "2●: Store 1⧗.",
        "image-number": 1,
        "art-owned": false,
      }),
    ).toThrow(/changes an activated ability cost/u);
  });

  it("allows an Amplified form to change a retained Reclaim value", () => {
    const result = transformCard({
      name: "Amplified fixture",
      id: "amplified-fixture",
      "card-number": 1,
      "card-type": "Character",
      "energy-cost": 1,
      "is-fast": false,
      "rendered-text": "▸Dawn: Gain 1●.\n\nReclaim 3●",
      "amplified-text": "▸Dawn: Gain 2●.\n\nReclaim 2●",
      "image-number": 1,
      "art-owned": false,
    });

    expect(result.amplifiedText).toBe("▸Dawn: Gain 2●.\n\nReclaim 2●");
  });

  it("rejects an Amplified form that adds or removes Reclaim", () => {
    const base = {
      name: "Amplified fixture",
      id: "amplified-fixture",
      "card-number": 1,
      "card-type": "Character",
      "energy-cost": 1,
      "is-fast": false,
      "image-number": 1,
      "art-owned": false,
    };

    expect(() =>
      transformCard({
        ...base,
        "rendered-text": "▸Dawn: Gain 1●.",
        "amplified-text": "▸Dawn: Gain 2●.\n\nReclaim 2●",
      }),
    ).toThrow(/adds or removes Reclaim/u);
    expect(() =>
      transformCard({
        ...base,
        "rendered-text": "▸Dawn: Gain 1●.\n\nReclaim 3●",
        "amplified-text": "▸Dawn: Gain 2●.",
      }),
    ).toThrow(/adds or removes Reclaim/u);
  });

  it("rejects authored text that breaks later Perfected transforms", () => {
    expect(() =>
      transformCard({
        name: "Amplified fixture",
        id: "amplified-fixture",
        "card-number": 1,
        "card-type": "Character",
        "energy-cost": 2,
        "is-fast": false,
        "rendered-text": "▸Dawn: Gain 1●.\n\n2●, ☾: Gain 1✦.",
        "amplified-text": "Gain 2●.\n\nGain 2✦.",
        "image-number": 1,
        "art-owned": false,
      }),
    ).toThrow(/changes (?:a named trigger|an activated ability cost)/u);
  });
});

describe("parseSpark", () => {
  it("preserves a numeric spark", () => {
    expect(parseSpark(3)).toEqual({ spark: 3, variable: false });
    expect(parseSpark("5")).toEqual({ spark: 5, variable: false });
  });

  it("flags the variable markers as a variable spark", () => {
    expect(parseSpark("X")).toEqual({ spark: null, variable: true });
    expect(parseSpark("x")).toEqual({ spark: null, variable: true });
    expect(parseSpark("*")).toEqual({ spark: null, variable: true });
  });

  it("treats blank or missing spark as no spark", () => {
    expect(parseSpark("")).toEqual({ spark: null, variable: false });
    expect(parseSpark(undefined)).toEqual({ spark: null, variable: false });
  });
});

describe("transformCard spark", () => {
  const base = {
    name: "Spark Card",
    id: "spark-card",
    "card-number": 1,
    "card-type": "Character",
    "energy-cost": 1,
    "is-fast": false,
    tides: [],
    "rendered-text": "",
    "image-number": 1,
    "art-owned": false,
  };

  it("emits sparkVariable for a variable spark", () => {
    const result = transformCard({ ...base, spark: "X" });
    expect(result.spark).toBe(null);
    expect(result.sparkVariable).toBe(true);
  });

  it("omits sparkVariable for a numeric spark", () => {
    const result = transformCard({ ...base, spark: 4 });
    expect(result.spark).toBe(4);
    expect("sparkVariable" in result).toBe(false);
  });

  it("omits sparkVariable for a blank spark", () => {
    const result = transformCard({ ...base, spark: "" });
    expect(result.spark).toBe(null);
    expect("sparkVariable" in result).toBe(false);
  });
});
