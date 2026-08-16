import { assertLocalized } from "@trox/runtime";
import {
  parseCardId,
  parseCardName,
  parseCardSubtype,
} from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import { parseDreamsignId } from "../../../types/identifiers";
import type { GameCardModel } from "../../components/card/CardView";
import { localizedDreamsignFixture } from "../../test-helpers/dreamsign-fixture";
import { localizedTransfigurationFormFixture } from "../../test-helpers/transfiguration-fixture";

/**
 * Curated real cards from the canonical catalog. Complete display snapshots
 * keep interaction demos synchronous while their UUIDs and image keys resolve
 * through the same art pipeline as production.
 */
const DEMO_CARDS = [
  {
    id: parseCardId("7be2e6d7-abff-4c44-a0c3-35460da1693c"),
    name: parseCardName("Windcutter"),
    cardNumber: 1,
    cardType: "Character",
    subtype: parseCardSubtype("Warrior"),
    isStarter: false,
    energyCost: 3,
    spark: 1,
    isFast: false,
    isInterrupt: false,
    renderedText: "▸Challenge: Banish an enemy until end of turn.",
    imageNumber: 454095982,
    artOwned: false,
    art: { x: -0.426, y: 1, scale: 1.37 },
  },
  {
    id: parseCardId("161482b6-af07-4d9e-822d-8c738672beb9"),
    name: parseCardName("Starlight Guide"),
    cardNumber: 2,
    cardType: "Character",
    subtype: parseCardSubtype("Guide"),
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: true,
    isInterrupt: false,
    renderedText: "▸Challenge: Rematerialize a character you control.",
    imageNumber: 2022594419,
    artOwned: false,
  },
  {
    id: parseCardId("b56ef7e8-c634-4d40-ac08-fab591dfbc4a"),
    name: parseCardName("Light of Emergence"),
    cardNumber: 3,
    cardType: "Event",
    subtype: parseCardSubtype(""),
    isStarter: false,
    energyCost: 4,
    spark: null,
    isFast: true,
    isInterrupt: true,
    renderedText: "Offering\n\nDraw 2 cards.",
    imageNumber: 618071684,
    artOwned: false,
    art: { x: 0, y: 1, scale: 1.1 },
  },
  {
    id: parseCardId("9b9c2743-75b3-499d-b5fb-c3429c92d420"),
    name: parseCardName("Kindlehorn"),
    cardNumber: 4,
    cardType: "Character",
    subtype: parseCardSubtype("Spirit Animal"),
    isStarter: false,
    energyCost: 1,
    spark: 0,
    isFast: false,
    isInterrupt: false,
    renderedText: "▸Dawn: Gain 1●.\n\n4●, ☾: This character gains +1✦.",
    imageNumber: 1196004046,
    artOwned: false,
    art: { x: -0.056, y: 1, scale: 1.67 },
  },
  {
    id: parseCardId("967c714f-40c5-4a77-8e22-40691a2755d4"),
    name: parseCardName("Passage Through Oblivion"),
    cardNumber: 5,
    cardType: "Event",
    subtype: parseCardSubtype(""),
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    isInterrupt: false,
    renderedText: "Rematerialize a character you control.\n\nReclaim 1●.",
    imageNumber: 2212744813,
    artOwned: false,
    art: { x: -0.21, y: 1, scale: 1.17 },
  },
  {
    id: parseCardId("3a59cd3d-08a9-4a75-a5ab-c91b19d2d8c1"),
    name: parseCardName("Graywatch"),
    cardNumber: 6,
    cardType: "Character",
    subtype: parseCardSubtype("Survivor"),
    isStarter: false,
    energyCost: 3,
    spark: 2,
    isFast: false,
    isInterrupt: false,
    renderedText:
      "Vengeful\n\nWhen you play a card from your void, return this character to play.",
    imageNumber: 2218612335,
    artOwned: false,
    art: { x: -0.129, y: 0.897, scale: 1.07 },
  },
] as const satisfies readonly CardData[];

export function demoCardData(index: number): CardData {
  return DEMO_CARDS[(index - 1) % DEMO_CARDS.length];
}

export function demoCard(index: number): GameCardModel {
  const displaySnapshot = demoCardData(index);
  return { cardId: displaySnapshot.id, displaySnapshot };
}

