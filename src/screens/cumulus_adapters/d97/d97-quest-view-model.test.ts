// D97 quest view models: quest marks hide object anchors outside their
// quest; the dialogue view clamps its line, shows only holding choices,
// prices an Essence offer from the tunables and carries the speaker's
// character; the quest log shows the held quest's status, items, giver and
// reward; the reward view keeps one slot per offered copy.

import { describe, expect, it } from "vitest";
import { D97_QUESTS } from "../../../content/d97/quests";
import { buildDialogueCatalog } from "../../../d97/dialogue/catalog";
import type { D97DialogueContext } from "../../../d97/dialogue/conditions";
import {
  ANCHORS,
  DELIVERY_QUEST,
  FLAG,
  GIVER_DIALOGUE,
  LOST_OBJECT_QUEST,
  NODES,
  STEPS,
  SYNTHETIC_CONTENT,
} from "../../../d97/dialogue/dialogue.fixtures";
import { makeCard } from "../../../shop/shop-generator-test-fixtures";
import { emptyCollection } from "../../../d97/collection/collection";
import type { CompiledAnchor } from "../../../d97/map/compiled";
import { acceptQuest, emptyQuestState, questEssence } from "../../../d97/quests/quests";
import type { D97QuestState } from "../../../d97/quests/types";
import { parseD97CharacterId, type DreamAnchorId } from "../../../types/identifiers";
import { testCardId } from "../../../types/test-identities";
import {
  buildD97DialogueView,
  buildD97QuestLogView,
  buildD97QuestMarks,
  buildD97QuestRewardView,
  rewardSlotCard,
} from "./d97-quest-view-model";

const CATALOG = buildDialogueCatalog([SYNTHETIC_CONTENT]);
const OBJECT: CompiledAnchor = { id: ANCHORS.object, kind: "object", at: [1, 1] };
const GIVER: CompiledAnchor = { id: ANCHORS.giver, kind: "friendly", at: [2, 1] };

function holding(quest: typeof DELIVERY_QUEST): D97QuestState {
  const result = acceptQuest(emptyQuestState(), quest, quest.giverAnchorId, []);
  if (result === null) throw new Error("not accepted");
  return result.state;
}

function context(flags: D97DialogueContext["flags"]): D97DialogueContext {
  return {
    quests: emptyQuestState(),
    questCatalog: CATALOG.quests,
    flags,
    act: 1,
    beatenAnchorIds: [],
    collection: emptyCollection(),
    cardFacts: () => null,
  };
}

describe("buildD97QuestMarks", () => {
  it("hides object anchors outside their quest and carries quest badges", () => {
    const idle = buildD97QuestMarks(emptyQuestState(), CATALOG.quests, [OBJECT, GIVER]);
    expect([...idle.hiddenAnchorIds]).toEqual([ANCHORS.object]);
    expect(idle.badges.get(ANCHORS.giver)).toBe("questOffer");
    const searching = buildD97QuestMarks(holding(LOST_OBJECT_QUEST), CATALOG.quests, [OBJECT, GIVER]);
    expect(searching.hiddenAnchorIds.size).toBe(0);
  });
});

describe("buildD97DialogueView", () => {
  const offer = GIVER_DIALOGUE.nodes.find((node) => node.id === NODES.offer);
  if (offer === undefined) throw new Error("no offer node");

  it("shows the holding choices and prices an Essence offer", () => {
    const hidden = buildD97DialogueView({ module: GIVER_DIALOGUE, node: offer, lineIndex: 9, context: context([]), avatars: [], tuning: D97_QUESTS, characterId: null });
    expect(hidden.lineIndex).toBe(0);
    expect(hidden.portrait).toBeNull();
    expect(hidden.choices.map((choice) => choice.index)).toEqual([1]);
    expect(hidden.reward).toBeNull();
    const speaker = parseD97CharacterId("00000009-0000-4000-8000-000000000001");
    const shown = buildD97DialogueView({ module: GIVER_DIALOGUE, node: offer, lineIndex: 0, context: context([FLAG]), avatars: [], tuning: D97_QUESTS, characterId: speaker });
    expect(shown.choices[0]).toMatchObject({ index: 0 });
    expect(shown.reward).toEqual({ kind: "essence", amount: questEssence(D97_QUESTS.essenceReward.delivery, 1) });
    expect(shown.characterId).toBe(speaker);
  });
});

describe("buildD97QuestLogView", () => {
  const nobody = () => null;
  it("shows no quest, then the held quest with its carried items", () => {
    expect(buildD97QuestLogView(emptyQuestState(), CATALOG, nobody, D97_QUESTS, 1).quest).toBeNull();
    const view = buildD97QuestLogView(holding(DELIVERY_QUEST), CATALOG, nobody, D97_QUESTS, 1);
    expect(view.quest).toMatchObject({ questId: DELIVERY_QUEST.id, status: "active" });
    expect(view.quest?.items).toHaveLength(1);
    const ready: D97QuestState = { ...holding(DELIVERY_QUEST), active: { questId: DELIVERY_QUEST.id, completedStepIds: [STEPS.deliver] }, items: [] };
    expect(buildD97QuestLogView(ready, CATALOG, nobody, D97_QUESTS, 1).quest?.status).toBe("ready");
  });

  it("names the quest's giver when they have a name, and shows what it pays in the act", () => {
    const named = (anchorId: DreamAnchorId) => (anchorId === DELIVERY_QUEST.giverAnchorId ? "Giver" : null);
    expect(buildD97QuestLogView(holding(DELIVERY_QUEST), CATALOG, nobody, D97_QUESTS, 1).quest?.giverLine).toBeNull();
    const act2 = buildD97QuestLogView(holding(DELIVERY_QUEST), CATALOG, named, D97_QUESTS, 2).quest;
    expect(act2?.giverLine).not.toBeNull();
    expect(act2?.reward).toEqual({ kind: "essence", amount: questEssence(D97_QUESTS.essenceReward.delivery, 2) });
    const cards = buildD97QuestLogView(holding(LOST_OBJECT_QUEST), CATALOG, nobody, D97_QUESTS, 1).quest?.reward;
    expect(cards?.kind).toBe(LOST_OBJECT_QUEST.reward.kind === "essence" ? "essence" : "cards");
  });
});

describe("buildD97QuestRewardView", () => {
  it("keeps one slot per offered copy and maps slots back to cards", () => {
    const card = testCardId("d97-reward-view");
    const state: D97QuestState = { ...emptyQuestState(), pendingReward: { questId: LOST_OBJECT_QUEST.id, cardIds: [card, card] } };
    const view = buildD97QuestRewardView(state, CATALOG, new Map([[card, makeCard({ id: card })]]));
    expect(view?.cards.map((entry) => entry.slot)).toEqual(["slot-0", "slot-1"]);
    expect(rewardSlotCard(state, "slot-1")).toBe(card);
    expect(buildD97QuestRewardView(emptyQuestState(), CATALOG, new Map())).toBeNull();
  });
});
