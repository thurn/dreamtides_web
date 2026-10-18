// The D97 quest contract (README § S33): each quest kind runs from offer to
// completion and reward through the reducer (a defeat step advances when
// D97_END_BATTLE settles a won battle against its target); the player holds one quest at a
// time and abandons for free; a card-choice reward samples the bag without
// removal, never shows a card more than w(c) times, and acquisition on the
// pick removes one copy; items, flags and shop and service hand-offs apply and
// log with UUIDs, and each dialogue-effect intent applies only when the
// resident at its anchor speaks a dialogue carrying that exact effect.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D97_QUESTS } from "../../content/d97/quests";
import { activeRewardBag, bagWeight } from "../../d97/collection/reward-bag";
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
import type { D97DialogueEffect, D97DialogueModule, D97SpeakerKind } from "../../content/d97/dialogue/schema";
import { questEssence } from "../../d97/quests/quests";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import {
  parseBattleId,
  parseD97DialogueId,
  parseD97DialogueNodeId,
  parseD97FlagId,
  parseD97ItemId,
  type DreamAnchorId,
} from "../../types/identifiers";
import { testAvatarId, testCardId } from "../../types/test-identities";
import type { D97BattleFoldState } from "../battle/fold";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "../reducer-fixtures";
import { d97ContentProvider, registerD97ContentProvider } from "./d97-content";
import { SYNTHETIC_BAG_TUNING, syntheticD97Content, syntheticFacetCardIds, syntheticPoolCardIds } from "./d97-content.fixtures";
import { speakingResident, syntheticDream, syntheticDreamAnchor } from "./d97-dreams.fixtures";
import { d97RunAct, type D97Run } from "./d97-state";
import { withD97Run } from "./d97-state.fixtures";

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const AVATAR = testAvatarId("d97-quest-avatar");
/** The run's dream's first challenger: the defeat quest's target, so a real encounter can be fought. */
const TARGET = syntheticDreamAnchor(1, 6);
const REGISTERED_QUESTS = QUESTS.map((quest) =>
  quest.id === DEFEAT_QUEST.id
    ? { ...quest, steps: quest.steps.map((step) => (step.kind === "defeat" ? { ...step, anchorId: TARGET } : step)) }
    : quest,
);
/** An item every dialogue offers to give but no content registers. */
const UNREGISTERED_ITEM = parseD97ItemId("00000008-0000-4000-8000-000000000001");
/** A flag no speaker's dialogue sets. */
const UNSPOKEN_FLAG = parseD97FlagId("00000008-0000-4000-8000-000000000002");

/** A one-node dialogue whose choices carry `effects`. */
function speaker(index: number, kind: D97SpeakerKind, effects: readonly D97DialogueEffect[]): D97DialogueModule {
  const suffix = index.toString(16).padStart(12, "0");
  const node = parseD97DialogueNodeId(`00000009-0000-4000-8000-${suffix}`);
  return {
    id: parseD97DialogueId(`0000000a-0000-4000-8000-${suffix}`),
    speaker: { name: "Speaker", kind },
    entries: [{ node }],
    nodes: [{ id: node, lines: ["Line."], choices: effects.map((effect) => ({ label: "Choice.", effect, next: null })) }],
  };
}

/** The dialogue each test anchor's resident speaks; the object anchors have none. */
const SPEAKER_DIALOGUES: readonly (readonly [DreamAnchorId, D97DialogueModule])[] = [
  [
    ANCHORS.giver,
    speaker(1, "friendly", [
      { kind: "giveItem", itemId: ITEMS.relic },
      { kind: "takeItem", itemId: ITEMS.relic },
      { kind: "giveItem", itemId: UNREGISTERED_ITEM },
      { kind: "setFlag", flagId: FLAG, value: true },
      { kind: "setFlag", flagId: FLAG, value: false },
      { kind: "openService", service: "sage" },
    ]),
  ],
  [ANCHORS.recipient, speaker(2, "friendly", [{ kind: "advanceQuest", questId: DELIVERY_QUEST.id, stepId: STEPS.deliver }])],
  [ANCHORS.townsperson, speaker(3, "townsfolk", [{ kind: "advanceQuest", questId: ERRAND_QUEST.id, stepId: STEPS.visit }])],
  [ANCHORS.shop, speaker(4, "shop", [{ kind: "takeItem", itemId: ITEMS.parcel }])],
];
/** The run's dream: a synthetic dream with each speaker standing at its anchor. */
const DREAM = syntheticDream(
  1,
  SPEAKER_DIALOGUES.map(([anchorId, module]) =>
    speakingResident(anchorId, module.id, module.speaker.kind === "shop" ? "shop" : module.speaker.kind === "townsfolk" ? "townsfolk" : "friendly"),
  ),
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
  return withD97Run(state, change(runOf(state)));
}

function started(): FoldState {
  return applied(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR });
}

function logged(state: FoldState, type: Parameters<typeof event>[0], payload: Record<string, unknown>) {
  const result = apply(state, type, payload);
  expect(result.outcome, type).toBe("applied");
  return { state: result.state, records: result.logRecords ?? [] };
}

const essenceFor = (kind: keyof typeof D97_QUESTS.essenceReward, run: D97Run) =>
  questEssence(D97_QUESTS.essenceReward[kind], d97RunAct(run));

