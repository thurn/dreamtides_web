import { describe, expect, it } from "vitest";
import { economyFixture } from "../../testing/economy-fixture";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../../__test-helpers__/atlas-fixtures";
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
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import {
  buildExplorationRuntime,
  buildLegacyExplorationRuntime,
  resolveExplorationChoice,
} from "./exploration-provider";
import { createSiteContentProvider } from "./site-provider";

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
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase: new Map(cards.map((entry) => [entry.cardNumber, entry])),
    exploration,
    dreamAvatars: Array.from({ length: 4 }, (_, index) => ({
      id: `dream-avatar-${String(index)}`,
      name: `Dream Avatar ${String(index)}`,
      title: "Synthetic",
      renderedText: "A synthetic Dream Avatar ability.",
      imageNumber: String(index),
      startingEssence: 250,
      signatureCards: [],
    })),
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
    atlasData: MINIMAL_ATLAS_DATA,
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
  };
}

function journeyFixture(content: JourneyContent): JourneyState {
  const event = content.cardDatabase.get(101);
  const spiritAnimal = content.cardDatabase.get(130);
  if (event === undefined || spiritAnimal === undefined) {
    throw new Error("Expected synthetic deck fixture cards");
  }
  return {
    ...createDefaultState(),
    seed: "exploration-provider-test",
    screen: { type: "site", siteId: site.id },
    activeSiteId: site.id,
    essence: 100,
    maxDreamsigns: 12,
    deck: Array.from({ length: 8 }, (_, index) =>
      index % 2 === 0 ? event : spiritAnimal,
    ).map((entry, index) => ({
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
): {
  journey: JourneyState;
  runtime: NonNullable<ReturnType<typeof buildExplorationRuntime>>;
} {
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
  const runtime = journey.siteRuntime[site.id];
  const result = resolveExplorationChoice({
    journey,
    site,
    payload: {
      actionId,
      selection,
      ...(runtime?.kind === "exploration" &&
      runtime.selectionRulesVersion !== undefined
        ? { selectionRulesVersion: runtime.selectionRulesVersion }
        : {}),
    },
    seq: 91,
    content,
  });
  if (result === null) throw new Error(`Expected ${actionId} to resolve`);
  return result;
}

describe("Exploration provider", () => {
  it("keeps the frozen unversioned offer algorithm available for legacy room replay", () => {
    const offeredAction: ExplorationActionContent = {
      id: "gain-offered",
      label: "Invite someone through",
      effectText: "Gain $OFFERED_CARD",
      effectKind: "gain-offered-card",
      predicate: "cheap-character",
    };
    const fallbackAction: ExplorationActionContent = {
      id: "gain-card",
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([offeredAction, fallbackAction]);
    const journey = journeyFixture(content);
    const legacy = buildLegacyExplorationRuntime(
      journey,
      site,
      content,
      () => 0.37,
    );
    const current = buildExplorationRuntime(journey, site, content, () => 0.37);

    expect(legacy).toMatchObject({
      kind: "exploration",
      encounterCardId: SOURCE_CARD_ID,
    });
    expect(legacy?.actionOffers[0]).toMatchObject({
      actionId: offeredAction.id,
      offeredCardIds: ["f0000000-0000-4000-8000-000000000033"],
    });
    expect(legacy).not.toHaveProperty("selectionRulesVersion");
    expect(legacy?.actionOffers[0]).not.toHaveProperty("canonicalMechanicId");
    expect(current?.selectionRulesVersion).toBe("1");
  });

  it("routes unversioned opens to legacy replay and current opens to shared selection", () => {
    const offeredAction: ExplorationActionContent = {
      id: "gain-offered",
      label: "Invite someone through",
      effectText: "Gain $OFFERED_CARD",
      effectKind: "gain-offered-card",
      predicate: "cheap-character",
    };
    const fallbackAction: ExplorationActionContent = {
      id: "gain-card",
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([offeredAction, fallbackAction]);
    const provider = createSiteContentProvider(content);
    const input = {
      journey: journeyFixture(content),
      site,
      rng: () => 0.37,
    };
    const legacy = provider.openSite(input);
    const current = provider.openSite({
      ...input,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });

    expect(legacy?.runtime).not.toHaveProperty("selectionRulesVersion");
    expect(current?.runtime).toMatchObject({
      kind: "exploration",
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });
    expect(
      provider.openSite({
        ...input,
        selectionRulesVersion: "unsupported-selection-version",
      }),
    ).toBeNull();
  });

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
    const gained = resolve(content, offeredState.journey, offeredAction.id, {
      cardIds: offered,
    });
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
    expect(
      transfigured.deck.find((entry) => entry.entryId === entryId)
        ?.transfiguration,
    ).toBe("Empowered");
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
      return (
        base !== undefined &&
        resolveDeckEntryCard(base, entry).subtype === "Spirit Animal"
      );
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
    expect(essenceRuntime.resolution?.essenceGained).toBe(
      spiritAnimalCount * 15,
    );
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
      (entry) =>
        content.cardDatabase.get(entry.cardNumber)?.cardType === "Character",
    )?.entryId;
    if (firstCharacterId === undefined) throw new Error("Expected a Character");
    const stackedJourney = {
      ...essenceState.journey,
      deck: essenceState.journey.deck.map((entry) =>
        entry.entryId === firstCharacterId
          ? { ...entry, sparkBonus: 2 }
          : entry,
      ),
    };
    const sparkState = buildState(content, stackedJourney);
    const withSpark = resolve(content, sparkState.journey, sparkAction.id);
    for (const entry of withSpark.deck) {
      const base = content.cardDatabase.get(entry.cardNumber);
      if (base?.cardType === "Character") {
        expect(entry.sparkBonus).toBe(
          entry.entryId === firstCharacterId ? 3 : 1,
        );
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
      packs
        .flat()
        .every((cardId) =>
          [...content.cardDatabase.values()].some(
            (entry) => entry.id === cardId && entry.subtype === "Warrior",
          ),
        ),
    ).toBe(true);
    const result = resolve(content, state.journey, packAction.id, {
      packIndex: 0,
    });
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

  it("resolves a fixed custom Dreamsign by UUID", () => {
    const customDreamsignId = "custom-exploration-dreamsign";
    const dreamsignAction: ExplorationActionContent = {
      id: "gain-custom-dreamsign",
      label: "Take the custom sign",
      effectText: "Gain a custom Dreamsign",
      effectKind: "gain-dreamsign",
      dreamsignId: customDreamsignId,
    };
    const fallbackAction: ExplorationActionContent = {
      id: "gain-card",
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const base = contentFixture([dreamsignAction, fallbackAction]);
    if (base.exploration === undefined) {
      throw new Error("Expected Exploration content");
    }
    const content: JourneyContent = {
      ...base,
      exploration: {
        ...base.exploration,
        customDreamsigns: [
          {
            id: customDreamsignId,
            name: "Custom Exploration Dreamsign",
            effectDescription: "A synthetic custom effect.",
          },
        ],
      },
    };
    const state = buildState(content);
    const result = resolve(content, state.journey, dreamsignAction.id);

    expect(result.dreamsigns).toContainEqual({
      id: customDreamsignId,
      name: "Custom Exploration Dreamsign",
      effectDescription: "A synthetic custom effect.",
    });
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

  it("purges an unrestricted selected card when the action has no predicate", () => {
    const purgeAction: ExplorationActionContent = {
      id: "purge-any-card",
      label: "Purge a chosen card",
      effectText: "Purge a chosen card",
      effectKind: "purge-selected",
      count: 1,
    };
    const fallbackAction: ExplorationActionContent = {
      id: "gain-source",
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([purgeAction, fallbackAction]);
    const state = buildState(content);
    const selectedEntry = state.journey.deck[0];
    if (selectedEntry === undefined) throw new Error("Expected a deck entry");
    const purgedCardId = content.cardDatabase.get(selectedEntry.cardNumber)?.id;
    if (purgedCardId === undefined) throw new Error("Expected a catalog card");

    const result = resolve(content, state.journey, purgeAction.id, {
      entryIds: [selectedEntry.entryId],
    });
    expect(result.deck).toHaveLength(state.journey.deck.length - 1);
    expect(
      result.deck.some((entry) => entry.entryId === selectedEntry.entryId),
    ).toBe(false);
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: { affectedEntryIds: [], purgedCardIds: [purgedCardId] },
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
    const content = contentFixture([
      randomDreamsignAction,
      purgeDreamsignAction,
    ]);
    const randomState = buildState(content, {
      ...journeyFixture(content),
      remainingDreamsignPool: [CHARM_POUCH_ID],
    });
    expect(randomState.runtime.actionOffers[0]?.offeredDreamsignIds).toEqual([
      CHARM_POUCH_ID,
    ]);
    const gained = resolve(
      content,
      randomState.journey,
      randomDreamsignAction.id,
    );
    expect(gained.dreamsigns.map((dreamsign) => dreamsign.id)).toContain(
      CHARM_POUCH_ID,
    );
    expect(gained.remainingDreamsignPool).not.toContain(CHARM_POUCH_ID);

    const alternateDreamsignId = "3D4EB3EE-0931-45ED-8365-69F18096EAD5";
    const purgeContent = {
      ...content,
      dreamsignTemplates: [
        ...content.dreamsignTemplates,
        {
          id: alternateDreamsignId,
          name: "Alternate Sign",
          effectDescription: "Another fixture effect.",
        },
      ],
    };
    const purgeState = buildState(purgeContent, {
      ...journeyFixture(content),
      dreamsigns: [
        {
          id: CHARM_POUCH_ID,
          name: "Charm Pouch",
          effectDescription: "A fixture effect.",
        },
      ],
      remainingDreamsignPool: [alternateDreamsignId],
    });
    const purged = resolve(
      purgeContent,
      purgeState.journey,
      purgeDreamsignAction.id,
      {
        dreamsignId: CHARM_POUCH_ID,
      },
    );
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
    expect(
      fast.deck.every((entry) => entry.keywordModification?.fast === true),
    ).toBe(true);

    const costState = buildState(content);
    const originalEntryIds = new Set(
      costState.journey.deck.map((entry) => entry.entryId),
    );
    const reduced = resolve(content, costState.journey, costAction.id);
    expect(reduced.deck).toHaveLength(costState.journey.deck.length + 3);
    for (const entry of reduced.deck) {
      const base = content.cardDatabase.get(entry.cardNumber);
      if (base === undefined) throw new Error("Expected a catalog card");
      if (originalEntryIds.has(entry.entryId)) {
        expect(entry.keywordModification?.energyCostReduction).toBe(1);
        expect(resolveDeckEntryCard(base, entry).energyCost).toBe(
          base.energyCost === null ? null : Math.max(0, base.energyCost - 1),
        );
      } else {
        expect(base.id).toBe(NIGHTMARE_ID);
        expect(entry.isBane).toBe(true);
        expect(entry.keywordModification?.energyCostReduction).toBeUndefined();
      }
    }
  });

  it("mints deck-entry offers and persists exact duplicated entry UUIDs", () => {
    const selectedCopy: ExplorationActionContent = {
      id: "copy-selected",
      label: "Copy a selected card",
      effectText: "Gain 2 copies of $DECK_CARD",
      effectKind: "copy-selected-card",
      selection: { $DECK_CARD: { predicate: "≤2● cost Character" } },
      predicate: "cheap-character",
      count: 2,
    };
    const offeredCopy: ExplorationActionContent = {
      id: "copy-offered",
      label: "Copy an offered card",
      effectText: "Choose one of four deck cards to copy",
      effectKind: "copy-offered-deck-card",
      offerCount: 4,
    };
    const content = contentFixture([selectedCopy, offeredCopy]);
    const selectedState = buildState(content);
    const selectedEntryId =
      selectedState.runtime.actionOffers[0]?.offeredDeckEntryIds?.[0];
    if (selectedEntryId === undefined)
      throw new Error("Expected a selected card");
    const copied = resolve(content, selectedState.journey, selectedCopy.id, {
      entryIds: [selectedEntryId],
    });
    const copiedRuntime = copied.siteRuntime[site.id];
    expect(copied.deck).toHaveLength(selectedState.journey.deck.length + 2);
    expect(copiedRuntime).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: [selectedEntryId] },
        affectedEntryIds: [selectedEntryId],
        gainedEntryIds: ["deck-91-0", "deck-91-1"],
      },
    });
    expect(
      resolveExplorationChoice({
        journey: selectedState.journey,
        site,
        payload: {
          actionId: selectedCopy.id,
          selection: { entryIds: ["foreign-entry"] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();

    const offeredState = buildState(content);
    const offeredEntryIds =
      offeredState.runtime.actionOffers[1]?.offeredDeckEntryIds ?? [];
    expect(offeredEntryIds).toHaveLength(4);
    const offeredEntryId = offeredEntryIds[0];
    if (offeredEntryId === undefined) throw new Error("Expected a deck offer");
    const offered = resolve(content, offeredState.journey, offeredCopy.id, {
      entryIds: [offeredEntryId],
    });
    expect(offered.deck).toHaveLength(offeredState.journey.deck.length + 1);
    expect(
      resolveExplorationChoice({
        journey: offeredState.journey,
        site,
        payload: {
          actionId: offeredCopy.id,
          selection: { entryIds: ["foreign-entry"] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("copies each of two UUID-selected deck entries atomically", () => {
    const copyTwo: ExplorationActionContent = {
      id: "copy-two-selected",
      label: "Separate the fragments",
      effectText: "Gain one copy of each of 2 chosen cards",
      effectKind: "copy-selected-cards",
      count: 2,
    };
    const fallback: ExplorationActionContent = {
      id: "fallback",
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([copyTwo, fallback]);
    const state = buildState(content);
    const selectedEntryIds = state.journey.deck
      .slice(1, 3)
      .map((entry) => entry.entryId);
    const result = resolve(content, state.journey, copyTwo.id, {
      entryIds: selectedEntryIds,
    });
    const replayed = resolve(content, state.journey, copyTwo.id, {
      entryIds: selectedEntryIds,
    });

    expect(result.deck).toHaveLength(state.journey.deck.length + 2);
    expect(replayed).toEqual(result);
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: selectedEntryIds },
        affectedEntryIds: selectedEntryIds,
        gainedEntryIds: ["deck-91-0", "deck-91-1"],
      },
    });
    expect(
      resolveExplorationChoice({
        journey: state.journey,
        site,
        payload: {
          actionId: copyTwo.id,
          selection: { entryIds: [selectedEntryIds[0], "foreign-entry"] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    expect(
      resolveExplorationChoice({
        journey: state.journey,
        site,
        payload: {
          actionId: copyTwo.id,
          selection: { entryIds: [selectedEntryIds[0], selectedEntryIds[0]] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("persists the exact modified card purged for its spark value", () => {
    const purgeForEssence: ExplorationActionContent = {
      id: "purge-for-essence",
      label: "Yield",
      effectText: "Purge a chosen card and gain 20 essence for each ✦ it had",
      effectKind: "purge-for-essence",
      essencePerSpark: 20,
    };
    const fallback: ExplorationActionContent = {
      id: "fallback",
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([purgeForEssence, fallback]);
    const journey = journeyFixture(content);
    const target = journey.deck[1];
    if (target === undefined)
      throw new Error("Expected a Character deck entry");
    const modifiedTarget = { ...target, sparkBonus: 3 };
    const state = buildState(content, {
      ...journey,
      deck: journey.deck.map((entry) =>
        entry.entryId === target.entryId ? modifiedTarget : entry,
      ),
    });
    const result = resolve(content, state.journey, purgeForEssence.id, {
      entryIds: [target.entryId],
    });

    expect(result.essence).toBe(state.journey.essence + 100);
    expect(result.deck.some((entry) => entry.entryId === target.entryId)).toBe(
      false,
    );
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: [target.entryId] },
        purgedEntryIds: [target.entryId],
        purgedEntrySnapshots: [modifiedTarget],
        essenceGained: 100,
      },
    });
  });

  it("persists the purge snapshot, copied source, and minted copy entry for purge-and-copy", () => {
    const purgeAndCopy: ExplorationActionContent = {
      id: "purge-and-copy",
      label: "Exchange",
      effectText: "Purge a chosen card and gain a copy of another chosen card",
      effectKind: "purge-and-copy",
    };
    const fallback: ExplorationActionContent = {
      id: "fallback",
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([purgeAndCopy, fallback]);
    const state = buildState(content);
    const purged = state.journey.deck[0];
    const copied = state.journey.deck[1];
    if (purged === undefined || copied === undefined) {
      throw new Error("Expected purge-and-copy deck entries");
    }
    const copiedCardId = content.cardDatabase.get(copied.cardNumber)?.id;
    if (copiedCardId === undefined)
      throw new Error("Expected copied card UUID");
    const copiesBefore = state.journey.deck.filter(
      (entry) => entry.cardNumber === copied.cardNumber,
    ).length;

    const result = resolve(content, state.journey, purgeAndCopy.id, {
      purgeEntryId: purged.entryId,
      copyEntryId: copied.entryId,
    });

    expect(result.deck.some((entry) => entry.entryId === purged.entryId)).toBe(
      false,
    );
    expect(
      result.deck.filter((entry) => entry.cardNumber === copied.cardNumber),
    ).toHaveLength(copiesBefore + 1);
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: {
          purgeEntryId: purged.entryId,
          copyEntryId: copied.entryId,
        },
        purgedEntryIds: [purged.entryId],
        purgedEntrySnapshots: [purged],
        gainedCardIds: [copiedCardId],
        gainedEntryIds: ["deck-91-0"],
        affectedEntryIds: [copied.entryId],
      },
    });
  });

  it("mints a non-matching subtype target for $DECK_CARD and rejects another eligible card", () => {
    const subtypeAction: ExplorationActionContent = {
      id: "become-survivor",
      label: "Fit a matching hood",
      effectText: "Change $DECK_CARD to become a Survivor",
      effectKind: "change-subtype-selected",
      selection: { $DECK_CARD: { predicate: "≤2● cost Character" } },
      predicate: "cheap-character",
      subtype: "Survivor",
    };
    const fallback: ExplorationActionContent = {
      id: "fallback",
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([subtypeAction, fallback]);
    const source = content.cardDatabase.get(1);
    const survivor = content.cardDatabase.get(110);
    const warrior = content.cardDatabase.get(120);
    if (
      source === undefined ||
      survivor === undefined ||
      warrior === undefined
    ) {
      throw new Error("Expected subtype fixtures");
    }
    const journey = {
      ...journeyFixture(content),
      deck: [
        {
          entryId: "source-entry",
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: "survivor-entry",
          cardNumber: survivor.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: "warrior-entry",
          cardNumber: warrior.cardNumber,
          transfiguration: null,
          isBane: false,
        },
      ],
    };
    const state = buildState(content, journey);

    expect(state.runtime.actionOffers[0]?.offeredDeckEntryIds).toEqual([
      "warrior-entry",
    ]);
    expect(
      resolveExplorationChoice({
        journey: state.journey,
        site,
        payload: {
          actionId: subtypeAction.id,
          selection: { entryIds: ["survivor-entry"] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();

    const changed = resolve(content, state.journey, subtypeAction.id, {
      entryIds: ["warrior-entry"],
    });
    const changedEntry = changed.deck.find(
      (entry) => entry.entryId === "warrior-entry",
    );
    if (changedEntry === undefined) throw new Error("Expected changed entry");
    expect(resolveDeckEntryCard(warrior, changedEntry).subtype).toBe(
      "Survivor",
    );
    expect(changed.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: ["warrior-entry"] },
        affectedEntryIds: ["warrior-entry"],
        chosenSubtype: "Survivor",
      },
    });
  });

  it("persists one-battle opening-hand and starting-energy modifiers", () => {
    const openingHand: ExplorationActionContent = {
      id: "opening-hand",
      label: "Draw more",
      effectText: "Draw 2 additional cards at the start of your next battle",
      effectKind: "next-battle-opening-hand",
      count: 2,
    };
    const startingEnergy: ExplorationActionContent = {
      id: "starting-energy",
      label: "Gather energy",
      effectText: "Gain 2 additional energy at the start of your next battle",
      effectKind: "next-battle-starting-energy",
      count: 2,
    };
    const content = contentFixture([openingHand, startingEnergy]);
    const handState = buildState(content);
    const withHand = resolve(content, handState.journey, openingHand.id);
    expect(
      withHand.battleModifiers[withHand.battleModifiers.length - 1],
    ).toEqual({
      kind: "opening_hand_bonus",
      count: 2,
      battlesRemaining: 1,
      source: `exploration:${site.id}:${openingHand.id}`,
    });
    expect(withHand.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        battleModifier: {
          kind: "opening-hand",
          amount: 2,
          battlesRemaining: 1,
        },
      },
    });

    const energyState = buildState(content);
    const withEnergy = resolve(content, energyState.journey, startingEnergy.id);
    expect(
      withEnergy.battleModifiers[withEnergy.battleModifiers.length - 1],
    ).toMatchObject({
      kind: "starting_energy_bonus",
      count: 2,
      battlesRemaining: 1,
    });
  });

  it("persists the compound smaller-hand and cost-discount modifier", () => {
    const compound: ExplorationActionContent = {
      id: "smaller-hand-discount",
      label: "Enter the blue radiance",
      effectText:
        "Draw one fewer card at the start of your next battle. All cards cost 1● less during that battle.",
      effectKind: "next-battle-smaller-hand-and-cost-discount",
    };
    const fallback: ExplorationActionContent = {
      id: "fallback",
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([compound, fallback]);
    const state = buildState(content);
    const result = resolve(content, state.journey, compound.id);

    expect(result.battleModifiers[result.battleModifiers.length - 1]).toEqual({
      kind: "smaller_hand_and_cost_discount",
      openingHandDelta: -1,
      energyCostReduction: 1,
      battlesRemaining: 1,
      source: `exploration:${site.id}:${compound.id}`,
    });
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        battleModifier: {
          kind: "smaller-hand-and-cost-discount",
          openingHandDelta: -1,
          energyCostReduction: 1,
          battlesRemaining: 1,
        },
      },
    });
  });

  it("offers a replacement Dream Avatar and atomically purges duplicated UUIDs before granting Reclaim", () => {
    const chooseAvatar: ExplorationActionContent = {
      id: "choose-avatar",
      label: "Choose an avatar",
      effectText: "Pick a new Dream Avatar from 3 choices",
      effectKind: "choose-dream-avatar",
      offerCount: 3,
    };
    const uniqueDeck: ExplorationActionContent = {
      id: "unique-deck",
      label: "Enter alone",
      effectText: "Purge duplicates and grant reclaim",
      effectKind: "purge-duplicates-and-grant-reclaim",
    };
    const baseContent = contentFixture([chooseAvatar, uniqueDeck]);
    const avatarTemplate = baseContent.dreamAvatars[0];
    if (avatarTemplate === undefined)
      throw new Error("Expected a Dream Avatar");
    const content: JourneyContent = {
      ...baseContent,
      dreamAvatars: Array.from({ length: 32 }, (_, index) => ({
        ...avatarTemplate,
        id: `dream-avatar-${String(index)}`,
        name: `Dream Avatar ${String(index)}`,
      })),
    };
    const initialAvatar = content.dreamAvatars[0];
    if (initialAvatar === undefined) throw new Error("Expected a Dream Avatar");
    const avatarState = buildState(content, {
      ...journeyFixture(content),
      dreamAvatar: {
        id: initialAvatar.id,
        name: initialAvatar.name,
        title: initialAvatar.title,
        renderedText: initialAvatar.renderedText,
        imageNumber: initialAvatar.imageNumber,
        startingEssence: initialAvatar.startingEssence,
      },
    });
    const offeredAvatarIds =
      avatarState.runtime.actionOffers[0]?.offeredDreamAvatarIds ?? [];
    expect(offeredAvatarIds).toHaveLength(3);
    expect(offeredAvatarIds).not.toContain(initialAvatar.id);
    const chosenAvatarId = offeredAvatarIds[0];
    if (chosenAvatarId === undefined)
      throw new Error("Expected an avatar offer");
    const avatarResult = resolve(
      content,
      avatarState.journey,
      chooseAvatar.id,
      {
        dreamAvatarId: chosenAvatarId,
      },
    );
    expect(avatarResult.dreamAvatar?.id).toBe(chosenAvatarId);
    expect(avatarResult.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        previousDreamAvatarId: initialAvatar.id,
        chosenDreamAvatarId: chosenAvatarId,
      },
    });

    const baseJourney = journeyFixture(content);
    const duplicateSource = baseJourney.deck[1];
    const duplicateTarget = baseJourney.deck[2];
    if (duplicateSource === undefined || duplicateTarget === undefined) {
      throw new Error("Expected duplicate fixtures");
    }
    const duplicateJourney = {
      ...baseJourney,
      deck: baseJourney.deck.map((entry) =>
        entry.entryId === duplicateTarget.entryId
          ? { ...entry, cardNumber: duplicateSource.cardNumber }
          : entry,
      ),
    };
    const uniqueState = buildState(content, duplicateJourney);
    const uniqueResult = resolve(content, uniqueState.journey, uniqueDeck.id);
    expect(
      uniqueResult.deck.some(
        (entry) => entry.cardNumber === duplicateSource.cardNumber,
      ),
    ).toBe(false);
    expect(
      uniqueResult.deck.every(
        (entry) => (entry.keywordModification?.setReclaim ?? 0) > 0,
      ),
    ).toBe(true);
    const runtime = uniqueResult.siteRuntime[site.id];
    expect(runtime?.kind).toBe("exploration");
    expect(
      runtime?.kind === "exploration"
        ? runtime.resolution?.purgedEntryIds
        : undefined,
    ).toEqual(
      expect.arrayContaining([
        duplicateSource.entryId,
        duplicateTarget.entryId,
      ]),
    );
  });

  it("persists every generated replacement trace in one action signature", () => {
    const replaceAction: ExplorationActionContent = {
      id: "generated-replacement",
      label: "Change course",
      effectText: "Replace a chosen character",
      effectKind: "replace-selected",
      predicate: "character",
    };
    const otherAction: ExplorationActionContent = {
      id: "gain-fixed",
      label: "Take the relic",
      effectText: "Gain a fixed card",
      effectKind: "gain-card",
      cardId: asCardId(SOURCE_CARD_ID),
    };
    const content = contentFixture([replaceAction, otherAction]);
    const { runtime } = buildState(content);
    const offer = runtime.actionOffers.find(
      (candidate) => candidate.actionId === replaceAction.id,
    );
    expect(offer?.selectionSignature).toMatch(/^[0-9a-f]{64}$/u);
    expect(offer?.selectionTraces?.length).toBeGreaterThan(0);
    expect(offer?.selectionTraces).toHaveLength(
      Object.keys(offer?.replacementCardIdByEntryId ?? {}).length,
    );
  });

  it("prepares transfigured drafts and disclosed add-site rewards", () => {
    const transfiguredDraft: ExplorationActionContent = {
      id: "transfigured-draft",
      label: "Follow the bright current",
      effectText: "Draft a transfigured Character from 4 choices.",
      effectKind: "transfigured-card-draft",
      predicate: "character",
      offerCount: 4,
    };
    const addSite: ExplorationActionContent = {
      id: "add-site",
      label: "Chart a new path",
      effectText: "Add a disclosed site to the current Dreamscape.",
      effectKind: "add-site",
    };
    const content = contentFixture([transfiguredDraft, addSite]);
    const state = buildState(content);
    const draftOffer = state.runtime.actionOffers[0];
    const siteOffer = state.runtime.actionOffers[1];
    expect(draftOffer?.offeredCardIds).toHaveLength(4);
    expect(Object.keys(draftOffer?.transfigurationByCardId ?? {})).toHaveLength(
      4,
    );
    expect(["Shop", "Purge", "Transfiguration", "Duplication"]).toContain(
      siteOffer?.offeredSiteType,
    );

    const selectedCardId = draftOffer?.offeredCardIds[0];
    if (selectedCardId === undefined)
      throw new Error("Expected a transfigured card offer");
    const resolved = resolve(content, state.journey, transfiguredDraft.id, {
      cardIds: [selectedCardId],
    });
    const resolution = resolved.siteRuntime[site.id];
    const gainedEntryId =
      resolution?.kind === "exploration"
        ? resolution.resolution?.gainedEntryIds?.[0]
        : undefined;
    const gainedEntry = resolved.deck.find(
      (entry) => entry.entryId === gainedEntryId,
    );
    expect(gainedEntry?.transfiguration).toBe(
      draftOffer?.transfigurationByCardId?.[selectedCardId],
    );
  });

  it("persists exact UUID selections for offered copies and any-number card takes", () => {
    const copiesAction: ExplorationActionContent = {
      id: "offered-copies",
      label: "Echo the wingbeats",
      effectText: "Gain 3 copies of $OFFERED_CARD",
      effectKind: "gain-offered-card",
      predicate: "spirit-animal",
      count: 3,
    };
    const takeAction: ExplorationActionContent = {
      id: "take-any",
      label: "Join the flight",
      effectText: "Take any number of Spirit Animal cards from 4 choices",
      effectKind: "take-cards",
      predicate: "spirit-animal",
      offerCount: 4,
    };
    const content = contentFixture([copiesAction, takeAction]);
    const copiesState = buildState(content);
    const offeredCardId =
      copiesState.runtime.actionOffers[0]?.offeredCardIds[0];
    if (offeredCardId === undefined)
      throw new Error("Expected an offered card");
    const copies = resolve(content, copiesState.journey, copiesAction.id, {
      cardIds: [offeredCardId],
    });
    expect(copies.deck).toHaveLength(copiesState.journey.deck.length + 3);
    expect(copies.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { cardIds: [offeredCardId] },
        gainedCardIds: [offeredCardId, offeredCardId, offeredCardId],
        gainedEntryIds: ["deck-91-0", "deck-91-1", "deck-91-2"],
      },
    });

    const takeState = buildState(content);
    const offered = takeState.runtime.actionOffers[1]?.offeredCardIds ?? [];
    expect(offered).toHaveLength(4);
    const selected = [offered[0], offered[2]].filter(
      (cardId): cardId is string => cardId !== undefined,
    );
    const taken = resolve(content, takeState.journey, takeAction.id, {
      cardIds: selected,
    });
    expect(taken.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { cardIds: selected },
        gainedCardIds: selected,
      },
    });
    const tookNone = resolve(
      content,
      buildState(content).journey,
      takeAction.id,
      { cardIds: [] },
    );
    expect(tookNone.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: { selection: { cardIds: [] }, gainedCardIds: [] },
    });
    expect(
      resolveExplorationChoice({
        journey: takeState.journey,
        site,
        payload: {
          actionId: takeAction.id,
          selection: { cardIds: ["foreign-card-id"] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("atomically replaces a selected entry with a fixed UUID and transfigures an unrestricted card", () => {
    const replacementCardId = "f0000000-0000-4000-8000-000000000001";
    const replaceAction: ExplorationActionContent = {
      id: "fixed-replacement",
      label: "Feed it, then gaze",
      effectText: "Choose a card to purge and replace it with a fixed card",
      effectKind: "replace-selected-with-card",
      cardId: asCardId(replacementCardId),
    };
    const transfigureAction: ExplorationActionContent = {
      id: "fixed-transfiguration",
      label: "Touch a luminous seam",
      effectText: "Apply Empowered to a chosen card",
      effectKind: "transfigure-fixed-selected",
      transfiguration: "Empowered",
    };
    const content = contentFixture([replaceAction, transfigureAction]);
    const replaceState = buildState(content);
    const target = replaceState.journey.deck[0];
    if (target === undefined) throw new Error("Expected a deck entry");
    const purgedId = content.cardDatabase.get(target.cardNumber)?.id;
    if (purgedId === undefined) throw new Error("Expected a catalog card");
    const replaced = resolve(content, replaceState.journey, replaceAction.id, {
      entryIds: [target.entryId],
    });
    expect(
      replaced.deck.some((entry) => entry.entryId === target.entryId),
    ).toBe(false);
    expect(replaced.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: [target.entryId] },
        purgedCardIds: [purgedId],
        purgedEntryIds: [target.entryId],
        gainedCardIds: [replacementCardId],
        gainedEntryIds: ["deck-91-0"],
      },
    });

    const transfigureState = buildState(content);
    const transfigureTarget = transfigureState.journey.deck[0];
    if (transfigureTarget === undefined)
      throw new Error("Expected a deck entry");
    const transfigured = resolve(
      content,
      transfigureState.journey,
      transfigureAction.id,
      { entryIds: [transfigureTarget.entryId] },
    );
    expect(
      transfigured.deck.find(
        (entry) => entry.entryId === transfigureTarget.entryId,
      )?.transfiguration,
    ).toBe("Empowered");
    expect(transfigured.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: [transfigureTarget.entryId] },
        affectedEntryIds: [transfigureTarget.entryId],
        chosenTransfiguration: "Empowered",
      },
    });
  });

  it("persists a one-use transfigured Draft-or-Shop modifier", () => {
    const futureAction: ExplorationActionContent = {
      id: "transfigure-next-site",
      label: "Follow its lowered gaze",
      effectText: "The next draft or shop site will contain transfigured cards",
      effectKind: "transfigure-next-draft-or-shop",
    };
    const fallbackAction: ExplorationActionContent = {
      id: "fallback",
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([futureAction, fallbackAction]);
    const state = buildState(content);
    const result = resolve(content, state.journey, futureAction.id);
    const modifier = {
      kind: "transfigure-next-draft-or-shop",
      sourceSiteId: site.id,
      sourceActionId: futureAction.id,
    } as const;
    expect(result.siteOfferModifiers).toEqual([modifier]);
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: { siteOfferModifier: modifier },
    });
  });
});
