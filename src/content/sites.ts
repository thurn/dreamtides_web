// Journey site metadata, placement, random-site behavior, and shared card choices.

export const SITES = {
  // Encounter sites are Augury and Exploration. They share these rules for
  // selecting deck entries and sites offered by their encounters.
  encounterSites: {
    // Purge-misfit encounters require at least this many deck entries.
    minDeckForPurge: 8,
    // Encounter rewards may place only these sites in the current Dreamscape.
    placeableSites: ["Shop", "Purge", "Transfiguration", "Duplication"],
  },
  rewards: {
    essence: {
      standard: {
        min: 200,
        max: 300,
      },
      enhanced: {
        min: 400,
        max: 600,
      },
    },
    reward: {
      fallbackEssence: {
        min: 150,
        max: 350,
      },
    },
    dreamsignRevelation: {
      standardOfferCount: 3,
      enhancedOfferCount: 4,
    },
  },
  purge: {
    // Each entry prices the next paid purge; the list length is the visit cap.
    marginalCosts: [40, 60, 90, 130, 180, 240],
    enhancedDiscountPercent: 30,
  },
  siteTypes: {
    Battle: {
      icon: "bxf bx-sword-alt",
      glossaryId: "85ffab8d-f972-4340-9b45-99f6aff6ccec",
      presentation: {
        kind: "battle",
        label: "Battle",
        finalBossLabel: "Final Boss",
      },
      rules: null,
    },
    Draft: {
      icon: "bxf bx-rectangle-vertical",
      glossaryId: "1ee13681-1ff5-431c-94a1-3390d45e1717",
      presentation: {
        kind: "draft",
        label: "Draft {pick_count}x",
      },
      rules: null,
    },
    Shop: {
      icon: "bxf bx-store-alt-2",
      glossaryId: "25f28ed1-5729-4240-a352-80f92fce530c",
      presentation: {
        kind: "shop",
        title: "Dream Market",
      },
      rules: null,
    },
    Purge: {
      icon: "bxf bx-hot",
      glossaryId: "4873bddf-7bf5-41e8-979e-36eb193db5a6",
      presentation: {
        kind: "purge",
        title: "Purge Cards",
      },
      rules: null,
    },
    Essence: {
      icon: "bxf bx-diamond-alt",
      glossaryId: "ba8ea132-f636-4fed-be27-e8eff0c9cb07",
      presentation: null,
      rules: null,
    },
    Transfiguration: {
      icon: "fa-solid fa-hammer",
      glossaryId: "7ae25c1a-76c5-4aed-9e1c-a2d5ec160bd7",
      presentation: null,
      rules: null,
    },
    Duplication: {
      icon: "bxf bx-copy",
      glossaryId: "8222c5e2-a3ce-4caf-bd13-5c77ff15d7cf",
      presentation: null,
      rules: {
        kind: "duplication",
        // Select eligible entries from the player's current deck.
        // Standard sites offer three candidates; enhanced sites expose every eligible entry.
        cardChoices: {
          standardLimit: 3,
          enhancedLimit: null,
        },
      },
    },
    Reward: {
      icon: "bxf bx-treasure-chest",
      glossaryId: "28925242-3799-4faa-b4bd-b8aac52ca442",
      presentation: null,
      rules: null,
    },
    Augury: {
      icon: "bxf bx-eye",
      glossaryId: "ffd3977a-a463-4326-bdf2-5b1b8c3d9160",
      presentation: null,
      rules: null,
    },
    DreamsignBazaar: {
      icon: "bxf bx-pyramid",
      glossaryId: "5b5b47d6-c858-4b42-af96-a520c84666eb",
      presentation: {
        kind: "dreamsign-bazaar",
        title: "Dreamsign Bazaar",
      },
      rules: null,
    },
    DreamsignRevelation: {
      icon: "bxf bx-meteor",
      glossaryId: "ac70fd6b-a91a-407f-b7b7-255668cd6bec",
      presentation: null,
      rules: null,
    },
    RandomSite: {
      icon: "fa-solid fa-question",
      glossaryId: "1aeb05bc-53e1-4ea4-9e73-9239160799dc",
      presentation: null,
      rules: null,
    },
    Gamble: {
      icon: "bxf bx-coin",
      glossaryId: "f1ff2fb5-3d77-4eb8-b492-78cbe11fd265",
      presentation: null,
      rules: null,
    },
    Exploration: {
      icon: "bxf bx-compass",
      glossaryId: "46059d35-cb9e-4c4b-8635-087b6239f308",
      presentation: null,
      rules: null,
    },
  },
  randomSite: {
    destinations: [
      "Shop",
      "DreamsignBazaar",
      "DreamsignRevelation",
      "Transfiguration",
      "Duplication",
      "Purge",
      "Augury",
      "Gamble",
      "Exploration",
    ],
    homeChoiceCount: 3,
    insufficientDestinations: "fail",
    guideId: "maddox",
  },
  guideAssignments: {
    Shop: {
      guideId: "tobias_tanglefur",
      homeDreamscapeId: "31042197-2621-42bd-8b23-500dfe1f56c0", // Tumbleleaf Village
    },
    DreamsignBazaar: {
      guideId: "amunet_the_tomb_keeper",
      homeDreamscapeId: "63f0e601-12b6-499f-9d04-06cd46323e4d", // Pharaoh's Gate
    },
    DreamsignRevelation: {
      guideId: "sigrun",
      homeDreamscapeId: "3d520651-46b8-4e27-9e57-333da77bbdd3", // Winterwake Fjords
    },
    Transfiguration: {
      guideId: "durgan_forgehammer",
      homeDreamscapeId: "db2a796d-31b0-4bed-8b0a-22113e1754f2", // Frostforge
    },
    Duplication: {
      guideId: "deacon_holt",
      homeDreamscapeId: "829da88a-9f61-4d1c-8a26-180a01d1b5f2", // Hope's End
    },
    Purge: {
      guideId: "master_takeshi",
      homeDreamscapeId: "a9bd9f2c-a859-415b-8fa5-60df9710c1a1", // Tsukiren
    },
    Augury: {
      guideId: "aldric_the_seer",
      homeDreamscapeId: "f413a98f-10d2-4578-8031-cc6ce57b61b4", // Wilderveil
    },
    RandomSite: {
      guideId: "maddox",
      homeDreamscapeId: "ce7f54bc-63ad-4105-a0e1-3a910b54c78d", // The Rust Expanse
    },
    Gamble: {
      guideId: "gravok",
      homeDreamscapeId: "cefa9a2b-b0ce-4ba3-be09-d97627a48d70", // Farpoint Station
    },
    Exploration: {
      guideId: "layaway",
      homeDreamscapeId: "40ec06a6-bd39-4ca8-97c4-628b6d686672", // Grid City
    },
  },
};
