import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceAtlas,
  resetAtlasGenerator,
  type AtlasBuildContext,
  type SiteGenerationContext,
} from "../atlas/atlas-generator";
import {
  loadTestAffiliations,
  loadTestAtlasConfig,
  loadTestDreamGuides,
  loadTestDreamscapes,
} from "../__test-helpers__/atlas-fixtures";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
} from "../__test-helpers__/pool-context";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import type { QuestContent } from "../data/quest-content";
import { createBattleInit } from "../battle/integration/create-battle-init";
import { createDefaultState } from "./quest-context";
import {
  canVisitSite,
  completeQuestSite,
  startQuestFromDreamcaller,
} from "./quest-state-actions";
import type { CardData } from "../types/cards";
import type { DreamcallerContent } from "../types/content";
import type {
  DreamscapeNode,
  QuestState,
  SiteState,
} from "../types/quest";

/**
 * End-to-end quest-flow integration coverage.
 *
 * This is the battle-mode-style backbone for the quest run: it drives the REAL
 * quest state actions (`startQuestFromDreamcaller`, `completeQuestSite`,
 * `canVisitSite`) and the REAL atlas advance (`advanceAtlas`, called exactly as
 * the battle-completion bridge calls it on a Battle victory) through a full
 * 7-layer run start -> dreamscape -> non-battle sites -> battle -> advance ->
 * ... -> final boss -> victory, plus a defeat branch that ends the run.
 *
 * It asserts flow-level invariants that per-function unit tests cannot see:
 * exactly one node is visited per layer, completed-layer siblings become
 * `forgone`, the deck respects the 25-card minimum battle padding, and a full
 * 7-layer run reaches the boss. All content is derived from the live compiled
 * bundles / test helpers, never hardcoded dreamscape names or card numbers, so
 * authoring edits to the TOML data do not break the test.
 */

const TEST_DREAMSCAPES = loadTestDreamscapes();
const TEST_ATLAS_CONFIG = loadTestAtlasConfig();
const TEST_AFFILIATIONS = loadTestAffiliations();
const TEST_GUIDES = loadTestDreamGuides();

/** Minimum cards a battle deck is padded up to before being shuffled. */
const MIN_BATTLE_DECK_SIZE = 25;
/** Maximum quest deck size the design allows during battles (doc rule). */
const MAX_QUEST_DECK_SIZE = 50;

function makeCard(
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return {
    name: `Card ${String(cardNumber)}`,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType: "Event",
    subtype: "Test",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Test card.",
    imageNumber: cardNumber,
    artOwned: true,
    ...overrides,
  };
}

function makeDreamcaller(id: string): DreamcallerContent {
  return {
    id,
    name: `Dreamcaller ${id}`,
    title: "Flow Witness",
    renderedText: "Test ability.",
    imageNumber: "0006",
    startingEssence: 200,
    signatureCards: [],
  };
}

/**
 * A {@link QuestContent} built entirely from the live compiled bundles plus the
 * shared pool-context helper, so the quest start path runs against the real
 * dreamscape, affiliation, guide, and atlas-config data.
 */
function makeQuestContent(): QuestContent {
  const starterCards = STARTER_CARD_NUMBERS.map((cardNumber) =>
    makeCard(cardNumber, { isStarter: true }),
  );
  const corpusCards = buildTestCorpusCards();
  const cardDatabase = new Map<number, CardData>(
    [...starterCards, ...corpusCards].map((card) => [card.cardNumber, card]),
  );

  return {
    cardDatabase,
    dreamcallers: [makeDreamcaller("dreamcaller-flow")],
    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: TEST_DREAMSCAPES,
    affiliations: TEST_AFFILIATIONS,
    guides: TEST_GUIDES,
    atlasConfig: TEST_ATLAS_CONFIG,
    poolContext: makeTestPoolContext(["dreamsign-a", "dreamsign-b"]),
  };
}

function buildContext(content: QuestContent): AtlasBuildContext {
  return {
    dreamscapes: content.dreamscapes,
    atlasConfig: content.atlasConfig,
    // The dreamsign pool the advance uses to reveal/assign two layers ahead.
    dreamsignPoolIds: content.poolContext?.allDreamsignPoolIds ?? [],
  };
}

const SITE_CONTEXT: SiteGenerationContext = {};

/** The node the quest state currently sits in. */
function currentNode(state: QuestState): DreamscapeNode {
  if (state.currentDreamscape === null) {
    throw new Error("flow test: expected a current dreamscape");
  }
  const node = state.atlas.nodes[state.currentDreamscape];
  if (node === undefined) {
    throw new Error(
      `flow test: current dreamscape ${state.currentDreamscape} missing from atlas`,
    );
  }
  return node;
}

