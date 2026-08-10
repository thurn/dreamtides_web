import {
  isRewardMechanicId,
  isRewardSelectionPolicyId,
  mechanicSupportsPolicy,
  REWARD_CARD_PREDICATES,
} from "./reward-selection-contracts.mjs";

export const EXPLORATION_PREDICATES = [
  { value: "", label: "Any card" },
  { value: "character", label: "Character" },
  { value: "event", label: "Event" },
  { value: "cheap-character", label: "≤2● cost Character" },
  { value: "spirit-animal", label: "Spirit Animal" },
  { value: "survivor", label: "Survivor" },
  { value: "warrior", label: "Warrior" },
];

if (!EXPLORATION_PREDICATES.every(({ value }) =>
  value === "" || REWARD_CARD_PREDICATES.includes(value))) {
  throw new Error("Exploration predicate options are out of sync with reward selection");
}

export const EXPLORATION_TRANSFIGURATIONS = [
  "Empowered", "Amplified", "Kindled", "Inspired", "Enduring",
  "Hastened", "Resonant", "Attuned", "Perfected",
];

/** Code-owned editor schema for the closed typed Exploration effect variants. */
export const EXPLORATION_EFFECT_SCHEMAS = [
  {
    "kind": "purge-and-copy",
    "label": "Purge and copy",
    "canonicalMechanicId": "purge-and-duplicate",
    "fields": []
  },
  {
    "kind": "gain-dreamsign",
    "label": "Gain Dreamsign",
    "canonicalMechanicId": "gain-dreamsign",
    "defaultSelectionPolicyId": "fixed",
    "allowedSelectionPolicyIds": [
      "fixed"
    ],
    "fields": [
      {
        "key": "dreamsignId",
        "label": "Dreamsign",
        "control": "dreamsign"
      }
    ]
  },
  {
    "kind": "gain-card",
    "label": "Gain named card",
    "canonicalMechanicId": "gain-card",
    "defaultSelectionPolicyId": "fixed",
    "allowedSelectionPolicyIds": [
      "fixed"
    ],
    "fields": [
      {
        "key": "cardId",
        "label": "Card",
        "control": "card"
      }
    ]
  },
  {
    "kind": "transfigure-selected",
    "label": "Transfigure selected card",
    "canonicalMechanicId": "transfigure-deck-entry",
    "defaultSelectionPolicyId": "transfiguration-value",
    "allowedSelectionPolicyIds": [
      "uniform",
      "transfiguration-value"
    ],
    "fields": [
      {
        "key": "predicate",
        "label": "Card predicate",
        "control": "predicate",
        "optional": true
      }
    ]
  },
  {
    "kind": "purge-selected",
    "label": "Purge selected cards",
    "canonicalMechanicId": "purge-deck-entry",
    "defaultSelectionPolicyId": "purge-misfit",
    "allowedSelectionPolicyIds": [
      "uniform",
      "purge-misfit"
    ],
    "fields": [
      {
        "key": "predicate",
        "label": "Card predicate",
        "control": "predicate",
        "optional": true
      },
      {
        "key": "count",
        "label": "Count",
        "control": "number",
        "defaultValue": 1,
        "min": 1
      }
    ]
  },
  {
    "kind": "choose-pack",
    "label": "Choose a pack",
    "canonicalMechanicId": "pack-chooser",
    "defaultSelectionPolicyId": "card-bundle",
    "allowedSelectionPolicyIds": [
      "uniform",
      "card-fit",
      "card-bundle"
    ],
    "fields": [
      {
        "key": "predicate",
        "label": "Card predicate",
        "control": "predicate",
        "defaultValue": "character"
      },
      {
        "key": "packCount",
        "label": "Pack count",
        "control": "number",
        "defaultValue": 2,
        "min": 1
      },
      {
        "key": "packSize",
        "label": "Pack size",
        "control": "number",
        "defaultValue": 3,
        "min": 1
      }
    ]
  },
  {
    "kind": "draft-card",
    "label": "Draft a card",
    "canonicalMechanicId": "catalog-card-chooser",
    "defaultSelectionPolicyId": "card-fit",
    "allowedSelectionPolicyIds": [
      "uniform",
      "card-fit",
      "card-fit-quality"
    ],
    "fields": [
      {
        "key": "predicate",
        "label": "Card predicate",
        "control": "predicate",
        "defaultValue": "character"
      },
      {
        "key": "offerCount",
        "label": "Offer count",
        "control": "number",
        "defaultValue": 4,
        "min": 1
      },
      {
        "key": "count",
        "label": "Copies",
        "control": "number",
        "defaultValue": 1,
        "min": 1
      }
    ]
  },
  {
    "kind": "purge-for-essence",
    "label": "Purge for essence",
    "canonicalMechanicId": "purge-for-essence",
    "defaultSelectionPolicyId": "purge-misfit",
    "allowedSelectionPolicyIds": [
      "uniform",
      "purge-misfit"
    ],
    "fields": [
      {
        "key": "essencePerSpark",
        "label": "Essence per spark",
        "control": "number",
        "defaultValue": 40,
        "min": 1,
        "step": 10,
        "resource": "essence"
      }
    ]
  },
  {
    "kind": "change-subtype-selected",
    "label": "Change selected subtype",
    "canonicalMechanicId": "change-entry-subtype",
    "defaultSelectionPolicyId": "deck-entry-centrality",
    "allowedSelectionPolicyIds": [
      "uniform",
      "deck-entry-centrality"
    ],
    "fields": [
      {
        "key": "deckTarget",
        "label": "Deck target",
        "control": "deck-target",
        "defaultValue": "chosen"
      },
      {
        "key": "predicate",
        "label": "Card predicate",
        "control": "predicate",
        "optional": true
      },
      {
        "key": "subtype",
        "label": "Subtype",
        "control": "subtype"
      }
    ]
  },
  {
    "kind": "change-subtype-all",
    "label": "Choose subtype for all characters",
    "canonicalMechanicId": "change-deck-subtype",
    "fields": [
      {
        "key": "subtypeOptions",
        "label": "Subtype options",
        "control": "subtype-options"
      }
    ]
  },
  {
    "kind": "take-cards",
    "label": "Take offered cards",
    "canonicalMechanicId": "catalog-card-chooser",
    "defaultSelectionPolicyId": "card-fit",
    "allowedSelectionPolicyIds": [
      "uniform",
      "card-fit",
      "card-fit-quality"
    ],
    "fields": [
      {
        "key": "predicate",
        "label": "Card predicate",
        "control": "predicate",
        "defaultValue": "character"
      },
      {
        "key": "offerCount",
        "label": "Offer count",
        "control": "number",
        "defaultValue": 4,
        "min": 1
      }
    ]
  },
  {
    "kind": "replace-selected-with-card",
    "label": "Replace selected card with a fixed card",
    "canonicalMechanicId": "replace-deck-entry",
    "defaultSelectionPolicyId": "fixed",
    "allowedSelectionPolicyIds": [
      "fixed"
    ],
    "fields": [
      {
        "key": "predicate",
        "label": "Card predicate",
        "control": "predicate",
        "optional": true
      },
      {
        "key": "cardId",
        "label": "Replacement card",
        "control": "card"
      }
    ]
  },
  {
    "kind": "replace-selected",
    "label": "Replace selected card",
    "canonicalMechanicId": "replace-deck-entry",
    "defaultSelectionPolicyId": "card-fit-quality",
    "allowedSelectionPolicyIds": [
      "uniform",
      "card-fit-quality"
    ],
    "fields": [
      {
        "key": "predicate",
        "label": "Replacement predicate",
        "control": "predicate",
        "defaultValue": "character"
      }
    ]
  },
  {
    "kind": "gain-nightmare-and-card",
    "label": "Gain Nightmares and a card",
    "canonicalMechanicId": "gain-nightmare-and-card",
    "defaultSelectionPolicyId": "fixed",
    "allowedSelectionPolicyIds": [
      "fixed"
    ],
    "fields": [
      {
        "key": "cardId",
        "label": "Card",
        "control": "card"
      },
      {
        "key": "nightmareCount",
        "label": "Nightmare count",
        "control": "number",
        "defaultValue": 1,
        "min": 1
      }
    ]
  },
  {
    "kind": "gain-random-cards",
    "label": "Gain random cards",
    "canonicalMechanicId": "gain-card",
    "defaultSelectionPolicyId": "card-bundle",
    "allowedSelectionPolicyIds": [
      "uniform",
      "card-fit",
      "card-fit-quality",
      "card-bundle"
    ],
    "fields": [
      {
        "key": "predicate",
        "label": "Card predicate",
        "control": "predicate",
        "defaultValue": "character"
      },
      {
        "key": "count",
        "label": "Count",
        "control": "number",
        "defaultValue": 1,
        "min": 1
      }
    ]
  },
  {
    "kind": "transfigure-fixed-selected",
    "label": "Apply a fixed transfiguration",
    "canonicalMechanicId": "transfigure-deck-entry",
    "defaultSelectionPolicyId": "transfiguration-value",
    "allowedSelectionPolicyIds": [
      "uniform",
      "transfiguration-value"
    ],
    "fields": [
      {
        "key": "deckTarget",
        "label": "Deck target",
        "control": "deck-target",
        "defaultValue": "chosen"
      },
      {
        "key": "predicate",
        "label": "Card predicate",
        "control": "predicate",
        "optional": true
      },
      {
        "key": "transfiguration",
        "label": "Transfiguration",
        "control": "transfiguration",
        "defaultValue": "Empowered"
      }
    ]
  },
  {
    "kind": "gain-offered-card",
    "label": "Gain generated card",
    "canonicalMechanicId": "gain-card",
    "defaultSelectionPolicyId": "card-fit-quality",
    "allowedSelectionPolicyIds": [
      "uniform",
      "card-fit",
      "card-fit-quality"
    ],
    "fields": [
      {
        "key": "predicate",
        "label": "Offer predicate",
        "control": "predicate",
        "defaultValue": "character"
      },
      {
        "key": "count",
        "label": "Copies",
        "control": "number",
        "defaultValue": 1,
        "min": 1
      }
    ]
  },
  {
    "kind": "transfigure-next-draft-or-shop",
    "label": "Transfigure the next Draft or Shop",
    "canonicalMechanicId": "next-site-transfiguration",
    "fields": []
  },
  {
    "kind": "gain-essence-per-card",
    "label": "Gain essence per card",
    "canonicalMechanicId": "gain-essence-by-deck-predicate",
    "fields": [
      {
        "key": "predicate",
        "label": "Card predicate",
        "control": "predicate",
        "defaultValue": "character"
      },
      {
        "key": "essencePerCard",
        "label": "Essence per card",
        "control": "number",
        "defaultValue": 10,
        "min": 1,
        "step": 10,
        "resource": "essence"
      }
    ]
  },
  {
    "kind": "increase-spark-all",
    "label": "Increase spark for all characters",
    "canonicalMechanicId": "increase-deck-spark",
    "fields": [
      {
        "key": "sparkBonus",
        "label": "Spark bonus",
        "control": "number",
        "defaultValue": 1,
        "min": 1,
        "resource": "spark"
      }
    ]
  },
  {
    "kind": "purge-random-subtype-and-increase-spark",
    "label": "Purge random subtype and strengthen survivors",
    "canonicalMechanicId": "purge-deck-entry",
    "defaultSelectionPolicyId": "uniform",
    "allowedSelectionPolicyIds": [
      "uniform"
    ],
    "fields": [
      {
        "key": "subtype",
        "label": "Character subtype",
        "control": "subtype"
      },
      {
        "key": "sparkBonus",
        "label": "Spark bonus",
        "control": "number",
        "defaultValue": 1,
        "min": 1,
        "resource": "spark"
      }
    ]
  },
  {
    "kind": "gain-random-dreamsign",
    "label": "Gain random Dreamsign",
    "canonicalMechanicId": "gain-dreamsign",
    "defaultSelectionPolicyId": "dreamsign-match",
    "allowedSelectionPolicyIds": [
      "uniform",
      "dreamsign-match"
    ],
    "fields": []
  },
  {
    "kind": "purge-dreamsign-for-essence",
    "label": "Purge Dreamsign for essence",
    "canonicalMechanicId": "purge-dreamsign-for-essence",
    "fields": [
      {
        "key": "essence",
        "label": "Essence",
        "control": "number",
        "defaultValue": 50,
        "min": 1,
        "step": 10,
        "resource": "essence"
      }
    ]
  },
  {
    "kind": "make-fast-all",
    "label": "Make all cards fast",
    "canonicalMechanicId": "make-deck-fast",
    "fields": []
  },
  {
    "kind": "reduce-cost-all-and-gain-nightmares",
    "label": "Reduce costs and gain Nightmares",
    "canonicalMechanicId": "reduce-deck-cost-and-add-nightmares",
    "fields": [
      {
        "key": "energyCostReduction",
        "label": "Energy cost reduction",
        "control": "number",
        "defaultValue": 1,
        "min": 1,
        "resource": "energy"
      },
      {
        "key": "nightmareCount",
        "label": "Nightmare count",
        "control": "number",
        "defaultValue": 3,
        "min": 1
      }
    ]
  },
  {
    "kind": "copy-selected-card",
    "label": "Copy a selected deck card",
    "canonicalMechanicId": "duplicate-deck-entry",
    "defaultSelectionPolicyId": "duplicate-value",
    "allowedSelectionPolicyIds": [
      "uniform",
      "duplicate-value"
    ],
    "fields": [
      {
        "key": "deckTarget",
        "label": "Deck target",
        "control": "deck-target",
        "defaultValue": "chosen"
      },
      {
        "key": "predicate",
        "label": "Card predicate",
        "control": "predicate",
        "optional": true
      },
      {
        "key": "count",
        "label": "Copies",
        "control": "number",
        "defaultValue": 1,
        "min": 1
      }
    ]
  },
  {
    "kind": "copy-selected-cards",
    "label": "Copy selected deck cards",
    "canonicalMechanicId": "duplicate-deck-entry",
    "defaultSelectionPolicyId": "duplicate-value",
    "allowedSelectionPolicyIds": [
      "uniform",
      "duplicate-value"
    ],
    "fields": [
      {
        "key": "count",
        "label": "Cards to copy",
        "control": "number",
        "defaultValue": 2,
        "min": 1
      }
    ]
  },
  {
    "kind": "copy-offered-deck-card",
    "label": "Copy an offered deck card",
    "canonicalMechanicId": "duplicate-deck-entry",
    "defaultSelectionPolicyId": "duplicate-value",
    "allowedSelectionPolicyIds": [
      "uniform",
      "duplicate-value"
    ],
    "fields": [
      {
        "key": "offerCount",
        "label": "Offer count",
        "control": "number",
        "defaultValue": 4,
        "min": 1
      }
    ]
  },
  {
    "kind": "next-battle-opening-hand",
    "label": "Increase next opening hand",
    "canonicalMechanicId": "next-battle-modifier",
    "fields": [
      {
        "key": "count",
        "label": "Additional cards",
        "control": "number",
        "defaultValue": 1,
        "min": 1
      }
    ]
  },
  {
    "kind": "next-battle-starting-energy",
    "label": "Increase next starting energy",
    "canonicalMechanicId": "next-battle-modifier",
    "fields": [
      {
        "key": "count",
        "label": "Additional energy",
        "control": "number",
        "defaultValue": 1,
        "min": 1,
        "resource": "energy"
      }
    ]
  },
  {
    "kind": "next-battle-smaller-hand-and-cost-discount",
    "label": "Reduce next opening hand and card costs",
    "canonicalMechanicId": "next-battle-modifier",
    "fields": []
  },
  {
    "kind": "choose-dream-avatar",
    "label": "Choose a new Dream Avatar",
    "canonicalMechanicId": "choose-dream-avatar",
    "defaultSelectionPolicyId": "uniform",
    "allowedSelectionPolicyIds": [
      "uniform"
    ],
    "fields": [
      {
        "key": "offerCount",
        "label": "Offer count",
        "control": "number",
        "defaultValue": 3,
        "min": 1
      }
    ]
  },
  {
    "kind": "purge-duplicates-and-grant-reclaim",
    "label": "Purge duplicates and grant Reclaim",
    "canonicalMechanicId": "purge-duplicates-and-grant-reclaim",
    "fields": []
  },
  {
    "kind": "transfigured-card-draft",
    "label": "Draft a transfigured card",
    "canonicalMechanicId": "transfigured-card-chooser",
    "defaultSelectionPolicyId": "card-fit",
    "allowedSelectionPolicyIds": [
      "uniform",
      "card-fit",
      "card-fit-quality"
    ],
    "fields": [
      {
        "key": "predicate",
        "label": "Card predicate",
        "control": "predicate",
        "defaultValue": "character"
      },
      {
        "key": "offerCount",
        "label": "Offer count",
        "control": "number",
        "defaultValue": 4,
        "min": 1
      }
    ]
  },
  {
    "kind": "add-site",
    "label": "Add a disclosed site",
    "canonicalMechanicId": "add-site",
    "defaultSelectionPolicyId": "site-uniform",
    "allowedSelectionPolicyIds": [
      "site-uniform"
    ],
    "fields": []
  }
];

for (const definition of EXPLORATION_EFFECT_SCHEMAS) {
  if (!isRewardMechanicId(definition.canonicalMechanicId)) {
    throw new Error(`Unknown Exploration mechanic ${definition.canonicalMechanicId}`);
  }
  if (definition.defaultSelectionPolicyId !== undefined) {
    if (!isRewardSelectionPolicyId(definition.defaultSelectionPolicyId)) {
      throw new Error(`Unknown Exploration selection policy ${definition.defaultSelectionPolicyId}`);
    }
    for (const policyId of definition.allowedSelectionPolicyIds) {
      if (!isRewardSelectionPolicyId(policyId) ||
          !mechanicSupportsPolicy(definition.canonicalMechanicId, policyId)) {
        throw new Error(`Exploration policy ${policyId} is incompatible with ${definition.canonicalMechanicId}`);
      }
    }
  }
}
