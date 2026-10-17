// The D97 quest and dialogue-effect cases (README § S33, decision P17). Each
// is a pure `(d97, payload, ctx)` function returning the next slice with its
// log records, or null to bounce. Quest definitions come from the registered
// content provider; log records carry UUIDs only. A defeat step reads the
// encounters' beaten state; `advanceDefeatQuest` is the hook D97_END_BATTLE
// calls on a win.

import type { D97QuestDefinition, D97ServiceKind } from "../../content/d97/dialogue/schema";
import { D97_QUESTS } from "../../content/d97/quests";
import { acquireCopy } from "../../d97/collection/collection";
import { bagSize, recordAcquisition, sampleBagOffer, takeFromBag } from "../../d97/collection/reward-bag";
import {
  abandonQuest as abandonInState,
  acceptQuest as acceptInState,
  advanceQuest as advanceInState,
  completeQuest as completeInState,
  pickUpObject as pickUpInState,
  questEssence,
  recordDefeat,
} from "../../d97/quests/quests";
import type { EventContext, ReducerLogRecord } from "../../eventlog/types";
import { cardIdFromUnknown } from "../../types/card-identity";
import {
  d97FlagIdFromUnknown,
  d97ItemIdFromUnknown,
  d97QuestIdFromUnknown,
  d97QuestStepIdFromUnknown,
  dreamAnchorIdFromUnknown,
  type DreamAnchorId,
} from "../../types/identifiers";
import { d97ContentProvider } from "./d97-content";
import { bagDrawLogRecord, type D97Transition } from "./d97-run";
import { d97BeatenAnchorIds, d97RunAct, type D97Run, type D97State } from "./d97-state";

function withRun(d97: D97State, run: D97Run, logRecords: readonly ReducerLogRecord[]): D97Transition {
  return { d97: { ...d97, run }, logRecords };
}

/** The started run and the payload's registered quest, or null. */
function runAndQuest(
  d97: D97State,
  payload: Record<string, unknown>,
): { readonly run: D97Run; readonly quest: D97QuestDefinition } | null {
  const run = d97.run;
  const questId = d97QuestIdFromUnknown(payload.questId);
  const quest = questId === null ? undefined : d97ContentProvider()?.quests.get(questId);
  return run === null || quest === undefined ? null : { run, quest };
}

/** `D97_ACCEPT_QUEST { questId, anchorId }`: take a quest from its giver. */
export function acceptQuest(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  const found = runAndQuest(d97, payload);
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  if (found === null || anchorId === null) return null;
  const { run, quest } = found;
  const accepted = acceptInState(run.quests, quest, anchorId, d97BeatenAnchorIds(run));
  if (accepted === null) return null;
  return withRun(d97, { ...run, quests: accepted.state }, [
    {
      event: "d97_quest_accepted",
      fields: {
        runId: run.runId,
        questId: quest.id,
        kind: quest.kind,
        giverAnchorId: anchorId,
        carriedItemIds: quest.carriedItemIds,
        autoCompletedStepIds: accepted.autoCompletedStepIds,
      },
    },
  ]);
}

function stepRecord(run: D97Run, quest: D97QuestDefinition, step: D97QuestDefinition["steps"][number]): ReducerLogRecord {
  return {
    event: "d97_quest_step_completed",
    fields: {
      runId: run.runId,
      questId: quest.id,
      stepId: step.id,
      kind: step.kind,
      anchorId: step.anchorId,
      ...(step.kind === "findObject" || step.kind === "deliver" ? { itemId: step.itemId } : {}),
    },
  };
}

/** `D97_ADVANCE_QUEST { questId, stepId, anchorId }`: a visit or a delivery. */
export function advanceQuest(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  const found = runAndQuest(d97, payload);
  const stepId = d97QuestStepIdFromUnknown(payload.stepId);
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  if (found === null || stepId === null || anchorId === null) return null;
  const { run, quest } = found;
  const quests = advanceInState(run.quests, quest, stepId, anchorId);
  const step = quest.steps.find((candidate) => candidate.id === stepId);
  if (quests === null || step === undefined) return null;
  return withRun(d97, { ...run, quests }, [stepRecord(run, quest, step)]);
}

