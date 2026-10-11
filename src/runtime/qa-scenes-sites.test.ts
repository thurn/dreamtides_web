// Site QA scenes: direct site jumps, the Exploration scenes, and the
// dreamscape scenes parked before an Essence or Reward site.

import { testJourneySeed } from "../types/test-identities";
import { describe, expect, it } from "vitest";
import type { CardData } from "../types/cards";
import { parseCardName } from "../types/card-identity";
import { parseQaSceneId } from "../types/identifiers";
import type { JourneyContent } from "../data/journey-content";
import { eligibleTransfigurations } from "../transfiguration/transfiguration-logic";
import { buildQaScene } from "./qa-scenes";
import { parseSiteId } from "../types/identifiers";
import {
  testCardId,
  testExplorationActionId,
  testDreamsignId,
} from "../types/test-identities";
import {
  activeSiteOf,
  makeJourneyContent,
  SCENE_OPTIONS,
} from "./qa-scenes.fixtures";

describe("site QA scenes", () => {
  it("registers direct QA jumps for gameplay site screens", () => {
    const expectedSites = [[parseQaSceneId("draft"), "Draft"]] as const;

    for (const [sceneId, siteType] of expectedSites) {
      const state = buildQaScene(
        sceneId,
        makeJourneyContent(),
        SCENE_OPTIONS,
      );
      expect(state).not.toBeNull();
      expect(state?.screen.type).toBe("site");
      expect(state?.currentDreamscape).not.toBeNull();
      const node =
        state?.currentDreamscape === null ||
        state?.currentDreamscape === undefined
          ? undefined
          : state?.atlas.nodes[state.currentDreamscape];
      const activeSite = node?.sites.find(
        (site) => site.id === activeSiteOf(state),
      );
      expect(activeSite?.type).toBe(siteType);
    }
  });
});