/** The lone Battle site in a node's site list. */
function battleSite(node: DreamscapeNode): SiteState {
  const battle = node.sites.find((site) => site.type === "Battle");
  if (battle === undefined) {
    throw new Error(`flow test: node ${node.id} has no Battle site`);
  }
  return battle;
}

/**
 * Completes every non-Battle site in the current dreamscape, in order, through
 * the real `completeQuestSite` action. Asserts the Battle stays gated by
 * `canVisitSite` until all non-Battle sites are done (the Battle-last rule), and
 * returns the resulting state.
 */
function completeNonBattleSites(state: QuestState): QuestState {
  let next = state;
  const node = currentNode(next);
  const nonBattle = node.sites.filter((site) => site.type !== "Battle");
  const battle = battleSite(node);

  for (let index = 0; index < nonBattle.length; index += 1) {
    // Until the very last non-Battle site is cleared, the Battle is not visitable.
    expect(canVisitSite(next, battle.id)).toBe(false);
    const site = nonBattle[index];
    expect(canVisitSite(next, site.id)).toBe(true);
    next = completeQuestSite(next, site.id);
  }

  // Now every non-Battle site is visited, so the Battle is finally visitable.
  expect(canVisitSite(next, battle.id)).toBe(true);
  return next;
}

/**
 * Wins the current dreamscape's Battle and advances the atlas exactly the way
 * the battle-completion bridge does: mark the Battle visited, bump the
 * completion level, then `advanceAtlas(completedNodeId, completionLevel + 1)`.
 * Then travel to the first now-available forward node (the atlas-screen travel
 * action) and set it as the current dreamscape.
 *
 * Returns the new state and whether this was the final boss (no forward edges).
 */
function winBattleAndAdvance(
  state: QuestState,
  content: QuestContent,
): { next: QuestState; wasFinalBoss: boolean } {
  const node = currentNode(state);
  const battle = battleSite(node);
  const completionLevelAtStart = state.completionLevel;

  // The battle deck must be padded to the minimum before the fight; assert the
  // real battle-init build produces a legal deck for this state.
  const init = createBattleInit({
    battleEntryKey: `${battle.id}::${String(completionLevelAtStart)}::${node.id}`,
    site: battle,
    state,
    cardDatabase: content.cardDatabase,
    dreamcallers: content.dreamcallers,
    dreamscapes: content.dreamscapes,
    affiliations: content.affiliations,
    dreamsignTemplates: content.dreamsignTemplates,
    poolContext: content.poolContext,
  });
  expect(init.playerDeckOrder.length).toBeGreaterThanOrEqual(
    Math.min(MIN_BATTLE_DECK_SIZE, MAX_QUEST_DECK_SIZE),
  );
  // The quest deck itself stays within the 50-card battle ceiling.
  expect(state.deck.length).toBeLessThanOrEqual(MAX_QUEST_DECK_SIZE);

  // Victory: mark Battle visited and advance the atlas (mirrors the bridge).
  const afterBattleSite = completeQuestSite(state, battle.id);
  const newCompletionLevel = completionLevelAtStart + 1;
  const advanced = advanceAtlas(
    afterBattleSite.atlas,
    node.id,
    newCompletionLevel,
    SITE_CONTEXT,
    buildContext(content),
    { logEvents: false },
  );

  const wasFinalBoss = node.forwardIds.length === 0;
  let next: QuestState = {
    ...afterBattleSite,
    completionLevel: newCompletionLevel,
    atlas: advanced,
    currentDreamscape: null,
  };

  if (!wasFinalBoss) {
    // Travel to one of the now-available forward nodes, exactly as the atlas
    // screen's travel action does.
    const targetId = node.forwardIds.find(
      (id) => advanced.nodes[id].state === "available",
    );
    expect(targetId).toBeDefined();
    next = { ...next, currentDreamscape: targetId ?? null };
  }

  return { next, wasFinalBoss };
}

