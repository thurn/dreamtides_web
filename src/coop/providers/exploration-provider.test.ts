import { describe, expect, it } from "vitest";
import explorationData from "../../../public/exploration-data.json";
import type { ExplorationContent } from "../../data/exploration";
import {
  hashStringToSeed,
  type JourneyContent,
} from "../../data/journey-content";
import { createDefaultState } from "../../state/journey-context";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type {
  ExplorationSiteRuntime,
  JourneyState,
  SiteState,
} from "../../types/journey";
import {
  buildExplorationRuntime,
  resolveExplorationChoice,
} from "./exploration-provider";

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
    spark: 2,
    isFast: false,
    renderedText: "Synthetic rules text.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function contentFixture(): JourneyContent {
  const authored = explorationData as unknown as {
    customCards: CardData[];
    customDreamsigns: ExplorationContent["customDreamsigns"];
    encounters: Array<{
      cardId: string;
      prose: string;
      action: ExplorationContent["encounters"][number]["actions"];
    }>;
  };
  const sourceCards = authored.encounters.map((encounter, index) =>
    card(encounter.cardId, index + 1, "Character", "Fixture", 3),
  );
  const candidates = [
    card("f0000000-0000-4000-8000-000000000001", 101, "Event", "", 1),
    card("f0000000-0000-4000-8000-000000000002", 102, "Character", "Survivor"),
    card("f0000000-0000-4000-8000-000000000003", 103, "Character", "Survivor"),
    card("f0000000-0000-4000-8000-000000000004", 104, "Character", "Warrior"),
    ...Array.from({ length: 8 }, (_, index) =>
      card(
        `f0000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
        110 + index,
        "Character",
        "Spirit Animal",
      ),
    ),
  ];
  const customCards = authored.customCards.map((entry) => ({
    ...entry,
    id: asCardId(entry.id),
    name: asCardName(entry.name),
  }));
  const cards = [...sourceCards, ...candidates, ...customCards];
  return {
    cardDatabase: new Map(cards.map((entry) => [entry.cardNumber, entry])),
    exploration: {
      customCards,
      customDreamsigns: authored.customDreamsigns,
      encounters: authored.encounters.map((encounter) => ({
        cardId: asCardId(encounter.cardId),
        prose: encounter.prose,
        actions: encounter.action,
      })),
    },
    dreamAvatars: [],
    dreamwellCards: [],
    dreamsignTemplates: [
      {
        id: "3A22A33F-5682-4D00-B0EC-86E43B6ED9DF",
        name: "Magic Fish",
        effectDescription: "A fixture effect.",
      },
      {
        id: "D1FDBE21-56F6-43C0-AAAC-1E4683964DA5",
        name: "Bell",
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
  const deckCards = [...content.cardDatabase.values()].filter(
    (entry) => entry.cardNumber >= 101 && entry.cardNumber <= 117,
  );
  return {
    ...createDefaultState(),
    screen: { type: "site", siteId: "exploration-site" },
    activeSiteId: "exploration-site",
    essence: 100,
    maxDreamsigns: 12,
    deck: deckCards.map((entry, index) => ({
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

function selectionFor(runtime: ExplorationSiteRuntime, actionId: string) {
  const offer = runtime.actionOffers.find((candidate) => candidate.actionId === actionId);
  if (offer === undefined) throw new Error(`Missing offer for ${actionId}`);
  if (actionId.endsWith(":exchange-familiar-forms")) {
    return { purgeEntryId: "entry-0", copyEntryId: "entry-1" };
  }
  if (actionId.endsWith(":study-guardian")) {
    return { entryIds: Object.keys(offer.transfigurationByEntryId).slice(0, 2) };
  }
  if (actionId.endsWith(":feed-fire")) return { entryIds: ["entry-0"] };
  if (actionId.endsWith(":welcome-kin")) return { packIndex: 0 };
  if (actionId.endsWith(":invite-lantern-visitor") || actionId.endsWith(":ask-counsel")) {
    return { cardIds: offer.offeredCardIds.slice(0, 1) };
  }
  if (actionId.endsWith(":trade-away-figure")) return { entryIds: ["entry-1"] };
  if (actionId.endsWith(":enter-frame")) return { entryIds: ["entry-1"] };
  if (actionId.endsWith(":expand-frame")) return { subtype: "Warrior" };
  if (actionId.endsWith(":welcome-owl-kin")) return { cardIds: offer.offeredCardIds.slice(0, 2) };
  if (actionId.endsWith(":release-swimmer")) {
    return { entryIds: [Object.keys(offer.replacementCardIdByEntryId)[0]] };
  }
  if (actionId.endsWith(":gather-light")) return { entryIds: ["entry-1"] };
  return {};
}

function seedForEncounter(index: number, count: number): string {
  for (let candidate = 0; candidate < 10_000; candidate += 1) {
    const seed = `exploration-test-${String(candidate)}`;
    if (
      hashStringToSeed(`${seed}:${site.id}:exploration-card`) % count ===
      index
    ) {
      return seed;
    }
  }
  throw new Error(`Unable to find Exploration seed for index ${String(index)}`);
}

describe("Exploration provider", () => {
  it("builds deterministic offers and resolves all 18 authored effects", () => {
    const content = contentFixture();
    const authored = content.exploration;
    if (authored === undefined) throw new Error("Missing authored content");
    const resolvedIds = new Set<string>();

    authored.encounters.forEach((encounter, encounterIndex) => {
      for (const action of encounter.actions) {
        const journey = {
          ...journeyFixture(content),
          seed: seedForEncounter(encounterIndex, authored.encounters.length),
        };
        const runtime = buildExplorationRuntime(journey, site, content, () => 0.37);
        expect(runtime?.encounterCardId).toBe(encounter.cardId);
        if (runtime === null) throw new Error("Expected Exploration runtime");
        const state = {
          ...journey,
          siteRuntime: { ...journey.siteRuntime, [site.id]: runtime },
        };
        const result = resolveExplorationChoice({
          journey: state,
          site,
          payload: {
            actionId: action.id,
            selection: selectionFor(runtime, action.id),
          },
          seq: 91 + resolvedIds.size,
          content,
        });
        expect(result, action.id).not.toBeNull();
        expect(result?.siteRuntime[site.id]).toMatchObject({
          kind: "exploration",
          resolution: { actionId: action.id },
        });
        resolvedIds.add(action.id);
      }
    });

    expect(resolvedIds.size).toBe(18);
  });

  it("replaces a UUID-selected Dreamsign at the collection cap", () => {
    const content = contentFixture();
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
    const runtime = buildExplorationRuntime(
      { ...journey, seed: seedForEncounter(0, 9) },
      site,
      content,
      () => 0,
    );
    if (runtime === null) throw new Error("Expected Exploration runtime");
    const actionId = runtime.actionOffers[1]?.actionId;
    if (actionId === undefined) throw new Error("Expected Dreamsign action");
    const result = resolveExplorationChoice({
      journey: {
        ...journey,
        siteRuntime: { ...journey.siteRuntime, [site.id]: runtime },
      },
      site,
      payload: {
        actionId,
        selection: { replacedDreamsignId: "held-dreamsign" },
      },
      seq: 140,
      content,
    });

    expect(result?.dreamsigns).toHaveLength(1);
    expect(result?.dreamsigns[0]?.id).toBe(
      "F46E59CB-32EC-4B50-8774-18F571B8FCE1",
    );
  });

  it("uses the displayed essence-per-spark default when authored data omits it", () => {
    const baseContent = contentFixture();
    const authored = baseContent.exploration;
    if (authored === undefined) throw new Error("Missing authored content");
    const encounter = authored.encounters[3];
    if (encounter === undefined) throw new Error("Missing essence encounter");
    const content: JourneyContent = {
      ...baseContent,
      exploration: {
        ...authored,
        encounters: authored.encounters.map((candidate, index) =>
          index === 3
            ? {
                ...candidate,
                actions: candidate.actions.map((action) =>
                  action.effectKind === "purge-for-essence"
                    ? { ...action, essencePerSpark: undefined }
                    : action,
                ) as unknown as typeof candidate.actions,
              }
            : candidate,
        ),
      },
    };
    const journey = {
      ...journeyFixture(content),
      seed: seedForEncounter(3, authored.encounters.length),
    };
    const runtime = buildExplorationRuntime(journey, site, content, () => 0);
    if (runtime === null) throw new Error("Expected Exploration runtime");
    const action = encounter.actions.find(
      (candidate) => candidate.effectKind === "purge-for-essence",
    );
    if (action === undefined) throw new Error("Missing essence action");

    const result = resolveExplorationChoice({
      journey: {
        ...journey,
        siteRuntime: { ...journey.siteRuntime, [site.id]: runtime },
      },
      site,
      payload: { actionId: action.id, selection: { entryIds: ["entry-1"] } },
      seq: 141,
      content,
    });

    expect(result?.essence).toBe(journey.essence + 80);
    expect(result?.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: { essenceGained: 80 },
    });
  });
});
