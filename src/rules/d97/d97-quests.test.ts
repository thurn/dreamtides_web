// The D97 quest contract (README § S33): each quest kind runs from offer to
// completion and reward through the reducer (a defeat step advances when
// D97_END_BATTLE settles a won battle against its target); the player holds one quest at a
// time and abandons for free; a card-choice reward samples the bag without
// removal, never shows a card more than w(c) times, and acquisition on the
// pick removes one copy; items, flags and shop and service hand-offs apply and
// log with UUIDs.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D97_CHALLENGERS } from "../../content/d97/challengers";
import { D97_QUESTS } from "../../content/d97/quests";
import { createRewardBag, bagWeight } from "../../d97/collection/reward-bag";
import {
  ANCHORS,
  DEFEAT_QUEST,
  DELIVERY_QUEST,
  ERRAND_QUEST,
  FLAG,
  ITEMS,
  LOST_OBJECT_QUEST,
  QUESTS,
  STEPS,
} from "../../d97/dialogue/dialogue.fixtures";
import { questEssence } from "../../d97/quests/quests";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { parseBattleId, type DreamAnchorId } from "../../types/identifiers";
import { testAvatarId, testCardId } from "../../types/test-identities";
import type { D97BattleFoldState } from "../battle/fold";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "../reducer-fixtures";
import { registerD97ContentProvider } from "./d97-content";
import { syntheticD97Content } from "./d97-content.fixtures";
import { D97_CURRENT_ACT, type D97Run } from "./d97-state";

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const AVATAR = testAvatarId("d97-quest-avatar");
/** A catalog challenger: the defeat quest's target, so a real encounter can be fought. */
const TARGET = (D97_CHALLENGERS.find((entry) => entry.role === "challenger") ?? D97_CHALLENGERS[0]).anchorId;
const REGISTERED_QUESTS = QUESTS.map((quest) =>
  quest.id === DEFEAT_QUEST.id
    ? { ...quest, steps: quest.steps.map((step) => (step.kind === "defeat" ? { ...step, anchorId: TARGET } : step)) }
    : quest,
);
let seq = 1;

function apply(state: FoldState, type: Parameters<typeof event>[0], payload: Record<string, unknown>) {
  seq += 1;
  return reduceGameEvent(state, event(type, payload), ctx({ seq, rng: eventRng(D97_GENESIS.seed, seq) }));
}

function applied(state: FoldState, type: Parameters<typeof event>[0], payload: Record<string, unknown>): FoldState {
  const result = apply(state, type, payload);
  expect(result.outcome, type).toBe("applied");
  return result.state;
}

function bounces(state: FoldState, type: Parameters<typeof event>[0], payload: Record<string, unknown>): void {
  expect(apply(state, type, payload).outcome, type).not.toBe("applied");
}

function runOf(state: FoldState): D97Run {
  const run = state.d97?.run;
  if (run === undefined || run === null) throw new Error("no D97 run");
  return run;
}

function withRun(state: FoldState, change: (run: D97Run) => D97Run): FoldState {
  const d97 = state.d97;
  if (d97 === undefined) throw new Error("no D97 slice");
  return { ...state, d97: { ...d97, run: change(runOf(state)) } };
}

function started(): FoldState {
  return applied(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR });
}

function logged(state: FoldState, type: Parameters<typeof event>[0], payload: Record<string, unknown>) {
  const result = apply(state, type, payload);
  expect(result.outcome, type).toBe("applied");
  return { state: result.state, records: result.logRecords ?? [] };
}

const essenceFor = (kind: keyof typeof D97_QUESTS.essenceReward) =>
  questEssence(D97_QUESTS.essenceReward[kind], D97_CURRENT_ACT);

beforeEach(() => {
  seq = 1;
  registerD97ContentProvider(
    syntheticD97Content({ avatarIds: [AVATAR], quests: REGISTERED_QUESTS, itemIds: [ITEMS.relic, ITEMS.parcel] }),
  );
});

afterEach(() => {
  registerD97ContentProvider(null);
});