beforeEach(() => {
  seq = 1;
  registerD97ContentProvider(
    syntheticD97Content({
      avatarIds: [AVATAR],
      quests: REGISTERED_QUESTS,
      itemIds: [ITEMS.relic, ITEMS.parcel],
      dreams: [DREAM, syntheticDream(2)],
      dialogues: SPEAKER_DIALOGUES.map(([, module]) => module),
    }),
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
    expect(runOf(done.state).essence).toBe(essence + essenceFor("defeat", runOf(state)));
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
    expect(runOf(turnedIn.state).bags).toEqual(before.bags);
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
    const content = d97ContentProvider()!;
    expect(bagWeight(activeRewardBag(content, run), chosen)).toBe(bagWeight(activeRewardBag(content, before), chosen) - 1);
    expect(picked.records.map((record) => record.event)).toEqual(["d97_bag_draw", "d97_quest_reward_chosen"]);
    bounces(picked.state, "D97_CHOOSE_QUEST_REWARD", { questId: LOST_OBJECT_QUEST.id, cardId: chosen });
  });

  it("never offers a card more times than the bag holds it", () => {
    // Exhaust the bag but for one copy of `one` and two of `two`.
    const stage = SYNTHETIC_BAG_TUNING.stages[0];
    const [one, two, ...rest] = syntheticPoolCardIds(40);
    if (one === undefined || two === undefined) throw new Error("no pool");
    const drawn = Object.fromEntries([
      [one, stage.ring1Capacity - 1],
      ...rest.map((cardId) => [cardId, stage.ring1Capacity] as const),
      ...syntheticFacetCardIds(20).map((cardId) => [cardId, stage.ring2Capacity] as const),
    ]);
    if (stage.ring1Capacity !== 2) throw new Error("the synthetic stage opens ring 1 at two copies");
    let state = withRun(started(), (run) => ({ ...run, bags: { ...run.bags, drawn: { [AVATAR]: drawn } } }));
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
    expect(runOf(state).essence).toBe(essence + essenceFor("errand", runOf(state)));
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
    expect(runOf(state).essence).toBe(essence + essenceFor("delivery", runOf(state)));
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

describe("dialogue-effect intents and the speaker's dialogue", () => {
  it("apply only on the speaker's map: a dream-map speaker's effects bounce while the player is inside a room", () => {
    const room = DREAM.rooms[0];
    const inside = applied(started(), "D97_ENTER_ROOM", { anchorId: room.buildingDoorAnchorId });
    bounces(inside, "D97_SET_FLAG", { flagId: FLAG, value: true, anchorId: ANCHORS.giver });
    const outside = applied(inside, "D97_LEAVE_ROOM", { anchorId: room.doorAnchorId });
    expect(runOf(applied(outside, "D97_SET_FLAG", { flagId: FLAG, value: true, anchorId: ANCHORS.giver })).flags).toEqual([FLAG]);
  });

  it("gives and takes only the items the speaker's dialogue hands over", () => {
    const state = started();
    bounces(state, "D97_GIVE_ITEM", { itemId: ITEMS.relic, anchorId: ANCHORS.recipient });
    bounces(state, "D97_GIVE_ITEM", { itemId: ITEMS.relic, anchorId: ANCHORS.object });
    bounces(state, "D97_GIVE_ITEM", { itemId: ITEMS.parcel, anchorId: ANCHORS.giver });
    bounces(state, "D97_GIVE_ITEM", { itemId: UNREGISTERED_ITEM, anchorId: ANCHORS.giver });
    const given = applied(state, "D97_GIVE_ITEM", { itemId: ITEMS.relic, anchorId: ANCHORS.giver });
    bounces(given, "D97_TAKE_ITEM", { itemId: ITEMS.relic, anchorId: ANCHORS.shop });
    expect(runOf(applied(given, "D97_TAKE_ITEM", { itemId: ITEMS.relic, anchorId: ANCHORS.giver })).quests.items).toEqual([]);
  });

  it("sets only the flags and values the speaker's dialogue sets", () => {
    const state = started();
    bounces(state, "D97_SET_FLAG", { flagId: FLAG, value: true, anchorId: ANCHORS.townsperson });
    bounces(state, "D97_SET_FLAG", { flagId: UNSPOKEN_FLAG, value: true, anchorId: ANCHORS.giver });
    expect(runOf(applied(state, "D97_SET_FLAG", { flagId: FLAG, value: true, anchorId: ANCHORS.giver })).flags).toEqual([FLAG]);
  });

  it("advances a step only at a speaker whose dialogue advances it", () => {
    const state = applied(started(), "D97_ACCEPT_QUEST", { questId: DELIVERY_QUEST.id, anchorId: ANCHORS.giver });
    bounces(state, "D97_ADVANCE_QUEST", { questId: DELIVERY_QUEST.id, stepId: STEPS.deliver, anchorId: ANCHORS.townsperson });
    bounces(state, "D97_ADVANCE_QUEST", { questId: DELIVERY_QUEST.id, stepId: STEPS.visit, anchorId: ANCHORS.recipient });
    applied(state, "D97_ADVANCE_QUEST", { questId: DELIVERY_QUEST.id, stepId: STEPS.deliver, anchorId: ANCHORS.recipient });
  });

  it("hands off only to a service the speaker's dialogue opens", () => {
    const state = started();
    bounces(state, "D97_OPEN_SERVICE", { anchorId: ANCHORS.giver, service: "dreamGuide" });
    bounces(state, "D97_OPEN_SERVICE", { anchorId: ANCHORS.recipient, service: "sage" });
    applied(state, "D97_OPEN_SERVICE", { anchorId: ANCHORS.giver, service: "sage" });
  });

  it("bounces every effect intent when no dialogue is registered", () => {
    registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR], itemIds: [ITEMS.relic] }));
    const state = started();
    bounces(state, "D97_GIVE_ITEM", { itemId: ITEMS.relic, anchorId: ANCHORS.giver });
    bounces(state, "D97_SET_FLAG", { flagId: FLAG, value: true, anchorId: ANCHORS.giver });
    bounces(state, "D97_OPEN_SERVICE", { anchorId: ANCHORS.giver, service: "sage" });
  });
});