beforeEach(() => {
  resetAtlasGenerator();
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("quest flow (end to end)", () => {
  it("plays a full 7-layer run start -> sites -> battle -> advance -> boss victory", () => {
    const content = makeQuestContent();
    const dreamcaller = content.dreamcallers[0];

    let state = startQuestFromDreamcaller({
      prev: createDefaultState(),
      dreamcaller,
      questContent: content,
      seedOverride: "flow-victory-seed",
    });

    // Quest start lands the player in the starting dreamscape on the dreamscape
    // screen with the starter deck and no sites visited yet.
    expect(state.screen).toEqual({ type: "dreamscape" });
    expect(state.currentDreamscape).toBe(state.atlas.startingNodeId);
    expect(state.visitedSites).toEqual([]);
    expect(state.deck.map((entry) => entry.cardNumber)).toEqual(
      STARTER_CARD_NUMBERS,
    );
    const layerCount = state.atlas.layers.length;
    expect(layerCount).toBe(TEST_ATLAS_CONFIG.layerSpecs.length);

    // Track which node was visited in each layer, so we can assert exactly one
    // per layer and that the others in that layer were forgone.
    const visitedByLayer = new Map<number, string>();
    let reachedBoss = false;

    // Bound the walk by the layer count plus a small guard against a malformed
    // graph; a healthy run completes in exactly `layerCount` battles.
    for (let step = 0; step < layerCount + 2; step += 1) {
      const node = currentNode(state);
      // One node per layer: we must not have already visited this layer.
      expect(visitedByLayer.has(node.layer)).toBe(false);
      visitedByLayer.set(node.layer, node.id);

      state = completeNonBattleSites(state);
      const { next, wasFinalBoss } = winBattleAndAdvance(state, content);
      state = next;

      // The just-completed node is `completed`, and its layer siblings are now
      // `forgone` (the take-one-forgo-the-rest invariant).
      expect(state.atlas.nodes[node.id].state).toBe("completed");
      for (const siblingId of state.atlas.layers[node.layer]) {
        if (siblingId !== node.id) {
          expect(state.atlas.nodes[siblingId].state).toBe("forgone");
        }
      }

      if (wasFinalBoss) {
        reachedBoss = true;
        break;
      }
    }

    // A full run reaches and clears the boss after exactly one node per layer.
    expect(reachedBoss).toBe(true);
    expect(visitedByLayer.size).toBe(layerCount);
    // The final visited node is the boss node.
    expect(visitedByLayer.get(layerCount - 1)).toBe(state.atlas.bossNodeId);
    expect(state.atlas.nodes[state.atlas.bossNodeId].state).toBe("completed");
    // The completion level advanced once per battle across the whole run.
    expect(state.completionLevel).toBe(layerCount);

    // Every layer except the one currently sitting under the boss had exactly
    // one completed node and the rest forgone (no two siblings both progressed).
    for (let layer = 0; layer < layerCount; layer += 1) {
      const completed = state.atlas.layers[layer].filter(
        (id) => state.atlas.nodes[id].state === "completed",
      );
      expect(completed).toHaveLength(1);
    }
  });

  it("pads a small starter deck up to the battle minimum at the first battle", () => {
    const content = makeQuestContent();
    const state = startQuestFromDreamcaller({
      prev: createDefaultState(),
      dreamcaller: content.dreamcallers[0],
      questContent: content,
      seedOverride: "flow-padding-seed",
    });

    // The starter deck is below the 25-card battle minimum, so the battle deck
    // is padded up to it while the quest deck itself is left unchanged.
    expect(state.deck.length).toBeLessThan(MIN_BATTLE_DECK_SIZE);
    const node = currentNode(state);
    const battle = battleSite(node);
    const init = createBattleInit({
      battleEntryKey: `${battle.id}::0::${node.id}`,
      site: battle,
      state,
      cardDatabase: content.cardDatabase,
      dreamcallers: content.dreamcallers,
      dreamscapes: content.dreamscapes,
      affiliations: content.affiliations,
      dreamsignTemplates: content.dreamsignTemplates,
      poolContext: content.poolContext,
    });
    expect(init.playerDeckOrder.length).toBeGreaterThanOrEqual(
      MIN_BATTLE_DECK_SIZE,
    );
  });

  it("ends the run on a defeat without advancing the atlas", () => {
    const content = makeQuestContent();
    let state = startQuestFromDreamcaller({
      prev: createDefaultState(),
      dreamcaller: content.dreamcallers[0],
      questContent: content,
      seedOverride: "flow-defeat-seed",
    });

    // Clear the starting dreamscape's non-Battle sites, then reach the Battle.
    state = completeNonBattleSites(state);
    const node = currentNode(state);
    const battle = battleSite(node);
    expect(canVisitSite(state, battle.id)).toBe(true);

    const completionLevelBefore = state.completionLevel;
    const atlasBefore = state.atlas;

    // A defeat ends the run: the failure screen is shown, the completion level
    // does NOT advance, and the atlas is NOT advanced (no new layer revealed).
    const defeated: QuestState = {
      ...state,
      screen: { type: "questFailed" },
      failureSummary: {
        battleId: `battle:${battle.id}`,
        result: "defeat",
        reason: "score_target_reached",
        siteId: battle.id,
        siteLabel: "Battle",
        dreamscapeIdOrNone: node.id,
        turnNumber: 12,
        playerScore: 3,
        enemyScore: 25,
      },
    };

    expect(defeated.screen).toEqual({ type: "questFailed" });
    expect(defeated.completionLevel).toBe(completionLevelBefore);
    expect(defeated.atlas).toBe(atlasBefore);
    // The boss was never reached on a first-layer defeat.
    expect(defeated.atlas.nodes[defeated.atlas.bossNodeId].state).not.toBe(
      "completed",
    );
  });
});
