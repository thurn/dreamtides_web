import { describe, expect, it } from "vitest";
import { resolveDeckEntryCard } from "../../card-type-change";
import type {
  ExplorationActionContent,
  ExplorationContent,
} from "../../data/exploration";
import type { JourneyContent } from "../../data/journey-content";
import { createDefaultState } from "../../state/journey-context";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { JourneyState, SiteState } from "../../types/journey";
import {
  buildExplorationRuntime,
  resolveExplorationChoice,
} from "./exploration-provider";

const SOURCE_CARD_ID = asCardId("161482b6-af07-4d9e-822d-8c738672beb9");
const CHARM_POUCH_ID = "2D4EB3EE-0931-45ED-8365-69F18096EAD5";

function card(
  id: string,
  cardNumber: number,
  cardType: CardData["cardType"],
  subtype: string,
  energyCost = 2,
): CardData {
  return {
    id: asCardId(id),
    name: asCardName(`Exploration fixture ${String(cardNumber)}`),
    cardNumber,
    cardType,
    subtype,
    isStarter: false,
    energyCost,
    spark: cardType === "Character" ? 2 : null,
    isFast: false,
    renderedText: "Synthetic rules text.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function catalogCards(): CardData[] {
  return [
    card(SOURCE_CARD_ID, 1, "Character", "Warrior", 1),
    card("f0000000-0000-4000-8000-000000000001", 101, "Event", "", 1),
    ...Array.from({ length: 4 }, (_, index) =>
      card(
        `f0000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
        110 + index,
        "Character",
        "Survivor",
      ),
    ),
    ...Array.from({ length: 6 }, (_, index) =>
      card(
        `f0000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
        120 + index,
        "Character",
        "Warrior",
      ),
    ),
    ...Array.from({ length: 8 }, (_, index) =>
      card(
        `f0000000-0000-4000-8000-${String(index + 30).padStart(12, "0")}`,
        130 + index,
        "Character",
        "Spirit Animal",
      ),
    ),
  ];
}

function contentFixture(
  actions: readonly [ExplorationActionContent, ExplorationActionContent],
): JourneyContent {
  const cards = catalogCards();
  const exploration: ExplorationContent = {
    customCards: [],
    customDreamsigns: [],
    encounters: [
      {
        cardId: SOURCE_CARD_ID,
        prose: "A synthetic scene.",
        actions,
      },
    ],
  };
  return {
    cardDatabase: new Map(cards.map((entry) => [entry.cardNumber, entry])),
    exploration,
    dreamAvatars: [],
    dreamwellCards: [],
    dreamsignTemplates: [
      {
        id: CHARM_POUCH_ID,
        name: "Charm Pouch",
        effectDescription: "A fixture effect.",
      },
    ],
    dreamscapes: [],
    affiliations: [],
    guides: [],
    atlasConfig: {},
  } as unknown as JourneyContent;
}

function journeyFixture(content: JourneyContent): JourneyState {
  return {
    ...createDefaultState(),
    seed: "exploration-provider-test",
    screen: { type: "site", siteId: site.id },
    activeSiteId: site.id,
    essence: 100,
    maxDreamsigns: 12,
    deck: [...content.cardDatabase.values()]
      .filter((entry) => entry.cardNumber >= 101)
      .map((entry, index) => ({
        entryId: `entry-${String(index)}`,
        cardNumber: entry.cardNumber,
        transfiguration: null,
        isBane: false,
      })),
  };
}

const site: SiteState = {
  id: "exploration-site",
  type: "Exploration",
  isEnhanced: false,
  isVisited: false,
};

function buildState(
  content: JourneyContent,
  journey = journeyFixture(content),
): { journey: JourneyState; runtime: NonNullable<ReturnType<typeof buildExplorationRuntime>> } {
  const runtime = buildExplorationRuntime(journey, site, content, () => 0.37);
  if (runtime === null) throw new Error("Expected Exploration runtime");
  return {
    runtime,
    journey: {
      ...journey,
      siteRuntime: { ...journey.siteRuntime, [site.id]: runtime },
    },
  };
}

function resolve(
  content: JourneyContent,
  journey: JourneyState,
  actionId: string,
  selection: Record<string, unknown> = {},
): JourneyState {
  const result = resolveExplorationChoice({
    journey,
    site,
    payload: { actionId, selection },
    seq: 91,
    content,
  });
  if (result === null) throw new Error(`Expected ${actionId} to resolve`);
  return result;
}

describe("Exploration provider", () => {
  it("builds and resolves the offered-card and unrestricted transfiguration effects", () => {
    const offeredAction: ExplorationActionContent = {
      id: "gain-offered",
      label: "Invite someone through",
      effectText: "Gain $OFFERED_CARD",
      responseText: "Someone arrives.",
      effectKind: "gain-offered-card",
      predicate: "cheap-character",
    };
    const transfigureAction: ExplorationActionContent = {
      id: "transfigure",
      label: "Send a possession through",
      effectText: "Apply a transfiguration to a chosen card",
      responseText: "It returns altered.",
      effectKind: "transfigure-selected",
      count: 1,
    };
    const content = contentFixture([offeredAction, transfigureAction]);
    const offeredState = buildState(content);
    const offered = offeredState.runtime.actionOffers[0]?.offeredCardIds ?? [];

    expect(offered).toHaveLength(1);
    expect(offered).not.toContain(SOURCE_CARD_ID);
    const gained = resolve(
      content,
      offeredState.journey,
      offeredAction.id,
      { cardIds: offered },
    );
    expect(gained.deck).toHaveLength(offeredState.journey.deck.length + 1);
    expect(gained.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: { gainedCardIds: offered },
    });

    const transfigureState = buildState(content);
    const transfigurations =
      transfigureState.runtime.actionOffers[1]?.transfigurationByEntryId ?? {};
    const entryId = Object.keys(transfigurations)[0];
    if (entryId === undefined) throw new Error("Expected a transfiguration offer");
    const transfigured = resolve(
      content,
      transfigureState.journey,
      transfigureAction.id,
      { entryIds: [entryId] },
    );
    expect(transfigured.deck.find((entry) => entry.entryId === entryId)?.transfiguration)
      .toBe(transfigurations[entryId]);
  });

  it("derives essence from matching deck entries and stacks spark on every Character", () => {
    const essenceAction: ExplorationActionContent = {
      id: "essence-per-card",
      label: "Sound a gathering call",
      effectText: "Gain 15 essence for each Spirit Animal card in your deck",
      responseText: "A call answers.",
      effectKind: "gain-essence-per-card",
      predicate: "spirit-animal",
      essencePerCard: 15,
    };
    const sparkAction: ExplorationActionContent = {
      id: "increase-spark",
      label: "Receive Their Blessing",
      effectText: "All characters in your deck gain +1✦",
      responseText: "Starlight passes over the company.",
      effectKind: "increase-spark-all",
      sparkBonus: 1,
    };
    const content = contentFixture([essenceAction, sparkAction]);
    const essenceState = buildState(content);
    const spiritAnimalCount = essenceState.journey.deck.filter((entry) => {
      const base = content.cardDatabase.get(entry.cardNumber);
      return base !== undefined && resolveDeckEntryCard(base, entry).subtype === "Spirit Animal";
    }).length;
    const withEssence = resolve(
      content,
      essenceState.journey,
      essenceAction.id,
    );
    expect(withEssence.essence).toBe(100 + spiritAnimalCount * 15);
    const essenceRuntime = withEssence.siteRuntime[site.id];
    expect(essenceRuntime?.kind).toBe("exploration");
    if (essenceRuntime?.kind !== "exploration") {
      throw new Error("Expected Exploration resolution");
    }
    expect(essenceRuntime.resolution?.essenceGained)
      .toBe(spiritAnimalCount * 15);
    expect(essenceRuntime.resolution?.affectedEntryIds).toEqual(
      expect.arrayContaining(
        essenceState.journey.deck
          .filter(
            (entry) =>
              content.cardDatabase.get(entry.cardNumber)?.subtype ===
              "Spirit Animal",
          )
          .map((entry) => entry.entryId),
      ),
    );

    const firstCharacterId = essenceState.journey.deck.find(
      (entry) => content.cardDatabase.get(entry.cardNumber)?.cardType === "Character",
    )?.entryId;
    if (firstCharacterId === undefined) throw new Error("Expected a Character");
    const stackedJourney = {
      ...essenceState.journey,
      deck: essenceState.journey.deck.map((entry) =>
        entry.entryId === firstCharacterId ? { ...entry, sparkBonus: 2 } : entry,
      ),
    };
    const sparkState = buildState(content, stackedJourney);
    const withSpark = resolve(content, sparkState.journey, sparkAction.id);
    for (const entry of withSpark.deck) {
      const base = content.cardDatabase.get(entry.cardNumber);
      if (base?.cardType === "Character") {
        expect(entry.sparkBonus).toBe(entry.entryId === firstCharacterId ? 3 : 1);
      } else {
        expect(entry.sparkBonus).toBeUndefined();
      }
    }
  });

  it("builds two distinct Warrior packs and resolves the selected pack", () => {
    const packAction: ExplorationActionContent = {
      id: "warrior-packs",
      label: "Answer Their Muster",
      effectText: "Choose one of 2 packs of Warrior cards to add to your deck",
      responseText: "Warriors gather.",
      effectKind: "choose-pack",
      predicate: "warrior",
      packCount: 2,
      packSize: 3,
    };
    const randomAction: ExplorationActionContent = {
      id: "random-survivors",
      label: "Open the Passage",
      effectText: "Gain 2 random Survivor cards",
      responseText: "Travelers approach.",
      effectKind: "gain-random-cards",
      predicate: "survivor",
      count: 2,
    };
    const content = contentFixture([packAction, randomAction]);
    const state = buildState(content);
    const packs = state.runtime.actionOffers[0]?.packCardIds ?? [];

    expect(packs).toHaveLength(2);
    expect(packs.every((pack) => pack.length === 3)).toBe(true);
    expect(new Set(packs.flat()).size).toBe(6);
    expect(
      packs.flat().every((cardId) =>
        [...content.cardDatabase.values()].some(
          (entry) => entry.id === cardId && entry.subtype === "Warrior",
        ),
      ),
    ).toBe(true);
    const result = resolve(content, state.journey, packAction.id, { packIndex: 0 });
    expect(result.deck).toHaveLength(state.journey.deck.length + 3);
  });

  it("replaces a UUID-selected Dreamsign at the collection cap", () => {
    const dreamsignAction: ExplorationActionContent = {
      id: "gain-dreamsign",
      label: "Reach toward the tusks",
      effectText: "Gain Charm Pouch",
      responseText: "A charm gleams.",
      effectKind: "gain-dreamsign",
      dreamsignId: CHARM_POUCH_ID,
    };
    const gainCardAction: ExplorationActionContent = {
      id: "gain-card",
      label: "Gain a card",
      effectText: "Gain a card",
      responseText: "A card arrives.",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([dreamsignAction, gainCardAction]);
    const journey = {
      ...journeyFixture(content),
      maxDreamsigns: 1,
      dreamsigns: [
        {
          id: "held-dreamsign",
          name: "Held Dreamsign",
          effectDescription: "A held fixture.",
          isBane: false,
        },
      ],
    };
    const state = buildState(content, journey);
    const result = resolve(content, state.journey, dreamsignAction.id, {
      replacedDreamsignId: "held-dreamsign",
    });

    expect(result.dreamsigns).toHaveLength(1);
    expect(result.dreamsigns[0]?.id).toBe(CHARM_POUCH_ID);
  });
});
