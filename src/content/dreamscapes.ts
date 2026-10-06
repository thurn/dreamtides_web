// Defines the Dream Atlas regions, their stable identities, and their journey-specific composition.

export const DREAMSCAPES = [
  // Boss composition and presentation are defined by the Atlas catalog.
  {
    // Stable UUID persisted on Atlas nodes and in game logs.
    id: "84310493-f7cb-4749-9ceb-ef3b0717e46b",
    // Filename stem of the hosted scene (`dreamscapes/<artKey>.png`) and icon
    // (`dreamscape-icons/<artKey>.png`) art.
    artKey: "firstlight_meadow",
    name: "Firstlight Meadow",
    // The starter has no resident guide, so its signature site is defined here.
    signatureSite: "Draft",
    isStarter: true,
    // Fixed sites are presented in this order; repeated Draft entries are intentional.
    fixedSites: ["Draft", "Draft", "DreamsignRevelation", "Purge", "Battle"],
    atlasDescription: "A quiet place where every dream journey begins.",
    guideId: null,
    affiliationId: null,
    avatarIds: [],
  },
  {
    id: "31042197-2621-42bd-8b23-500dfe1f56c0",
    artKey: "tumbleleaf_village",
    name: "Tumbleleaf Village",
    // Shapes card selection and opponent construction in this region.
    affiliationId: "4b715cd0-8b41-4b82-9cef-c47b15e8992b",
    // Restricts opponent selection to these Avatars when using the corpus algorithm.
    avatarIds: [
      "94e7c651-25e9-4a62-9de4-eaf5ba20542c",
      "3ebaba62-9000-429d-b203-2a5a9724389a",
      "2c53b1b9-9291-4bba-8d3a-f40b545c8f3c",
    ],
    guideId: "e915cbd5-d7b1-4c97-979a-553ec7f1c923", // Tobias Tanglefur
    signatureSite: "Shop",
    isStarter: false,
  },
  {
    id: "63f0e601-12b6-499f-9d04-06cd46323e4d",
    artKey: "pharaohs_gate",
    name: "Pharaoh's Gate",
    affiliationId: "c3815562-e80d-4afc-8ba6-91bd60ad323e",
    avatarIds: [
      "c72cfd7b-408b-47f6-adf1-1e486a7e20d3",
      "6488452d-4e9e-466c-96df-716d4ec646b1",
      "60bd584b-5bc8-4ee7-8a98-cbb304eb71ab",
      "f0f5449e-01c2-4635-bce1-76b179fc2108",
    ],
    guideId: "dcf43929-2412-4817-b743-3254f3d102b9", // Amunet, the Tomb-Keeper
    signatureSite: "DreamsignBazaar",
    isStarter: false,
  },
  {
    id: "3d520651-46b8-4e27-9e57-333da77bbdd3",
    artKey: "winterwake_fjords",
    name: "Winterwake Fjords",
    affiliationId: "a544314c-2e90-42b1-ba04-06c7f2f0a6f9",
    avatarIds: [
      "fe2510d9-bfee-4c35-97f9-30e0cd2e2851",
      "bdd3a3a7-242c-4d2b-8071-ebe56891a340",
      "5e28154d-770a-4b84-8aac-9de44f5d7d02",
    ],
    guideId: "7c4f7807-a1fe-419e-a011-b5de0828e7f0", // Sigrún
    signatureSite: "DreamsignRevelation",
    isStarter: false,
  },
  {
    id: "db2a796d-31b0-4bed-8b0a-22113e1754f2",
    artKey: "frostforge",
    name: "Frostforge",
    affiliationId: "04103386-ca4e-42a0-9a90-150297a20e91",
    avatarIds: [
      "2b7e921d-0cd7-4c20-a415-9e7eede7b477",
      "84e7020c-7384-4cc3-a20f-ab05f03cc375",
      "f6208407-c4e9-42ac-b533-346704f5e39e",
    ],
    guideId: "9bdd56c6-ce73-4105-a954-3d873578ce03", // Durgan Forgehammer
    signatureSite: "Transfiguration",
    isStarter: false,
  },
  {
    id: "829da88a-9f61-4d1c-8a26-180a01d1b5f2",
    artKey: "hopes_end",
    name: "Hope's End",
    affiliationId: "8b30f0bf-6b9d-47c0-92ba-80f62ae8899d",
    avatarIds: [
      "6029be40-75b9-4c07-912f-9718b6c5c747",
      "3c4773e4-f8e1-4686-86cb-b407a42489d4",
      "1cc5a88a-134f-42f7-a0ae-95ace44b3745",
    ],
    guideId: "d16b65b6-b788-421c-9f94-df7c017c2e3e", // Deacon Holt
    signatureSite: "Duplication",
    isStarter: false,
  },
  {
    id: "a9bd9f2c-a859-415b-8fa5-60df9710c1a1",
    artKey: "tsukiren",
    name: "Tsukiren",
    affiliationId: "33dee3b4-19d2-4788-9cef-b69057385844",
    avatarIds: [
      "bf72adff-7d74-4be8-9b93-1db7ba13a1db",
      "bfc40414-5264-41bf-86e1-a0f41ee4f5b5",
      "91d4c3b5-fd63-480b-9ed5-979109a227bb",
    ],
    guideId: "b5dfa69f-93c3-4618-a2d9-1bec1a27eaae", // Master Takeshi
    signatureSite: "Purge",
    isStarter: false,
  },
  {
    id: "f413a98f-10d2-4578-8031-cc6ce57b61b4",
    artKey: "wilderveil",
    name: "Wilderveil",
    affiliationId: "c674a92f-3860-4851-8357-dd4f3e469674",
    avatarIds: [
      "b9bf6d4b-907c-4750-b51c-811aff29de59",
      "9d64a4a2-3dc7-456e-9eb2-5fe3a48883c4",
      "16b579fe-c15b-4df6-8262-d45ce44732ae",
    ],
    guideId: "7d81eeb7-69c1-4bb5-9755-06d60280d3a5", // Aldric, the Seer
    signatureSite: "Augury",
    isStarter: false,
  },
  {
    id: "ce7f54bc-63ad-4105-a0e1-3a910b54c78d",
    artKey: "rust_expanse",
    name: "The Rust Expanse",
    affiliationId: "d1a8f46d-0efe-4ae6-bda3-0866d5d20633",
    avatarIds: [
      "133e22dd-f81b-406d-b4e3-98c346d7fd4e",
      "9e4862fd-e18c-463e-9d5f-e5d73c29a66f",
      "81954ca0-da36-49dd-915c-1ccb1b2d7b05",
    ],
    guideId: "e67ac921-40cd-48bc-8b7f-051f8dd692ef", // Maddox
    signatureSite: "RandomSite",
    isStarter: false,
  },
  {
    id: "cefa9a2b-b0ce-4ba3-be09-d97627a48d70",
    artKey: "farpoint_station",
    name: "Farpoint Station",
    affiliationId: "96258dfd-33c9-44a7-96a5-6747eb42cc60",
    avatarIds: [
      "9e19b3d1-12f2-43c1-9cb1-08de7cd32e32",
      "8a2fcd65-bba7-459c-a6b0-f0391b9293fd",
      "b99936ca-97f9-4930-af5a-fa9ef92557ef",
    ],
    guideId: "05161908-e15c-4acb-b35e-ccbe58e99c08", // Gravok
    signatureSite: "Gamble",
    isStarter: false,
  },
  {
    id: "40ec06a6-bd39-4ca8-97c4-628b6d686672",
    artKey: "grid_city",
    name: "Grid City",
    affiliationId: "0f09352d-3a1d-44db-a58e-229ab834cdc3",
    avatarIds: [
      "86026206-1b11-4f38-a24e-fd3c697f5353",
      "b8c1b0ab-0fe6-47d6-b576-0c2231aeb81e",
      "ba973428-6d90-4847-b779-cb7e25a5ac84",
      "4d5e3933-7dd6-406b-922d-dd78acfa044a",
    ],
    guideId: "1cb84e30-c2bf-43fa-8cf9-0cdaf83d3e31", // "Layaway"
    signatureSite: "Exploration",
    isStarter: false,
  },
];