/** A finished D97 battle against the previewed encounter at `anchorId`. */
function finished(state: FoldState, anchorId: DreamAnchorId, winner: "player" | "enemy"): FoldState {
  const encounter = runOf(state).encounters[anchorId];
  if (encounter === undefined) throw new Error("no encounter");
  const battle = {
    mode: { kind: "d97" },
    init: {
      battleId: parseBattleId("d97:quest-test"),
      opponentAbilityActive: false,
      enemyDescriptor: {},
      avatarSummary: null,
      cardDefinitions: [],
      anchorId,
      characterId: encounter.characterId,
      role: encounter.role,
      tier: encounter.tier,
      playerAnteCopyId: encounter.playerAnteCopyId,
      opponentAnteCardId: encounter.opponentAnteCardId,
    },
    engine: { init: {}, slice: { committed: { result: { kind: "victory", winner, reason: "score" } } } },
  } as unknown as D97BattleFoldState;
  return { ...state, battle };
}

/** Preview the defeat target, then win (or lose) the battle against it. */
function fight(state: FoldState, winner: "player" | "enemy") {
  const previewed = applied(state, "D97_PREVIEW_ENCOUNTER", { anchorId: TARGET });
  return logged(finished(previewed, TARGET, winner), "D97_END_BATTLE", {});
}

describe("defeat quests", () => {
  it("advance when D97_END_BATTLE settles a win against the target, and pay Essence at the giver", () => {
    let state = applied(started(), "D97_ACCEPT_QUEST", { questId: DEFEAT_QUEST.id, anchorId: ANCHORS.giver });
    bounces(state, "D97_COMPLETE_QUEST", { questId: DEFEAT_QUEST.id, anchorId: ANCHORS.giver });
    const lost = fight(state, "enemy");
    expect(runOf(lost.state).quests.active?.completedStepIds).toEqual([]);
    const won = fight(state, "player");
    expect(won.records.map((record) => record.event)).toContain("d97_quest_step_completed");
    expect(runOf(won.state).encounters[TARGET]?.beaten).toBe(true);
    expect(runOf(won.state).quests.active?.completedStepIds).toEqual([STEPS.defeat]);
    state = won.state;
    const essence = runOf(state).essence;
    bounces(state, "D97_COMPLETE_QUEST", { questId: DEFEAT_QUEST.id, anchorId: ANCHORS.recipient });
    const done = logged(state, "D97_COMPLETE_QUEST", { questId: DEFEAT_QUEST.id, anchorId: ANCHORS.giver });
    expect(runOf(done.state).essence).toBe(essence + essenceFor("defeat"));
    expect(runOf(done.state).quests).toMatchObject({ active: null, completedQuestIds: [DEFEAT_QUEST.id] });
    expect(done.records.map((record) => record.event)).toEqual(["d97_quest_completed", "d97_quest_reward_paid"]);
    bounces(done.state, "D97_ACCEPT_QUEST", { questId: DEFEAT_QUEST.id, anchorId: ANCHORS.giver });
  });

  it("complete the defeat step on acceptance when the target is already beaten", () => {
    const beaten = fight(started(), "player").state;
    const accepted = logged(beaten, "D97_ACCEPT_QUEST", { questId: DEFEAT_QUEST.id, anchorId: ANCHORS.giver });
    expect(accepted.records[0]?.fields.autoCompletedStepIds).toEqual([STEPS.defeat]);
    applied(accepted.state, "D97_COMPLETE_QUEST", { questId: DEFEAT_QUEST.id, anchorId: ANCHORS.giver });
  });
});

