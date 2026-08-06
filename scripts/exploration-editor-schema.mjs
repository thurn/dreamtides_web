export const EXPLORATION_PREDICATES = [
  { value: "", label: "Any card" },
  { value: "character", label: "Character" },
  { value: "event", label: "Event" },
  { value: "cheap-character", label: "≤2● cost Character" },
  { value: "spirit-animal", label: "Spirit Animal" },
  { value: "survivor", label: "Survivor" },
  { value: "warrior", label: "Warrior" },
];

export const EXPLORATION_TRANSFIGURATIONS = [
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

const field = (key, label, control, options = {}) => ({
  key,
  label,
  control,
  ...options,
});

const RAW_EXPLORATION_EFFECT_DEFINITIONS = [
  { kind: "purge-and-copy", label: "Purge and copy", templateIds: [61], fields: [] },
  {
    kind: "gain-dreamsign",
    label: "Gain Dreamsign",
    templateIds: [27],
    fields: [field("dreamsignId", "Dreamsign", "dreamsign")],
  },
  {
    kind: "gain-card",
    label: "Gain card",
    templateIds: [10],
    fields: [field("cardId", "Card", "card")],
  },
  {
    kind: "transfigure-selected",
    label: "Transfigure selected card",
    templateIds: [17],
    fields: [field("predicate", "Card predicate", "predicate", { optional: true })],
  },
  {
    kind: "purge-selected",
    label: "Purge selected cards",
    templateIds: [3, 4, 5, 6],
    fields: [
      field("predicate", "Card predicate", "predicate", {
        optional: true,
      }),
      field("count", "Count", "number", {
        defaultValue: 1, min: 1, templateIds: [5, 6],
      }),
    ],
  },
  {
    kind: "choose-pack",
    label: "Choose a pack",
    templateIds: [36],
    fields: [
      field("predicate", "Card predicate", "predicate", { defaultValue: "character" }),
      field("packCount", "Pack count", "number", { defaultValue: 2, min: 1 }),
      field("packSize", "Pack size", "number", { defaultValue: 3, min: 1 }),
    ],
  },
  {
    kind: "draft-card",
    label: "Draft a card",
    templateIds: [14, 15],
    fields: [
      field("predicate", "Card predicate", "predicate", { defaultValue: "character" }),
      field("offerCount", "Offer count", "number", { defaultValue: 4, min: 1 }),
      field("count", "Copies", "number", {
        defaultValue: 1, min: 1, templateIds: [15],
      }),
    ],
  },
  {
    kind: "purge-for-essence",
    label: "Purge for essence",
    templateIds: [60],
    fields: [field("essencePerSpark", "Essence per spark", "number", {
      defaultValue: 40, min: 1, step: 10, resource: "essence",
    })],
  },
  {
    kind: "change-subtype-selected",
    label: "Change selected subtype",
    templateIds: [53, 58],
    fields: [
      field("predicate", "Card predicate", "predicate", { optional: true }),
      field("subtype", "Subtype", "subtype"),
    ],
  },
  {
    kind: "change-subtype-all",
    label: "Choose subtype for all characters",
    templateIds: [67],
    fields: [field("subtypeOptions", "Subtype options", "subtype-options")],
  },
  {
    kind: "take-cards",
    label: "Take offered cards",
    templateIds: [16],
    fields: [
      field("predicate", "Card predicate", "predicate", { defaultValue: "character" }),
      field("offerCount", "Offer count", "number", { defaultValue: 4, min: 1 }),
    ],
  },
  {
    kind: "replace-selected-with-card",
    label: "Replace selected card with a fixed card",
    templateIds: [47],
    fields: [
      field("predicate", "Card predicate", "predicate", { optional: true }),
      field("cardId", "Replacement card", "card"),
    ],
  },
  {
    kind: "replace-selected",
    label: "Replace selected card",
    templateIds: [7],
    fields: [field("predicate", "Replacement predicate", "predicate", {
      defaultValue: "character",
    })],
  },
  {
    kind: "gain-nightmare-and-card",
    label: "Gain Nightmares and a card",
    templateIds: [70],
    fields: [
      field("cardId", "Card", "card"),
      field("nightmareCount", "Nightmare count", "number", { defaultValue: 1, min: 1 }),
    ],
  },
  {
    kind: "gain-random-cards",
    label: "Gain random cards",
    templateIds: [9, 13],
    fields: [
      field("predicate", "Card predicate", "predicate", { defaultValue: "character" }),
      field("count", "Count", "number", {
        defaultValue: 1, min: 1, templateIds: [13],
      }),
    ],
  },
  {
    kind: "transfigure-fixed-selected",
    label: "Apply a fixed transfiguration",
    templateIds: [18, 19],
    fields: [
      field("predicate", "Card predicate", "predicate", { optional: true }),
      field("transfiguration", "Transfiguration", "transfiguration", {
        defaultValue: "Empowered",
      }),
    ],
  },
  {
    kind: "gain-offered-card",
    label: "Gain an offered card",
    templateIds: [11, 12],
    fields: [
      field("predicate", "Offer predicate", "predicate", {
        defaultValue: "character",
      }),
      field("count", "Copies", "number", {
        defaultValue: 1, min: 1, templateIds: [12],
      }),
    ],
  },
  {
    kind: "transfigure-next-draft-or-shop",
    label: "Transfigure the next Draft or Shop",
    templateIds: [37],
    fields: [],
  },
  {
    kind: "gain-essence-per-card",
    label: "Gain essence per card",
    templateIds: [59],
    fields: [
      field("predicate", "Card predicate", "predicate", { defaultValue: "character" }),
      field("essencePerCard", "Essence per card", "number", {
        defaultValue: 10, min: 1, step: 10, resource: "essence",
      }),
    ],
  },
  {
    kind: "increase-spark-all",
    label: "Increase spark for all characters",
    templateIds: [64],
    fields: [field("sparkBonus", "Spark bonus", "number", {
      defaultValue: 1, min: 1, resource: "spark",
    })],
  },
  { kind: "gain-random-dreamsign", label: "Gain random Dreamsign", templateIds: [28], fields: [] },
  {
    kind: "purge-dreamsign-for-essence",
    label: "Purge Dreamsign for essence",
    templateIds: [62],
    fields: [field("essence", "Essence", "number", {
      defaultValue: 50, min: 1, step: 10, resource: "essence",
    })],
  },
  { kind: "make-fast-all", label: "Make all cards fast", templateIds: [66], fields: [] },
  {
    kind: "reduce-cost-all-and-gain-nightmares",
    label: "Reduce costs and gain Nightmares",
    templateIds: [65],
    fields: [
      field("energyCostReduction", "Energy cost reduction", "number", {
        defaultValue: 1, min: 1, resource: "energy",
      }),
      field("nightmareCount", "Nightmare count", "number", {
        defaultValue: 3, min: 1,
      }),
    ],
  },
  {
    kind: "copy-selected-card",
    label: "Copy a selected deck card",
    templateIds: [49, 50],
    fields: [
      field("predicate", "Card predicate", "predicate", { optional: true }),
      field("count", "Copies", "number", { defaultValue: 1, min: 1 }),
    ],
  },
  {
    kind: "copy-selected-cards",
    label: "Copy selected deck cards",
    templateIds: [51],
    fields: [
      field("count", "Cards to copy", "number", { defaultValue: 2, min: 1 }),
    ],
  },
  {
    kind: "copy-offered-deck-card",
    label: "Copy an offered deck card",
    templateIds: [55],
    fields: [field("offerCount", "Offer count", "number", { defaultValue: 4, min: 1 })],
  },
  {
    kind: "next-battle-opening-hand",
    label: "Increase next opening hand",
    templateIds: [38],
    fields: [field("count", "Additional cards", "number", { defaultValue: 1, min: 1 })],
  },
  {
    kind: "next-battle-starting-energy",
    label: "Increase next starting energy",
    templateIds: [39],
    fields: [field("count", "Additional energy", "number", {
      defaultValue: 1, min: 1, resource: "energy",
    })],
  },
  {
    kind: "next-battle-smaller-hand-and-cost-discount",
    label: "Reduce next opening hand and card costs",
    templateIds: [81],
    fields: [],
  },
  {
    kind: "choose-dream-avatar",
    label: "Choose a new Dream Avatar",
    templateIds: [57],
    fields: [field("offerCount", "Offer count", "number", { defaultValue: 3, min: 1 })],
  },
  {
    kind: "purge-duplicates-and-grant-reclaim",
    label: "Purge duplicates and grant Reclaim",
    templateIds: [79],
    fields: [],
  },
  {
    kind: "transfigured-card-draft",
    label: "Draft a transfigured card",
    templateIds: [83],
    fields: [
      field("predicate", "Card predicate", "predicate", { defaultValue: "character" }),
      field("offerCount", "Offer count", "number", { defaultValue: 4, min: 1 }),
    ],
  },
  { kind: "add-site", label: "Add a disclosed site", templateIds: [84], fields: [] },
];

const COMMON_SELECTION_BY_EFFECT_KIND = {
  "gain-card": ["gain-card", "fixed", ["fixed"]],
  "gain-offered-card": ["gain-card", "card-fit-quality", ["uniform", "card-fit", "card-fit-quality"]],
  "gain-random-cards": ["gain-card", "card-bundle", ["uniform", "card-fit", "card-fit-quality", "card-bundle"]],
  "draft-card": ["catalog-card-chooser", "card-fit", ["uniform", "card-fit", "card-fit-quality"]],
  "take-cards": ["catalog-card-chooser", "card-fit", ["uniform", "card-fit", "card-fit-quality"]],
  "choose-pack": ["pack-chooser", "card-bundle", ["uniform", "card-fit", "card-bundle"]],
  "gain-dreamsign": ["gain-dreamsign", "fixed", ["fixed"]],
  "gain-random-dreamsign": ["gain-dreamsign", "dreamsign-match", ["uniform", "dreamsign-match"]],
  "transfigure-selected": ["transfigure-deck-entry", "transfiguration-value", ["uniform", "transfiguration-value"]],
  "transfigure-fixed-selected": ["transfigure-deck-entry", "transfiguration-value", ["uniform", "transfiguration-value"]],
  "purge-selected": ["purge-deck-entry", "purge-misfit", ["uniform", "purge-misfit"]],
  "purge-for-essence": ["purge-deck-entry", "purge-misfit", ["uniform", "purge-misfit"]],
  "replace-selected": ["replace-deck-entry", "card-fit-quality", ["uniform", "card-fit-quality"]],
  "replace-selected-with-card": ["replace-deck-entry", "card-fit-quality", ["uniform", "card-fit-quality"]],
  "copy-selected-card": ["duplicate-deck-entry", "duplicate-value", ["uniform", "duplicate-value"]],
  "copy-selected-cards": ["duplicate-deck-entry", "duplicate-value", ["uniform", "duplicate-value"]],
  "copy-offered-deck-card": ["duplicate-deck-entry", "duplicate-value", ["uniform", "duplicate-value"]],
  "purge-and-copy": ["duplicate-deck-entry", "duplicate-value", ["uniform", "duplicate-value"]],
  "change-subtype-selected": ["change-entry-subtype", "deck-entry-centrality", ["uniform", "deck-entry-centrality"]],
  "choose-dream-avatar": ["choose-dream-avatar", "uniform", ["uniform"]],
  "transfigured-card-draft": ["transfigured-card-chooser", "card-fit", ["uniform", "card-fit", "card-fit-quality"]],
  "add-site": ["add-site", "site-uniform", ["site-uniform"]],
};

export const EXPLORATION_EFFECT_DEFINITIONS = RAW_EXPLORATION_EFFECT_DEFINITIONS.map(
  (definition) => {
    const selection = COMMON_SELECTION_BY_EFFECT_KIND[definition.kind];
    return selection === undefined
      ? definition
      : {
          ...definition,
          canonicalMechanicId: selection[0],
          defaultSelectionPolicyId: selection[1],
          allowedSelectionPolicyIds: selection[2],
        };
  },
);

export const EXPLORATION_EFFECT_DEFINITION_BY_KIND = new Map(
  EXPLORATION_EFFECT_DEFINITIONS.map((definition) => [definition.kind, definition]),
);

export const EXPLORATION_EFFECT_FIELD_KEYS = new Set(
  EXPLORATION_EFFECT_DEFINITIONS.flatMap((definition) =>
    definition.fields.map((entry) => entry.key)),
);

export function predicateDisplayName(predicate) {
  return EXPLORATION_PREDICATES.find((entry) => entry.value === predicate)?.label ?? predicate;
}
