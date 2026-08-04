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

export const EXPLORATION_EFFECT_DEFINITIONS = [
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
    templateIds: [58],
    fields: [field("subtype", "Subtype", "subtype")],
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
    templateIds: [19],
    fields: [
      field("predicate", "Card predicate", "predicate", { defaultValue: "character" }),
      field("transfiguration", "Transfiguration", "transfiguration", {
        defaultValue: "Empowered",
      }),
    ],
  },
  {
    kind: "gain-offered-card",
    label: "Gain an offered card",
    templateIds: [11],
    fields: [field("predicate", "Offer predicate", "predicate", {
      defaultValue: "character",
    })],
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
];

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
