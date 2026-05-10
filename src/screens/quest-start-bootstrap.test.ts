import { beforeEach, describe, expect, it, vi } from "vitest";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import { getLogEntries, resetLog } from "../logging";
import { bootstrapQuestStart } from "./quest-start-bootstrap";
import type { QuestContent } from "../data/quest-content";
import type {
  DreamcallerContent,
  DreamsignTemplate,
  ResolvedDreamcallerPackage,
} from "../types/content";
import type { CardData } from "../types/cards";
import type { QuestMutations } from "../state/quest-context";
import type { QuestState } from "../types/quest";

function makeDreamcaller(): DreamcallerContent {
  return {
    id: "dreamcaller-1",
    name: "Test Dreamcaller",
    title: "Caller of Beginnings",
    renderedText: "Test ability.",
    imageNumber: "0002",
    startingEssence: 250,
    mandatoryTides: ["tide_alpha"],
    optionalTides: ["tide_beta", "tide_gamma", "tide_delta", "tide_zeta"],
  };
}

function makeResolvedPackage(): ResolvedDreamcallerPackage {
  const dreamcaller = makeDreamcaller();
  return {
    dreamcaller,
    mandatoryTides: ["tide_alpha"],
    optionalSubset: ["tide_beta", "tide_gamma", "tide_delta"],
    selectedTides: ["tide_alpha", "tide_beta", "tide_gamma", "tide_delta"],
    draftPoolCopiesByCard: {
      "101": 2,
      "202": 1,
    },
    dreamsignPoolIds: ["dreamsign-1", "dreamsign-2"],
    mandatoryOnlyPoolSize: 12,
    draftPoolSize: 24,
    doubledCardCount: 1,
    legalSubsetCount: 4,
    preferredSubsetCount: 2,
  };
}

function makeDreamsignTemplates(): DreamsignTemplate[] {
  return [
    {
      id: "dreamsign-1",
      name: "Echo Sign",
      effectDescription: "Gain a bloom effect.",
      packageTides: ["tide_alpha"],
    },
    {
      id: "dreamsign-2",
      name: "Arc Echo",
      effectDescription: "Gain an arc effect.",
      packageTides: ["tide_beta"],
    },
  ];
}

function makeCard(cardNumber: number, tides: CardData["tides"]): CardData {
  return {
    name: `Card ${String(cardNumber)}`,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    tides,
    renderedText: "Test card.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeQuestContent(
  resolvedPackage: ResolvedDreamcallerPackage,
): Pick<QuestContent, "dreamsignTemplates" | "resolvedPackagesByDreamcallerId"> {
  return {
    dreamsignTemplates: makeDreamsignTemplates(),
    resolvedPackagesByDreamcallerId: new Map([[resolvedPackage.dreamcaller.id, resolvedPackage]]),
  };
}

function makeState(): Pick<
  QuestState,
  "completionLevel" | "deck" | "dreamsigns" | "essence"
> {
  return {
    completionLevel: 0,
    deck: [],
    dreamsigns: [],
    essence: 250,
  };
}

function makeMutations(): Pick<
  QuestMutations,
  | "addCard"
  | "setCurrentDreamscape"
  | "setDraftState"
  | "setDreamcallerSelection"
  | "setScreen"
  | "updateAtlas"
> {
  return {
    addCard: vi.fn(),
    setCurrentDreamscape: vi.fn(),
    setDraftState: vi.fn(),
    setDreamcallerSelection: vi.fn(),
    setScreen: vi.fn(),
    updateAtlas: vi.fn(),
  };
}

beforeEach(() => {
  resetLog();
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
});

describe("bootstrapQuestStart", () => {
  it("hands quest start directly into the first dreamscape with one resolved package", () => {
    const resolvedPackage = makeResolvedPackage();
    const state = makeState();
    const mutations = makeMutations();
    const cardDatabase = new Map<number, CardData>([
      [101, makeCard(101, ["tide_alpha"])],
      [202, makeCard(202, ["tide_beta"])],
    ]);

    bootstrapQuestStart({
      dreamcaller: resolvedPackage.dreamcaller,
      state,
      mutations,
      cardDatabase,
      questContent: makeQuestContent(resolvedPackage),
    });

    expect(mutations.setDreamcallerSelection).toHaveBeenCalledOnce();
    expect(mutations.setDreamcallerSelection).toHaveBeenCalledWith(resolvedPackage);
    expect(mutations.addCard).toHaveBeenCalledTimes(STARTER_CARD_NUMBERS.length);
    expect(
      vi.mocked(mutations.addCard).mock.calls.map(([cardNumber]) => cardNumber),
    ).toEqual([...STARTER_CARD_NUMBERS]);

    expect(mutations.setDraftState).toHaveBeenCalledOnce();
    expect(mutations.setDraftState).toHaveBeenCalledWith(
      {
        remainingCopiesByCard: { "101": 2, "202": 1 },
        currentOffer: [],
        activeSiteId: null,
        pickNumber: 1,
        sitePicksCompleted: 0,
      },
      "quest_start",
    );

    expect(mutations.updateAtlas).toHaveBeenCalledOnce();
    const atlas = vi.mocked(mutations.updateAtlas).mock.calls[0][0];
    const availableNode = Object.values(atlas.nodes).find(
      (node) => node.status === "available",
    );
    expect(availableNode).toBeDefined();
    expect(mutations.setCurrentDreamscape).toHaveBeenCalledWith(availableNode?.id);
    expect(mutations.setScreen).toHaveBeenCalledWith({ type: "dreamscape" });

    const entries = getLogEntries();
    expect(entries.some((entry) => entry.event === "dreamcaller_selected")).toBe(false);
    expect(entries.some((entry) => entry.event === "draft_pool_initialized")).toBe(true);
    const questStartedEntry = entries.find(
      (entry) => entry.event === "quest_started",
    );
    const starterDeckEntry = entries.find(
      (entry) => entry.event === "starter_deck_initialized",
    );
    expect(starterDeckEntry).toBeDefined();
    expect(starterDeckEntry).toMatchObject({
      event: "starter_deck_initialized",
      starterCardNumbers: [...STARTER_CARD_NUMBERS],
      totalDeckSize: STARTER_CARD_NUMBERS.length,
    });
    expect(questStartedEntry).toBeDefined();
    expect(questStartedEntry).toMatchObject({
      event: "quest_started",
      startingDeckSize: STARTER_CARD_NUMBERS.length,
      dreamcallerId: resolvedPackage.dreamcaller.id,
      dreamcallerName: resolvedPackage.dreamcaller.name,
      packageSummary: {
        mandatoryTides: resolvedPackage.mandatoryTides,
        optionalSubset: resolvedPackage.optionalSubset,
        selectedTides: resolvedPackage.selectedTides,
      },
      selectedPackageTides: resolvedPackage.selectedTides,
    });
  });
});
