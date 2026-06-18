import { describe, expect, it } from "vitest";
import { MINIMAL_ATLAS_CONFIG, MINIMAL_DREAMSCAPES } from "../__test-helpers__/atlas-fixtures";
import type { CardData } from "../types/cards";
import type { QuestContent } from "../data/quest-content";
import type { DreamcallerContent } from "../types/content";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
} from "../__test-helpers__/pool-context";
import { createStartInBattleState } from "./start-in-battle-state";

function makeDreamcaller(): DreamcallerContent {
  return {
    id: "dreamcaller-1",
    name: "Test Dreamcaller",
    title: "Caller of Tests",
    renderedText: "Test ability.",
    imageNumber: "0001",
    startingEssence: 250,
    signatureCards: ["Alpha Card 1"],
  };
}

function makeQuestContent(): QuestContent {
  const dreamcaller = makeDreamcaller();
  const cardDatabase = new Map<number, CardData>(
    buildTestCorpusCards().map((card) => [card.cardNumber, card]),
  );
  return {
    cardDatabase,
    dreamcallers: [dreamcaller],

    dreamwellCards: [],    dreamsignTemplates: [],    dreamscapes: MINIMAL_DREAMSCAPES, affiliations: [], guides: [],    atlasConfig: MINIMAL_ATLAS_CONFIG,
    poolContext: makeTestPoolContext(["dreamsign-1", "dreamsign-2"]),
  };
}

describe("createStartInBattleState", () => {
  it("builds a starter run already routed to the first battle site", () => {
    const state = createStartInBattleState(makeQuestContent());

    expect(state).not.toBeNull();
    expect(state?.deck).toHaveLength(10);
    expect(state?.dreamcaller?.id).toBe("dreamcaller-1");
    expect(state?.screen.type).toBe("site");
    expect(state?.currentDreamscape).not.toBeNull();
    expect(state?.activeSiteId).toBe(
      state?.screen.type === "site" ? state.screen.siteId : null,
    );

    const currentNode =
      state?.currentDreamscape === null || state === null
        ? undefined
        : state.atlas.nodes[state.currentDreamscape];
    const activeBattleSite = currentNode?.sites.find(
      (site) =>
        state?.screen.type === "site" &&
        site.id === state.screen.siteId &&
        site.type === "Battle",
    );

    expect(activeBattleSite?.type).toBe("Battle");
  });

  it("returns null when the run pool context is unavailable", () => {
    const dreamcaller = makeDreamcaller();
    const questContent: QuestContent = {
      cardDatabase: new Map(),
      dreamcallers: [dreamcaller],

      dreamwellCards: [],      dreamsignTemplates: [],      dreamscapes: MINIMAL_DREAMSCAPES, affiliations: [], guides: [],      atlasConfig: MINIMAL_ATLAS_CONFIG,
    };

    expect(createStartInBattleState(questContent)).toBeNull();
  });

  it("returns null when there are no dreamcallers", () => {
    const questContent: QuestContent = {
      cardDatabase: new Map(),
      dreamcallers: [],

      dreamwellCards: [],      dreamsignTemplates: [],      dreamscapes: MINIMAL_DREAMSCAPES, affiliations: [], guides: [],      atlasConfig: MINIMAL_ATLAS_CONFIG,
      poolContext: makeTestPoolContext(),
    };

    expect(createStartInBattleState(questContent)).toBeNull();
  });
});
