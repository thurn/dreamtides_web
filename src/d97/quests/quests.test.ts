// Quest marks: object anchors show only while their quest is held and the
// object is not yet picked up; `!` marks each available quest's giver while
// no quest is held; `?` marks the held quest's visit or deliver target, then
// its turn-in anchor once it is ready.

import { describe, expect, it } from "vitest";
import {
  ANCHORS,
  DELIVERY_QUEST,
  ERRAND_QUEST,
  LOST_OBJECT_QUEST,
  QUESTS,
  STEPS,
} from "../dialogue/dialogue.fixtures";
import { acceptQuest, emptyQuestState, objectAnchorVisible, pickUpObject, questBadges } from "./quests";
import type { D97QuestState } from "./types";

const CATALOG = new Map(QUESTS.map((quest) => [quest.id, quest]));

function accepted(quest: typeof LOST_OBJECT_QUEST): D97QuestState {
  const result = acceptQuest(emptyQuestState(), quest, quest.giverAnchorId, []);
  if (result === null) throw new Error("not accepted");
  return result.state;
}

describe("objectAnchorVisible", () => {
  it("shows an object only while its quest is held and it is not picked up", () => {
    expect(objectAnchorVisible(emptyQuestState(), CATALOG, ANCHORS.object)).toBe(false);
    const holding = accepted(LOST_OBJECT_QUEST);
    expect(objectAnchorVisible(holding, CATALOG, ANCHORS.object)).toBe(true);
    expect(objectAnchorVisible(holding, CATALOG, ANCHORS.otherObject)).toBe(false);
    const picked = pickUpObject(holding, CATALOG, ANCHORS.object);
    expect(picked === null ? true : objectAnchorVisible(picked.state, CATALOG, ANCHORS.object)).toBe(false);
    expect(objectAnchorVisible(accepted(ERRAND_QUEST), CATALOG, ANCHORS.object)).toBe(false);
  });
});

describe("questBadges", () => {
  it("marks available quests' givers with ! while no quest is held", () => {
    expect([...questBadges(emptyQuestState(), CATALOG)]).toEqual(
      expect.arrayContaining([
        [ANCHORS.giver, "questOffer"],
        [ANCHORS.recipient, "questOffer"],
      ]),
    );
    const done: D97QuestState = { ...emptyQuestState(), completedQuestIds: [ERRAND_QUEST.id] };
    expect(questBadges(done, new Map([[ERRAND_QUEST.id, ERRAND_QUEST]])).size).toBe(0);
  });

  it("marks the held quest's step target, then its turn-in anchor, with ?", () => {
    const holding = accepted(DELIVERY_QUEST);
    expect([...questBadges(holding, CATALOG)]).toEqual([[ANCHORS.recipient, "questStep"]]);
    const errand = accepted(ERRAND_QUEST);
    expect([...questBadges(errand, CATALOG)]).toEqual([[ANCHORS.townsperson, "questStep"]]);
    const ready: D97QuestState = { ...errand, active: { questId: ERRAND_QUEST.id, completedStepIds: [STEPS.visit] } };
    expect([...questBadges(ready, CATALOG)]).toEqual([[ANCHORS.recipient, "questStep"]]);
    // A lost object's step marks no character; its object anchor shows instead.
    expect(questBadges(accepted(LOST_OBJECT_QUEST), CATALOG).size).toBe(0);
  });
});