describe('the "exploration" QA scene', () => {
  const STARTER_CARD_IDS = Array.from(
    { length: 10 },
    (_, index) =>
      `b0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );

  function addStarterCatalog(content: JourneyContent): void {
    const starterCardNumbers = content.poolContext?.starterCardNumbers ?? [];
    starterCardNumbers.forEach((cardNumber, index) => {
      const id = STARTER_CARD_IDS[index];
      if (id === undefined) {
        throw new Error("Exploration QA fixture has too many starter cards.");
      }
      content.cardDatabase.set(cardNumber, {
        id: testCardId(id),
        name: parseCardName(`QA Starter ${String(index + 1)}`),
        cardNumber,
        cardType: index % 2 === 0 ? "Character" : "Event",
        subtype: index % 2 === 0 ? "Survivor" : "",
        isStarter: true,
        roles: ["starter-deck"],
        energyCost: 1,
        spark: 1,
        isFast: false,
        renderedText: "",
        imageNumber: cardNumber,
        artOwned: true,
      });
    });
  }

  function explorationContent(): {
    content: JourneyContent;
    encounterCardId: CardData["id"];
  } {
    const content = makeJourneyContent();
    addStarterCatalog(content);
    const nonStarterCards = [...content.cardDatabase.values()].filter(
      (card) => !card.isStarter,
    );
    nonStarterCards.slice(0, 8).forEach((card) => {
      content.cardDatabase.set(card.cardNumber, {
        ...card,
        cardType: "Character",
        subtype: "Survivor",
      });
    });
    nonStarterCards.slice(8, 14).forEach((card) => {
      content.cardDatabase.set(card.cardNumber, {
        ...card,
        cardType: "Event",
        subtype: "",
      });
    });
    nonStarterCards.slice(14, 16).forEach((card) => {
      content.cardDatabase.set(card.cardNumber, {
        ...card,
        cardType: "Character",
        subtype: "Warrior",
      });
    });
    nonStarterCards.slice(16, 22).forEach((card) => {
      content.cardDatabase.set(card.cardNumber, {
        ...card,
        cardType: "Character",
        subtype: "Spirit Animal",
      });
    });
    const encounterCardId = [...content.cardDatabase.values()][0]?.id;
    if (encounterCardId === undefined) {
      throw new Error("Exploration QA fixture requires a catalog card.");
    }
    content.exploration = {
      ...content.exploration,
      customCards: [],
      customDreamsigns: [],
      encounters: [
        {
          cardId: encounterCardId,
          prose: "A precise encounter.",
          actions: [
            {
              id: testExplorationActionId("precise-choice-a"),
              label: "Choose A",
              effectText: "Gain Essence.",
              effectKind: "gain-essence-per-card",
            },
            {
              id: testExplorationActionId("precise-choice-b"),
              label: "Choose B",
              effectText: "Gain Essence.",
              effectKind: "gain-essence-per-card",
            },
          ],
        },
      ],
    };
    return { content, encounterCardId };
  }

  it("prebuilds the encounter for the requested source-card UUID", () => {
    const { content, encounterCardId } = explorationContent();

    const state = buildQaScene(parseQaSceneId("exploration"), content, {
      ...SCENE_OPTIONS,
      explorationCardId: encounterCardId,
    });

    const runtime = Object.values(state?.siteRuntime ?? {}).find(
      (candidate) => candidate.kind === "exploration",
    );
    expect(runtime?.kind).toBe("exploration");
    if (runtime?.kind === "exploration") {
      expect(runtime.encounterCardId).toBe(encounterCardId);
    }
  });

  it("parks the purchase-path scene before Exploration with Shop and Bazaar siblings", () => {
    const { content, encounterCardId } = explorationContent();

    const state = buildQaScene(
      parseQaSceneId("exploration-purchases"),
      content,
      {
        explorationCardId: encounterCardId,
        journeySeed: testJourneySeed("qa-purchase-path"),
      },
    );
    const currentNode =
      state?.currentDreamscape === null ||
      state?.currentDreamscape === undefined
        ? undefined
        : state.atlas.nodes[state.currentDreamscape];
    const activeSite = currentNode?.sites.find(
      (site) => site.id === activeSiteOf(state),
    );
    const shop = currentNode?.sites.find((site) => site.type === "Shop");
    const bazaar = currentNode?.sites.find(
      (site) => site.type === "DreamsignBazaar",
    );
    const battleIndex =
      currentNode?.sites.findIndex((site) => site.type === "Battle") ?? -1;
    const bazaarIndex =
      currentNode?.sites.findIndex((site) => site.type === "DreamsignBazaar") ??
      -1;

    expect(state).not.toBeNull();
    expect(state?.seed).toBe("qa-purchase-path");
    expect(state?.essence).toBe(101);
    expect(state?.screen).toEqual({
      type: "site",
      siteId: activeSiteOf(state),
    });
    expect(activeSite?.type).toBe("Exploration");
    expect(activeSite?.isVisited).toBe(false);
    expect(shop).toMatchObject({
      type: "Shop",
      isEnhanced: false,
      isVisited: false,
    });
    expect(bazaar).toMatchObject({
      id: parseSiteId(`${activeSiteOf(state) ?? "none"}-qa-dreamsign-bazaar`),
      type: "DreamsignBazaar",
      isEnhanced: false,
      isVisited: false,
    });
    expect(bazaarIndex).toBe(battleIndex - 1);
  });

  it("provides a dedicated duplicate-deck scene with two duplicated card UUIDs", () => {
    const { content, encounterCardId } = explorationContent();
    for (const [cardNumber, card] of content.cardDatabase) {
      if (card.isStarter) continue;
      content.cardDatabase.set(cardNumber, {
        ...card,
        renderedText: "2●: Gain 1 spark.",
      });
    }

    const state = buildQaScene(
      parseQaSceneId("exploration-duplicates"),
      content,
      {
        ...SCENE_OPTIONS,
        explorationCardId: encounterCardId,
      },
    );

    expect(state).not.toBeNull();
    const countsByCardNumber = new Map<number, number>();
    for (const entry of state?.deck ?? []) {
      countsByCardNumber.set(
        entry.cardNumber,
        (countsByCardNumber.get(entry.cardNumber) ?? 0) + 1,
      );
    }
    expect(
      [...countsByCardNumber.values()].filter((count) => count > 1),
    ).toEqual([2, 2]);
    for (const [cardNumber, count] of countsByCardNumber) {
      if (count <= 1) continue;
      const card = content.cardDatabase.get(cardNumber);
      if (card === undefined) {
        throw new Error(
          "Duplicated QA deck cards must resolve in the catalog.",
        );
      }
      expect(
        eligibleTransfigurations(content.transfigurationData, card),
      ).toContain("Attuned");
    }
    expect(new Set(state?.deck.map((entry) => entry.entryId)).size).toBe(
      state?.deck.length,
    );
  });
});

describe('the "dreamscape-with-essence" QA scene', () => {
  it("parks on the dreamscape overview with an unvisited Essence site", () => {
    const state = buildQaScene(
      parseQaSceneId("dreamscape-with-essence"),
      makeJourneyContent(),
      SCENE_OPTIONS,
    );

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("dreamscape");
    expect(state?.essence).toBe(450);
    expect(state?.currentDreamscape).not.toBeNull();

    const node = state?.currentDreamscape
      ? state.atlas.nodes[state.currentDreamscape]
      : undefined;
    const essenceSite = node?.sites.find((site) => site.type === "Essence");
    expect(essenceSite).toBeDefined();
    expect(essenceSite?.isVisited).toBe(false);
  });
});

describe('the "reward" QA scene', () => {
  it("parks on the dreamscape overview with an unvisited Reward site", () => {
    const state = buildQaScene(
      parseQaSceneId("reward"),
      makeJourneyContent(),
      SCENE_OPTIONS,
    );

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("dreamscape");
    expect(state?.currentDreamscape).not.toBeNull();

    const node = state?.currentDreamscape
      ? state.atlas.nodes[state.currentDreamscape]
      : undefined;
    const rewardSite = node?.sites.find((site) => site.type === "Reward");
    expect(rewardSite).toBeDefined();
    expect(rewardSite?.isVisited).toBe(false);
  });

  it("builds the at-cap replacement state with UUID-backed Dreamsigns", () => {
    const content = makeJourneyContent();
    content.dreamsignTemplates = Array.from({ length: 13 }, (_, index) => ({
      id: testDreamsignId(`dreamsign-${String(index + 1)}`),
      name: `Dreamsign ${String(index + 1)}`,
      effectDescription: "A QA effect.",
    }));
    const state = buildQaScene(
      parseQaSceneId("reward-at-cap"),
      content,
      SCENE_OPTIONS,
    );

    expect(state).not.toBeNull();
    expect(state?.dreamsigns).toHaveLength(state?.maxDreamsigns ?? 0);
    const runtime = Object.values(state?.siteRuntime ?? {}).find(
      (candidate) => candidate.kind === "reward",
    );
    expect(runtime?.kind).toBe("reward");
    if (runtime?.kind === "reward") {
      expect(runtime.reward.rewardType).toBe("dreamsign");
    }
  });
});
