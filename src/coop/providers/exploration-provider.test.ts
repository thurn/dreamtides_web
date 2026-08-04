import { describe, expect, it } from "vitest";
import { resolveDeckEntryCard } from "../../card-type-change";
import type {
  ExplorationActionContent,
  ExplorationContent,
} from "../../data/exploration";
import type { JourneyContent } from "../../data/journey-content";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
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
const NIGHTMARE_ID = NIGHTMARE_CARD_ID;

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
    card(NIGHTMARE_ID, 2, "Event", "", 0),
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
      effectKind: "gain-offered-card",
      predicate: "cheap-character",
    };
    const transfigureAction: ExplorationActionContent = {
      id: "transfigure",
      label: "Send a possession through",
      effectText: "Apply a transfiguration to a chosen card",
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
    const entryId = transfigureState.journey.deck[0]?.entryId;
    if (entryId === undefined) throw new Error("Expected a deck entry");
    expect(
      transfigureState.runtime.actionOffers[1]?.transfigurationByEntryId,
    ).toEqual({});
    const transfigured = resolve(
      content,
      transfigureState.journey,
      transfigureAction.id,
      { entryIds: [entryId], transfiguration: "Empowered" },
    );
    expect(transfigured.deck.find((entry) => entry.entryId === entryId)?.transfiguration)
      .toBe("Empowered");
    expect(transfigured.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        affectedEntryIds: [entryId],
        chosenTransfiguration: "Empowered",
      },
    });

    expect(
      resolveExplorationChoice({
        journey: transfigureState.journey,
        site,
        payload: {
          actionId: transfigureAction.id,
          selection: { entryIds: [entryId], transfiguration: "Perfected" },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("derives essence from matching deck entries and stacks spark on every Character", () => {
    const essenceAction: ExplorationActionContent = {
      id: "essence-per-card",
      label: "Sound a gathering call",
      effectText: "Gain 15 essence for each Spirit Animal card in your deck",
      effectKind: "gain-essence-per-card",
      predicate: "spirit-animal",
      essencePerCard: 15,
    };
    const sparkAction: ExplorationActionContent = {
      id: "increase-spark",
      label: "Receive Their Blessing",
      effectText: "All characters in your deck gain +1✦",
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
      effectKind: "choose-pack",
      predicate: "warrior",
      packCount: 2,
      packSize: 3,
    };
    const randomAction: ExplorationActionContent = {
      id: "random-survivors",
      label: "Open the Passage",
      effectText: "Gain 2 random Survivor cards",
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
      effectKind: "gain-dreamsign",
      dreamsignId: CHARM_POUCH_ID,
    };
    const gainCardAction: ExplorationActionContent = {
      id: "gain-card",
      label: "Gain a card",
      effectText: "Gain a card",
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
          isNegative: false,
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

  it("drafts one offered card and gains the authored number of copies", () => {
    const draftAction: ExplorationActionContent = {
      id: "draft-two-copies",
      label: "Call for Reinforcements",
      effectText: "Draft a Survivor from 4 choices and gain 2 copies of it",
      effectKind: "draft-card",
      predicate: "survivor",
      offerCount: 4,
      count: 2,
    };
    const fallbackAction: ExplorationActionContent = {
      id: "gain-source",
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([draftAction, fallbackAction]);
    const state = buildState(content);
    const selectedId = state.runtime.actionOffers[0]?.offeredCardIds[0];
    if (selectedId === undefined) throw new Error("Expected a draft offer");

    const result = resolve(content, state.journey, draftAction.id, {
      cardIds: [selectedId],
    });
    const gained = result.siteRuntime[site.id];
    expect(result.deck).toHaveLength(state.journey.deck.length + 2);
    expect(gained).toMatchObject({
      kind: "exploration",
      resolution: { gainedCardIds: [selectedId, selectedId] },
    });
  });

  it("mints a random Dreamsign offer and purges a UUID-selected Dreamsign for essence", () => {
    const randomDreamsignAction: ExplorationActionContent = {
      id: "random-dreamsign",
      label: "Read the suspended pattern",
      effectText: "Gain a random dreamsign",
      effectKind: "gain-random-dreamsign",
    };
    const purgeDreamsignAction: ExplorationActionContent = {
      id: "purge-dreamsign",
      label: "Break the suspended pattern",
      effectText: "Purge a chosen dreamsign and gain 50 essence",
      effectKind: "purge-dreamsign-for-essence",
      essence: 50,
    };
    const content = contentFixture([randomDreamsignAction, purgeDreamsignAction]);
    const randomState = buildState(content, {
      ...journeyFixture(content),
      remainingDreamsignPool: [CHARM_POUCH_ID],
    });
    expect(randomState.runtime.actionOffers[0]?.offeredDreamsignIds)
      .toEqual([CHARM_POUCH_ID]);
    const gained = resolve(content, randomState.journey, randomDreamsignAction.id);
    expect(gained.dreamsigns.map((dreamsign) => dreamsign.id))
      .toContain(CHARM_POUCH_ID);
    expect(gained.remainingDreamsignPool).not.toContain(CHARM_POUCH_ID);

    const purgeState = buildState(content, {
      ...journeyFixture(content),
      dreamsigns: [{
        id: CHARM_POUCH_ID,
        name: "Charm Pouch",
        effectDescription: "A fixture effect.",
        isNegative: false,
      }],
    });
    const purged = resolve(content, purgeState.journey, purgeDreamsignAction.id, {
      dreamsignId: CHARM_POUCH_ID,
    });
    expect(purged.dreamsigns).toEqual([]);
    expect(purged.essence).toBe(150);
    expect(purged.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        purgedDreamsignIds: [CHARM_POUCH_ID],
        essenceGained: 50,
      },
    });
  });

  it("makes the deck fast and applies cost reduction before adding Nightmare cards", () => {
    const fastAction: ExplorationActionContent = {
      id: "make-fast",
      label: "Accept the charge",
      effectText: "All cards in your deck become fast",
      effectKind: "make-fast-all",
    };
    const costAction: ExplorationActionContent = {
      id: "reduce-and-nightmares",
      label: "Overload the aperture",
      effectText: "Reduce all costs and gain three Nightmare cards",
      effectKind: "reduce-cost-all-and-gain-nightmares",
      energyCostReduction: 1,
      nightmareCount: 3,
    };
    const content = contentFixture([fastAction, costAction]);
    const fastState = buildState(content);
    const fast = resolve(content, fastState.journey, fastAction.id);
    expect(fast.deck.every((entry) => entry.keywordModification?.fast === true))
      .toBe(true);

    const costState = buildState(content);
    const originalEntryIds = new Set(costState.journey.deck.map((entry) => entry.entryId));
    const reduced = resolve(content, costState.journey, costAction.id);
    expect(reduced.deck).toHaveLength(costState.journey.deck.length + 3);
    for (const entry of reduced.deck) {
      const base = content.cardDatabase.get(entry.cardNumber);
      if (base === undefined) throw new Error("Expected a catalog card");
      if (originalEntryIds.has(entry.entryId)) {
        expect(entry.keywordModification?.energyCostReduction).toBe(1);
        expect(resolveDeckEntryCard(base, entry).energyCost)
          .toBe(base.energyCost === null ? null : Math.max(0, base.energyCost - 1));
      } else {
        expect(base.id).toBe(NIGHTMARE_ID);
        expect(entry.isBane).toBe(true);
        expect(entry.keywordModification?.energyCostReduction).toBeUndefined();
      }
    }
  });
});