describe("lost-object quests", () => {
  it("pick up the object, then turn in for a card-choice reward taken from the bag", () => {
    let state = started();
    bounces(state, "D97_PICK_UP_OBJECT", { anchorId: ANCHORS.object });
    state = applied(state, "D97_ACCEPT_QUEST", { questId: LOST_OBJECT_QUEST.id, anchorId: ANCHORS.giver });
    bounces(state, "D97_PICK_UP_OBJECT", { anchorId: ANCHORS.otherObject });
    state = applied(state, "D97_PICK_UP_OBJECT", { anchorId: ANCHORS.object });
    expect(runOf(state).quests.items).toEqual([ITEMS.relic]);
    bounces(state, "D97_PICK_UP_OBJECT", { anchorId: ANCHORS.object });

    const before = runOf(state);
    const turnedIn = logged(state, "D97_COMPLETE_QUEST", { questId: LOST_OBJECT_QUEST.id, anchorId: ANCHORS.giver });
    const pending = runOf(turnedIn.state).quests.pendingReward;
    expect(pending?.questId).toBe(LOST_OBJECT_QUEST.id);
    expect(pending?.cardIds).toHaveLength(D97_QUESTS.cardChoiceSize);
    // The offer removes nothing; the relic goes back with the quest.
    expect(runOf(turnedIn.state).bag).toEqual(before.bag);
    expect(runOf(turnedIn.state).quests.items).toEqual([]);
    expect(turnedIn.records.map((record) => record.event)).toEqual(["d97_quest_completed", "d97_quest_reward_offered"]);

    const chosen = pending?.cardIds[0];
    if (chosen === undefined) throw new Error("no offer");
    bounces(turnedIn.state, "D97_CHOOSE_QUEST_REWARD", { questId: LOST_OBJECT_QUEST.id, cardId: testCardId("not-offered") });
    const picked = logged(turnedIn.state, "D97_CHOOSE_QUEST_REWARD", { questId: LOST_OBJECT_QUEST.id, cardId: chosen });
    const run = runOf(picked.state);
    expect(run.quests.pendingReward).toBeNull();
    expect(run.collection.copies).toHaveLength(before.collection.copies.length + 1);
    expect(run.collection.copies[run.collection.copies.length - 1]).toMatchObject({ cardId: chosen, zone: "reserve" });
    expect(bagWeight(run.bag, chosen)).toBe(bagWeight(before.bag, chosen) - 1);
    expect(picked.records.map((record) => record.event)).toEqual(["d97_bag_draw", "d97_quest_reward_chosen"]);
    bounces(picked.state, "D97_CHOOSE_QUEST_REWARD", { questId: LOST_OBJECT_QUEST.id, cardId: chosen });
  });

  it("never offers a card more times than the bag holds it", () => {
    const one = testCardId("d97-bag-one");
    const two = testCardId("d97-bag-two");
    let state = withRun(started(), (run) => ({
      ...run,
      bag: createRewardBag({
        avatarId: AVATAR,
        dealSeed: 0,
        joinedTideIds: [],
        dealt: [
          { cardId: one, copies: 1 },
          { cardId: two, copies: 2 },
        ],
      }),
    }));
    state = applied(state, "D97_ACCEPT_QUEST", { questId: LOST_OBJECT_QUEST.id, anchorId: ANCHORS.giver });
    state = applied(state, "D97_PICK_UP_OBJECT", { anchorId: ANCHORS.object });
    state = applied(state, "D97_COMPLETE_QUEST", { questId: LOST_OBJECT_QUEST.id, anchorId: ANCHORS.giver });
    const offer = [...(runOf(state).quests.pendingReward?.cardIds ?? [])].sort();
    expect(offer).toEqual([one, two, two].sort());
  });
});

describe("errand quests", () => {
  it("visit the named anchor, then turn in at the giver", () => {
    let state = applied(started(), "D97_ACCEPT_QUEST", { questId: ERRAND_QUEST.id, anchorId: ANCHORS.recipient });
    bounces(state, "D97_ADVANCE_QUEST", { questId: ERRAND_QUEST.id, stepId: STEPS.visit, anchorId: ANCHORS.giver });
    state = applied(state, "D97_ADVANCE_QUEST", { questId: ERRAND_QUEST.id, stepId: STEPS.visit, anchorId: ANCHORS.townsperson });
    bounces(state, "D97_ADVANCE_QUEST", { questId: ERRAND_QUEST.id, stepId: STEPS.visit, anchorId: ANCHORS.townsperson });
    const essence = runOf(state).essence;
    state = applied(state, "D97_COMPLETE_QUEST", { questId: ERRAND_QUEST.id, anchorId: ANCHORS.recipient });
    expect(runOf(state).essence).toBe(essence + essenceFor("errand"));
  });
});

describe("delivery quests", () => {
  it("carry the giver's item to the recipient, who pays", () => {
    let state = applied(started(), "D97_ACCEPT_QUEST", { questId: DELIVERY_QUEST.id, anchorId: ANCHORS.giver });
    expect(runOf(state).quests.items).toEqual([ITEMS.parcel]);
    const delivered = logged(state, "D97_ADVANCE_QUEST", {
      questId: DELIVERY_QUEST.id,
      stepId: STEPS.deliver,
      anchorId: ANCHORS.recipient,
    });
    expect(delivered.records[0]).toMatchObject({ event: "d97_quest_step_completed", fields: { itemId: ITEMS.parcel } });
    state = delivered.state;
    expect(runOf(state).quests.items).toEqual([]);
    bounces(state, "D97_COMPLETE_QUEST", { questId: DELIVERY_QUEST.id, anchorId: ANCHORS.giver });
    const essence = runOf(state).essence;
    state = applied(state, "D97_COMPLETE_QUEST", { questId: DELIVERY_QUEST.id, anchorId: ANCHORS.recipient });
    expect(runOf(state).essence).toBe(essence + essenceFor("delivery"));
  });

  it("is refused without the item", () => {
    let state = applied(started(), "D97_ACCEPT_QUEST", { questId: DELIVERY_QUEST.id, anchorId: ANCHORS.giver });
    state = applied(state, "D97_TAKE_ITEM", { itemId: ITEMS.parcel, anchorId: ANCHORS.shop });
    bounces(state, "D97_ADVANCE_QUEST", { questId: DELIVERY_QUEST.id, stepId: STEPS.deliver, anchorId: ANCHORS.recipient });
  });
});