/** `D97_PICK_UP_OBJECT { anchorId }`: pick up the held quest's lost object. */
export function pickUpObject(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  const run = d97.run;
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  const content = d97ContentProvider();
  if (run === null || anchorId === null || content === null) return null;
  const picked = pickUpInState(run.quests, content.quests, anchorId);
  const quest = run.quests.active === null ? undefined : content.quests.get(run.quests.active.questId);
  if (picked === null || quest === undefined) return null;
  return withRun(d97, { ...run, quests: picked.state }, [stepRecord(run, quest, picked.step)]);
}

/**
 * `D97_COMPLETE_QUEST { questId, anchorId }`: turn a ready quest in. An
 * Essence reward pays at once; a card-choice reward samples its offer from
 * the reward bag without removing any copy and waits for the pick.
 */
export function completeQuest(
  d97: D97State,
  payload: Record<string, unknown>,
  ctx: EventContext,
): D97Transition | null {
  const found = runAndQuest(d97, payload);
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  if (found === null || anchorId === null) return null;
  const { run, quest } = found;
  if (quest.reward.kind === "cardChoice" && run.quests.pendingReward !== null) return null;
  const quests = completeInState(run.quests, quest, anchorId);
  if (quests === null) return null;
  const completed: ReducerLogRecord = {
    event: "d97_quest_completed",
    fields: { runId: run.runId, questId: quest.id, anchorId, rewardKind: quest.reward.kind },
  };
  if (quest.reward.kind === "essence") {
    const amount = questEssence(D97_QUESTS.essenceReward[quest.kind], d97RunAct(run));
    const essence = run.essence + amount;
    return withRun(d97, { ...run, essence, quests }, [
      completed,
      { event: "d97_quest_reward_paid", fields: { runId: run.runId, questId: quest.id, amount, essence } },
    ]);
  }
  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const cardIds = sampleBagOffer(run.bag, D97_QUESTS.cardChoiceSize, random);
  const offered: ReducerLogRecord = {
    event: "d97_quest_reward_offered",
    fields: { runId: run.runId, questId: quest.id, cardIds, bagSize: bagSize(run.bag) },
  };
  const pendingReward = cardIds.length === 0 ? null : { questId: quest.id, cardIds };
  return withRun(d97, { ...run, quests: { ...quests, pendingReward } }, [completed, offered]);
}

/**
 * `D97_CHOOSE_QUEST_REWARD { questId, cardId }`: take one offered card. It
 * enters the reserve and removes one copy from the bag, if the bag still
 * holds one.
 */
export function chooseQuestReward(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  const run = d97.run;
  const questId = d97QuestIdFromUnknown(payload.questId);
  const cardId = cardIdFromUnknown(payload.cardId);
  const pending = run?.quests.pendingReward ?? null;
  if (run === null || pending === null || cardId === null || pending.questId !== questId) return null;
  if (!pending.cardIds.includes(cardId)) return null;
  const draw = takeFromBag(run.bag, cardId);
  const bag = draw === null ? recordAcquisition(run.bag, cardId) : draw.bag;
  const acquired = acquireCopy(run.collection, {
    runSeed: run.runSeed,
    cardId,
    provenance: { channel: "bag", battleCount: run.battlesFought },
    zone: "reserve",
  });
  return withRun(
    d97,
    { ...run, bag, collection: acquired.collection, quests: { ...run.quests, pendingReward: null } },
    [
      ...(draw === null ? [] : [bagDrawLogRecord(run.runId, draw)]),
      {
        event: "d97_quest_reward_chosen",
        fields: {
          runId: run.runId,
          questId: pending.questId,
          cardId,
          copyId: acquired.copy.copyId,
          offeredCardIds: pending.cardIds,
          collectionSize: acquired.collection.copies.length,
        },
      },
    ],
  );
}

