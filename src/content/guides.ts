// Dream guides, their home Dreamscapes, specialties, and site dialogue.

export const DREAM_GUIDES = [
  {
    id: "tobias_tanglefur",
    name: "Tobias Tanglefur",
    homeDreamscapeId: "31042197-2621-42bd-8b23-500dfe1f56c0", // Tumbleleaf Village
    siteType: "Shop",
    portraitSource: "tobias.png",
    homeSpecialty: "Tobias offers strong cards at a steep discount.",
    dialogue: {
      site: [
        "Welcome, friend! Browse a while.",
        "I've set aside something just for you.",
      ],
    },
  },
  {
    id: "amunet_the_tomb_keeper",
    name: "Amunet, the Tomb-Keeper",
    homeDreamscapeId: "63f0e601-12b6-499f-9d04-06cd46323e4d", // Pharaoh's Gate
    siteType: "DreamsignBazaar",
    portraitSource: "amunet.png",
    homeSpecialty: "Amunet will restock the dreamsign choices once at no cost.",
    dialogue: {
      site: [
        "The sands remember all dreams.",
        "Choose, and I shall show you another.",
      ],
    },
  },
  {
    id: "sigrun",
    name: "Sigrún",
    homeDreamscapeId: "3d520651-46b8-4e27-9e57-333da77bbdd3", // Winterwake Fjords
    siteType: "DreamsignRevelation",
    portraitSource: "sigrun.png",
    homeSpecialty:
      "Sigrún offers several dreamsign choices, tailored to your deck.",
    dialogue: {
      site: [
        "The frost reveals what is hidden. Pick one sign to claim.",
        "Your path is clearer than most. Pick one sign to claim.",
      ],
    },
  },
  {
    id: "durgan_forgehammer",
    name: "Durgan Forgehammer",
    homeDreamscapeId: "db2a796d-31b0-4bed-8b0a-22113e1754f2", // Frostforge
    siteType: "Transfiguration",
    portraitSource: "durgan.png",
    homeSpecialty: "Durgan can transfigure any card in your deck.",
    dialogue: {
      site: [
        "Stoke the forge — let's reshape it.",
        "Any card, any temper you like.",
      ],
    },
  },
  {
    id: "deacon_holt",
    name: "Deacon Holt",
    homeDreamscapeId: "829da88a-9f61-4d1c-8a26-180a01d1b5f2", // Hope's End
    siteType: "Duplication",
    portraitSource: "holt.png",
    homeSpecialty: "Deacon Holt can pick any card to duplicate.",
    dialogue: {
      site: [
        "We endure together, don't we?",
        "Pick one, and I'll make another.",
      ],
    },
  },
  {
    id: "master_takeshi",
    name: "Master Takeshi",
    homeDreamscapeId: "a9bd9f2c-a859-415b-8fa5-60df9710c1a1", // Tsukiren
    siteType: "Purge",
    portraitSource: "takeshi.png",
    homeSpecialty: "Master Takeshi will purge cards from your deck at no cost.",
    dialogue: {
      site: ["Let go of what weighs you down.", "A cleaner blade cuts truer."],
    },
  },
  {
    id: "aldric_the_seer",
    name: "Aldric, the Seer",
    homeDreamscapeId: "f413a98f-10d2-4578-8031-cc6ce57b61b4", // Wilderveil
    siteType: "Augury",
    portraitSource: "aldric.png",
    homeSpecialty: "Aldric offers curated visions of the future.",
    dialogue: {
      site: [
        "Two paths unfold before you. Choose one to shape your dream.",
        "Weigh both visions, then pick one path for your dream.",
        "The dream divides here. Choose one vision and make it yours.",
        "Two futures call to you. You may follow only one.",
        "Look closely at each path, then choose the one your dream will take.",
      ],
    },
  },
  {
    id: "maddox",
    name: "Maddox",
    homeDreamscapeId: "ce7f54bc-63ad-4105-a0e1-3a910b54c78d", // The Rust Expanse
    siteType: "RandomSite",
    portraitSource: "maddox.png",
    homeSpecialty:
      "Maddox presents three random enhanced sites and lets you choose one.",
    dialogue: {
      site: ["Let’s see where this road takes us."],
      "random-site": ["Three roads. Pick your poison."],
    },
  },
  {
    id: "gravok",
    name: "Gravok",
    homeDreamscapeId: "cefa9a2b-b0ce-4ba3-be09-d97627a48d70", // Farpoint Station
    siteType: "Gamble",
    portraitSource: "gravok.png",
    homeSpecialty: "Gravok offers you his highest rewards and best odds.",
    dialogue: {
      site: [
        "Fortune favors the bold, traveler.",
        "No fee tonight. Big stakes, though.",
      ],
      "gamble-three-gate": [
        "The game's called Three Gates. Place your bet on the next card drawn!",
      ],
      "gamble-ladder-climb": [
        "The game's Ladder Climb. Match or beat the target to win {win_essence} Essence and a Dreamsign. Try again with better odds if you miss!",
      ],
      "gamble-starway-stairs": [
        "Starway Stairs is the game. Keep betting to see how high you can go!",
      ],
      "gamble-four-suit-reprise": [
        "Four-Suit Reprise is the game. Choose one card; the suit decides what becomes of it.",
      ],
      "gamble-blackjack": [
        "Blackjack is the game. Beat my hand without going over 21!",
      ],
    },
  },
  {
    id: "layaway",
    name: '"Layaway"',
    homeDreamscapeId: "40ec06a6-bd39-4ca8-97c4-628b6d686672", // Grid City
    siteType: "Exploration",
    portraitSource: "layaway.png",
    homeSpecialty:
      "Layaway guides you deeper into the dream within the drawn card.",
    dialogue: {
      site: [
        "Every card dreams, friend. Draw one, and we'll step inside.",
        "Pick a direction. The dream will make the path.",
      ],
    },
  },
];
