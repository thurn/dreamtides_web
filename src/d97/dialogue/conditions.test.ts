// Condition evaluation: each condition kind reads its part of the run, the
// combinators compose them, and the runtime opens on the first entry that
// holds and shows only the choices whose conditions hold.

import { describe, expect, it } from "vitest";
import type { D97DialogueCondition } from "../../content/d97/dialogue/schema";
import type { CardId } from "../../types/card-identity";
import { parseCardSubtype } from "../../types/card-identity";
import { parseD97RunSeed } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";
import { testCollection } from "../collection/collection.fixtures";
import { emptyQuestState } from "../quests/quests";
import type { D97QuestState } from "../quests/types";
import { evaluateCondition, type D97CardFacts, type D97DialogueContext } from "./conditions";
import {
  ANCHORS,
  DEFEAT_QUEST,
  DELIVERY_QUEST,
  FLAG,
  GIVER_DIALOGUE,
  ITEMS,
  NODES,
  QUESTS,
  STEPS,
} from "./dialogue.fixtures";
import { openingNode, visibleChoices } from "./runtime";

const RARE = testCardId("d97-condition-rare");
const CHEAP = testCardId("d97-condition-cheap");
const FACTS: ReadonlyMap<CardId, D97CardFacts> = new Map<CardId, D97CardFacts>([
  [RARE, { rarity: "Rare", cardType: "Character", subtype: parseCardSubtype("Warrior"), energyCost: 5 }],
  [CHEAP, { rarity: "Common", cardType: "Event", subtype: parseCardSubtype(""), energyCost: 1 }],
]);

function collectionOf(cardIds: readonly CardId[]) {
  return testCollection(cardIds.map((cardId) => [cardId, "deck"] as const), parseD97RunSeed("seed"));
}

function context(overrides: Partial<D97DialogueContext> = {}): D97DialogueContext {
  return {
    quests: emptyQuestState(),
    questCatalog: new Map(QUESTS.map((quest) => [quest.id, quest])),
    flags: [],
    act: 1,
    beatenAnchorIds: [],
    collection: collectionOf([RARE, RARE, CHEAP]),
    cardFacts: (cardId) => FACTS.get(cardId) ?? null,
    ...overrides,
  };
}

const HOLDING_DEFEAT: D97QuestState = {
  ...emptyQuestState(),
  active: { questId: DEFEAT_QUEST.id, completedStepIds: [] },
  items: [ITEMS.relic],
};

function check(condition: D97DialogueCondition, overrides: Partial<D97DialogueContext> = {}): boolean {
  return evaluateCondition(condition, context(overrides));
}