export function demoIdentitySeed(index: number): string {
  return `92000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

const DEMO_DREAMSIGNS = [
  {
    id: parseDreamsignId("c706d0ba-2f41-4b14-95d8-db168ac6246c"),
    name: "Amplified Acorn",
    effectDescription:
      "Once per turn, when you discard a card, your next card this turn costs 2● less.",
    imageName: "acorn_gold.png",
    imageAlt:
      "Golden fruit-like charm with a mesh-patterned orb and smooth teardrop front.",
  },
  {
    id: parseDreamsignId("278ec1ab-f532-4862-84ae-63df5e49548c"),
    name: "Pyramid Relic",
    effectDescription:
      "The second character you play each turn costs 1● less.",
    imageName: "aertfact.png",
    imageAlt:
      "Blue-gray square panel with bright red-orange branching nodes and lines.",
  },
  {
    id: parseDreamsignId("6e20e6c7-295a-48b1-b252-b8b00d6902c9"),
    name: "Amanita",
    effectDescription:
      "Once per turn, when a character you control leaves play, your next character this turn costs 2● less.",
    imageName: "amanita.png",
    imageAlt: "Red spotted mushroom with white flecks and pale stem.",
  },
  {
    id: parseDreamsignId("49990864-1db0-4c08-91ae-40a1f04223e4"),
    name: "Algae",
    effectDescription:
      "Once per turn, when you draw a character, reduce its cost by 1● until end of turn.",
    imageName: "algae.png",
    imageAlt:
      "Shimmering lime-green ribbon or liquid fabric twisting in soft waves.",
  },
  {
    id: parseDreamsignId("3dd05e97-1af8-4ae9-8e1f-954eaa63e112"),
    name: "Flash Powder",
    effectDescription:
      "The first character you play each turn costs 2● less and has 0✦.",
    imageName: "Alchemical_Powder.png",
    imageAlt:
      "Red-orange faceted gem or crystal with rough, glowing, rounded shape.",
  },
  {
    id: parseDreamsignId("a42c99b2-f480-4f63-91a0-bd556120427d"),
    name: "Green Amulet",
    effectDescription: "The second card you draw each turn costs 2● less.",
    imageName: "amulet_2.png",
    imageAlt: "Bright green faceted gemstone pendant in a gold setting.",
  },
  {
    id: parseDreamsignId("3fd8861d-fc4c-4097-9e28-89cc37f5b3f4"),
    name: "Cloud Lens",
    effectDescription: "The second event you play each turn costs 1● less.",
    imageName: "amulet_3.png",
    imageAlt: "Gold-rimmed circular lens filled with purple and magenta clouds.",
  },
  {
    id: parseDreamsignId("8778bf17-4e0a-4ce7-b23c-4daf49a782a7"),
    name: "Serpent Tome",
    effectDescription: "Reclaim abilities cost you 1● less.",
    imageName: "book_6.png",
    imageAlt: "Green book with a coiled serpent embossed on the cover.",
  },
  {
    id: parseDreamsignId("12ec9625-cbfb-4056-9c3e-98ed8c8bea70"),
    name: "Charm Bracelet",
    effectDescription:
      "Once per turn, when you return a character you control to hand, your next character this turn costs 1● less.",
    imageName: "necklace.png",
    imageAlt:
      "Brown ringed bracelet with black beads and tan claw-like hanging charms.",
  },
] as const;

export function demoDreamsign(index: number) {
  return localizedDreamsignFixture(
    DEMO_DREAMSIGNS[(index - 1) % DEMO_DREAMSIGNS.length],
  );
}

export const demoDialogue = {
  portrait: { kind: "character-portrait", characterId: "mira" } as const,
  portraitAlt: assertLocalized("Mira"),
  speakerName: assertLocalized("Mira"),
  text: assertLocalized("Choose the path that keeps your intent clear."),
};

export const demoTransfigurationCandidate = {
  card: demoCard(1),
  forms: [
    {
      type: "Empowered" as const,
      presentation: localizedTransfigurationFormFixture("Empowered"),
      pricing: { kind: "unpriced" as const },
      previewModel: demoCard(2),
    },
    {
      type: "Kindled" as const,
      presentation: localizedTransfigurationFormFixture("Kindled"),
      pricing: {
        kind: "essence" as const,
        amount: 40,
        affordable: false,
      },
      previewModel: demoCard(3),
    },
    {
      type: "Resonant" as const,
      presentation: localizedTransfigurationFormFixture("Resonant"),
      pricing: {
        kind: "essence" as const,
        amount: 30,
        affordable: true,
      },
      previewModel: demoCard(4),
    },
  ],
};