describe("one quest at a time", () => {
  it("refuses a second quest while one is held, and abandoning is free", () => {
    let state = applied(started(), "D97_ACCEPT_QUEST", { questId: DELIVERY_QUEST.id, anchorId: ANCHORS.giver });
    bounces(state, "D97_ACCEPT_QUEST", { questId: ERRAND_QUEST.id, anchorId: ANCHORS.recipient });
    bounces(state, "D97_ABANDON_QUEST", { questId: ERRAND_QUEST.id });
    const before = runOf(state);
    const abandoned = logged(state, "D97_ABANDON_QUEST", { questId: DELIVERY_QUEST.id });
    expect(abandoned.records[0]?.fields).toMatchObject({ questId: DELIVERY_QUEST.id, returnedItemIds: [ITEMS.parcel] });
    const after = runOf(abandoned.state);
    expect(after.essence).toBe(before.essence);
    expect(after.collection).toEqual(before.collection);
    expect(after.quests).toMatchObject({ active: null, items: [], completedQuestIds: [] });
    state = applied(abandoned.state, "D97_ACCEPT_QUEST", { questId: ERRAND_QUEST.id, anchorId: ANCHORS.recipient });
    state = applied(state, "D97_ABANDON_QUEST", { questId: ERRAND_QUEST.id });
    applied(state, "D97_ACCEPT_QUEST", { questId: DELIVERY_QUEST.id, anchorId: ANCHORS.giver });
  });

  it("refuses an unknown quest and the wrong giver", () => {
    const state = started();
    bounces(state, "D97_ACCEPT_QUEST", { questId: DEFEAT_QUEST.id, anchorId: ANCHORS.recipient });
    bounces(state, "D97_ACCEPT_QUEST", { questId: "not-a-uuid", anchorId: ANCHORS.giver });
  });
});

describe("items, flags and hand-offs", () => {
  it("gives and takes registered items once", () => {
    let state = applied(started(), "D97_GIVE_ITEM", { itemId: ITEMS.relic, anchorId: ANCHORS.giver });
    bounces(state, "D97_GIVE_ITEM", { itemId: ITEMS.relic, anchorId: ANCHORS.giver });
    bounces(state, "D97_GIVE_ITEM", { itemId: testCardId("unregistered"), anchorId: ANCHORS.giver });
    state = applied(state, "D97_TAKE_ITEM", { itemId: ITEMS.relic, anchorId: ANCHORS.giver });
    bounces(state, "D97_TAKE_ITEM", { itemId: ITEMS.relic, anchorId: ANCHORS.giver });
  });

  it("sets and clears flags", () => {
    const set = logged(started(), "D97_SET_FLAG", { flagId: FLAG, value: true, anchorId: ANCHORS.giver });
    expect(runOf(set.state).flags).toEqual([FLAG]);
    expect(set.records[0]).toMatchObject({ event: "d97_flag_set", fields: { flagId: FLAG, value: true } });
    bounces(set.state, "D97_SET_FLAG", { flagId: FLAG, value: true, anchorId: ANCHORS.giver });
    const cleared = applied(set.state, "D97_SET_FLAG", { flagId: FLAG, value: false, anchorId: ANCHORS.giver });
    expect(runOf(cleared).flags).toEqual([]);
  });

  it("logs service hand-offs without changing the run", () => {
    const state = started();
    const result = logged(state, "D97_OPEN_SERVICE", { anchorId: ANCHORS.giver, service: "sage" });
    expect(runOf(result.state)).toEqual(runOf(state));
    expect(result.records[0]?.event).toBe("d97_dialogue_hand_off");
    bounces(state, "D97_OPEN_SERVICE", { anchorId: ANCHORS.giver, service: "tailor" });
  });
});