/** `D97_ABANDON_QUEST { questId }`: drop the held quest for free. */
export function abandonQuest(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  const found = runAndQuest(d97, payload);
  if (found === null) return null;
  const { run, quest } = found;
  const quests = abandonInState(run.quests, quest);
  if (quests === null) return null;
  return withRun(d97, { ...run, quests }, [
    {
      event: "d97_quest_abandoned",
      fields: {
        runId: run.runId,
        questId: quest.id,
        completedStepIds: run.quests.active?.completedStepIds ?? [],
        returnedItemIds: run.quests.items.filter((item) => !quests.items.includes(item)),
      },
    },
  ]);
}

function itemCase(
  d97: D97State,
  payload: Record<string, unknown>,
  give: boolean,
): D97Transition | null {
  const run = d97.run;
  const itemId = d97ItemIdFromUnknown(payload.itemId);
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  if (run === null || itemId === null || anchorId === null) return null;
  if (d97ContentProvider()?.itemIds.has(itemId) !== true) return null;
  const held = run.quests.items.includes(itemId);
  if (held === give) return null;
  const items = give ? [...run.quests.items, itemId] : run.quests.items.filter((item) => item !== itemId);
  return withRun(d97, { ...run, quests: { ...run.quests, items } }, [
    { event: give ? "d97_item_given" : "d97_item_taken", fields: { runId: run.runId, itemId, anchorId } },
  ]);
}

/** `D97_GIVE_ITEM { itemId, anchorId }`: a character hands the player an item. */
export function giveItem(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  return itemCase(d97, payload, true);
}

/** `D97_TAKE_ITEM { itemId, anchorId }`: a character takes a carried item. */
export function takeItem(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  return itemCase(d97, payload, false);
}

/** `D97_SET_FLAG { flagId, value, anchorId }`: set or clear a story flag. */
export function setFlag(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  const run = d97.run;
  const flagId = d97FlagIdFromUnknown(payload.flagId);
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  if (run === null || flagId === null || anchorId === null || typeof payload.value !== "boolean") return null;
  const value = payload.value;
  if (run.flags.includes(flagId) === value) return null;
  const flags = value ? [...run.flags, flagId] : run.flags.filter((flag) => flag !== flagId);
  return withRun(d97, { ...run, flags }, [
    { event: "d97_flag_set", fields: { runId: run.runId, flagId, value, anchorId } },
  ]);
}

const SERVICES: ReadonlySet<string> = new Set<D97ServiceKind>(["dreamGuide", "sage", "amuletMerchant", "amuletChanger"]);

/**
 * `D97_OPEN_SERVICE`: a conversation hands the player to the speaker's
 * service. The hand-off is logged; the surface it opens owns its own state.
 * (`D97_OPEN_SHOP` is the shop's own case, in ./d97-shop.ts.)
 */
export function handOff(d97: D97State, payload: Record<string, unknown>): D97Transition | null {
  const run = d97.run;
  const anchorId = dreamAnchorIdFromUnknown(payload.anchorId);
  const service = payload.service;
  if (run === null || anchorId === null || typeof service !== "string" || !SERVICES.has(service)) return null;
  return withRun(d97, run, [
    { event: "d97_dialogue_hand_off", fields: { runId: run.runId, anchorId, surface: "service", service } },
  ]);
}

/**
 * The battle hook: the player beat the challenger or guardian at `anchorId`
 * (D97_END_BATTLE marks its encounter beaten). Does the held quest's current
 * defeat step on it, if any; null when no step advances.
 */
export function advanceDefeatQuest(
  run: D97Run,
  anchorId: DreamAnchorId,
): { readonly run: D97Run; readonly logRecords: readonly ReducerLogRecord[] } | null {
  const active = run.quests.active;
  const quest = active === null ? undefined : d97ContentProvider()?.quests.get(active.questId);
  const advanced = quest === undefined ? null : recordDefeat(run.quests, quest, anchorId);
  if (quest === undefined || advanced === null) return null;
  return { run: { ...run, quests: advanced.state }, logRecords: [stepRecord(run, quest, advanced.step)] };
}