describe("evaluateCondition", () => {
  it("quest: available, active, ready and completed", () => {
    expect(check({ kind: "quest", questId: DEFEAT_QUEST.id, status: "available" })).toBe(true);
    expect(check({ kind: "quest", questId: DEFEAT_QUEST.id, status: "active" }, { quests: HOLDING_DEFEAT })).toBe(true);
    const ready: D97QuestState = { ...HOLDING_DEFEAT, active: { questId: DEFEAT_QUEST.id, completedStepIds: [STEPS.defeat] } };
    expect(check({ kind: "quest", questId: DEFEAT_QUEST.id, status: "ready" }, { quests: ready })).toBe(true);
    const done: D97QuestState = { ...emptyQuestState(), completedQuestIds: [DEFEAT_QUEST.id] };
    expect(check({ kind: "quest", questId: DEFEAT_QUEST.id, status: "completed" }, { quests: done })).toBe(true);
    expect(check({ kind: "quest", questId: DEFEAT_QUEST.id, status: "completed" })).toBe(false);
  });

  it("questStep: pending, current and done", () => {
    const step = { kind: "questStep", questId: DEFEAT_QUEST.id, stepId: STEPS.defeat } as const;
    expect(check({ ...step, status: "pending" })).toBe(true);
    expect(check({ ...step, status: "current" }, { quests: HOLDING_DEFEAT })).toBe(true);
    const ready: D97QuestState = { ...HOLDING_DEFEAT, active: { questId: DEFEAT_QUEST.id, completedStepIds: [STEPS.defeat] } };
    expect(check({ ...step, status: "done" }, { quests: ready })).toBe(true);
  });

  it("questHeld", () => {
    expect(check({ kind: "questHeld", held: false })).toBe(true);
    expect(check({ kind: "questHeld", held: true }, { quests: HOLDING_DEFEAT })).toBe(true);
  });

  it("flag", () => {
    expect(check({ kind: "flag", flagId: FLAG, set: false })).toBe(true);
    expect(check({ kind: "flag", flagId: FLAG, set: true }, { flags: [FLAG] })).toBe(true);
  });

  it("act: inclusive bounds, open when missing", () => {
    expect(check({ kind: "act", min: 2 }, { act: 2 })).toBe(true);
    expect(check({ kind: "act", max: 1 }, { act: 2 })).toBe(false);
    expect(check({ kind: "act", min: 1, max: 3 }, { act: 3 })).toBe(true);
  });

  it("anchorBeaten", () => {
    expect(check({ kind: "anchorBeaten", anchorId: ANCHORS.challenger, beaten: false })).toBe(true);
    expect(check({ kind: "anchorBeaten", anchorId: ANCHORS.challenger, beaten: true }, { beatenAnchorIds: [ANCHORS.challenger] })).toBe(true);
  });

  it("hasItem", () => {
    expect(check({ kind: "hasItem", itemId: ITEMS.relic, held: true }, { quests: HOLDING_DEFEAT })).toBe(true);
    expect(check({ kind: "hasItem", itemId: ITEMS.parcel, held: true }, { quests: HOLDING_DEFEAT })).toBe(false);
  });

  it("collection: counts owned copies with each trait", () => {
    expect(check({ kind: "collection", trait: { kind: "rarity", rarity: "Rare" }, atLeast: 2 })).toBe(true);
    expect(check({ kind: "collection", trait: { kind: "rarity", rarity: "Rare" }, atLeast: 3 })).toBe(false);
    expect(check({ kind: "collection", trait: { kind: "cardType", cardType: "Event" }, atLeast: 1 })).toBe(true);
    expect(check({ kind: "collection", trait: { kind: "subtype", subtype: parseCardSubtype("Warrior") }, atLeast: 2 })).toBe(true);
    expect(check({ kind: "collection", trait: { kind: "cost", max: 2 }, atLeast: 1 })).toBe(true);
    expect(check({ kind: "collection", trait: { kind: "cost", min: 6 }, atLeast: 1 })).toBe(false);
  });

  it("all, any and not compose", () => {
    const yes: D97DialogueCondition = { kind: "questHeld", held: false };
    const no: D97DialogueCondition = { kind: "questHeld", held: true };
    expect(check({ kind: "all", conditions: [yes, yes] })).toBe(true);
    expect(check({ kind: "all", conditions: [yes, no] })).toBe(false);
    expect(check({ kind: "any", conditions: [no, yes] })).toBe(true);
    expect(check({ kind: "not", condition: no })).toBe(true);
  });
});

describe("dialogue runtime", () => {
  it("opens on the first entry that holds and filters choices", () => {
    expect(openingNode(GIVER_DIALOGUE, context())?.id).toBe(NODES.greet);
    const done: D97QuestState = { ...emptyQuestState(), completedQuestIds: [DELIVERY_QUEST.id] };
    expect(openingNode(GIVER_DIALOGUE, context({ quests: done }))?.id).toBe(NODES.done);
    const offer = GIVER_DIALOGUE.nodes.find((node) => node.id === NODES.offer);
    if (offer === undefined) throw new Error("no offer node");
    expect(visibleChoices(offer, context()).map(({ index }) => index)).toEqual([1]);
    expect(visibleChoices(offer, context({ flags: [FLAG] })).map(({ index }) => index)).toEqual([0, 1]);
  });
});
