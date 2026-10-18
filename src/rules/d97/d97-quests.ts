// The D97 quest and dialogue-effect cases (README § S33, decision P17),
// declared in ./events/quests.ts. Each is a pure `(input, payload, ctx)` function returning the next slice with its
// log records, or null to bounce. Quest definitions come from the registered
// content provider; log records carry UUIDs only. A defeat step reads the
// encounters' beaten state; `advanceDefeatQuest` is the hook D97_END_BATTLE
// calls on a win.
//
// The dialogue-effect cases (advance a quest, give or take an item, set a
// flag, hand off to a service) bounce unless the resident standing at the
// payload's anchor in the run's own dream speaks a registered dialogue with a
// choice carrying that exact effect (`speakerOffers`). They do not evaluate
// the choice's condition:
// which node is showing is view state (P17), so a fold cannot tell whether
// the choice is reachable, and each case already guards the state it changes.

import type { D97DialogueEffect, D97QuestDefinition, D97ServiceKind } from "../../content/d97/dialogue/schema";
import { D97_QUESTS } from "../../content/d97/quests";
import { acquireForRun } from "../../d97/collection/acquisition";
import { activeRewardBag, bagSize, sampleBagOffer } from "../../d97/collection/reward-bag";
import { dialogueCarriesEffect } from "../../d97/dialogue/effects";
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
import type { CardId } from "../../types/card-identity";
import type {
  D97FlagId,
  D97ItemId,
  D97QuestId,
  D97QuestStepId,
  DreamAnchorId,
} from "../../types/identifiers";
import { d97ContentProvider } from "./d97-content";
import { runSpeakerDialogue } from "./d97-acts";
import type { D97Transition } from "./d97-run";
import { d97BeatenAnchorIds, d97RunAct, type D97OverworldState, type D97Run } from "./d97-state";
import type { D97RunInput } from "./events/spec";

/**
 * Whether the resident at `anchorId` in the run's own dream speaks a
 * registered dialogue carrying `effect`.
 */
function speakerOffers(run: D97Run, anchorId: DreamAnchorId, effect: D97DialogueEffect): boolean {
  const content = d97ContentProvider();
  const module = content === null ? null : runSpeakerDialogue(run, content, anchorId);
  return module !== null && dialogueCarriesEffect(module, effect);
}

function withRun(d97: D97OverworldState, run: D97Run, logRecords: readonly ReducerLogRecord[]): D97Transition {
  return { d97: { ...d97, run }, logRecords };
}

/** The registered quest `questId` names, or null. */
function registeredQuest(questId: D97QuestId): D97QuestDefinition | null {
  return d97ContentProvider()?.quests.get(questId) ?? null;
}

/** `D97_ACCEPT_QUEST { questId, anchorId }`: take a quest from its giver. */
export function acceptQuest(
  { d97, run }: D97RunInput,
  { questId, anchorId }: { readonly questId: D97QuestId; readonly anchorId: DreamAnchorId },
): D97Transition | null {
  const quest = registeredQuest(questId);
  if (quest === null) return null;
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
export function advanceQuest(
  { d97, run }: D97RunInput,
  { questId, stepId, anchorId }: { readonly questId: D97QuestId; readonly stepId: D97QuestStepId; readonly anchorId: DreamAnchorId },
): D97Transition | null {
  const quest = registeredQuest(questId);
  if (quest === null) return null;
  if (!speakerOffers(run, anchorId, { kind: "advanceQuest", questId: quest.id, stepId })) return null;
  const quests = advanceInState(run.quests, quest, stepId, anchorId);
  const step = quest.steps.find((candidate) => candidate.id === stepId);
  if (quests === null || step === undefined) return null;
  return withRun(d97, { ...run, quests }, [stepRecord(run, quest, step)]);
}

/** `D97_PICK_UP_OBJECT { anchorId }`: pick up the held quest's lost object. */
export function pickUpObject({ d97, run }: D97RunInput, { anchorId }: { readonly anchorId: DreamAnchorId }): D97Transition | null {
  const content = d97ContentProvider();
  if (content === null) return null;
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
  { d97, run }: D97RunInput,
  { questId, anchorId }: { readonly questId: D97QuestId; readonly anchorId: DreamAnchorId },
  ctx: EventContext,
): D97Transition | null {
  const quest = registeredQuest(questId);
  if (quest === null) return null;
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
  const content = d97ContentProvider();
  if (content === null) return null;
  const bag = activeRewardBag(content, run);
  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const cardIds = sampleBagOffer(bag, D97_QUESTS.cardChoiceSize, random);
  const offered: ReducerLogRecord = {
    event: "d97_quest_reward_offered",
    fields: { runId: run.runId, questId: quest.id, avatarId: run.avatarId, cardIds, bagSize: bagSize(bag) },
  };
  const pendingReward = cardIds.length === 0 ? null : { questId: quest.id, cardIds };
  return withRun(d97, { ...run, quests: { ...quests, pendingReward } }, [completed, offered]);
}

/**
 * `D97_CHOOSE_QUEST_REWARD { questId, cardId }`: take one offered card. It
 * enters the reserve and removes one copy from the bag, if the bag still
 * holds one.
 */
export function chooseQuestReward(
  { d97, run }: D97RunInput,
  { questId, cardId }: { readonly questId: D97QuestId; readonly cardId: CardId },
): D97Transition | null {
  const pending = run.quests.pendingReward;
  if (pending === null || pending.questId !== questId) return null;
  if (!pending.cardIds.includes(cardId)) return null;
  const content = d97ContentProvider();
  if (content === null) return null;
  const acquired = acquireForRun(run, { cardId, channel: "bag", zone: "reserve", source: "offer" }, content);
  return withRun(
    d97,
    { ...acquired.run, quests: { ...run.quests, pendingReward: null } },
    [
      ...acquired.logRecords,
      {
        event: "d97_quest_reward_chosen",
        fields: {
          runId: run.runId,
          questId: pending.questId,
          cardId,
          copyId: acquired.copy.copyId,
          offeredCardIds: pending.cardIds,
          collectionSize: acquired.run.collection.copies.length,
        },
      },
    ],
  );
}

/** `D97_ABANDON_QUEST { questId }`: drop the held quest for free. */
export function abandonQuest({ d97, run }: D97RunInput, { questId }: { readonly questId: D97QuestId }): D97Transition | null {
  const quest = registeredQuest(questId);
  if (quest === null) return null;
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

/** An item case's payload: the item and the anchor of the character exchanging it. */
type ItemPayload = { readonly itemId: D97ItemId; readonly anchorId: DreamAnchorId };

function itemCase({ d97, run }: D97RunInput, { itemId, anchorId }: ItemPayload, give: boolean): D97Transition | null {
  if (d97ContentProvider()?.itemIds.has(itemId) !== true) return null;
  if (!speakerOffers(run, anchorId, { kind: give ? "giveItem" : "takeItem", itemId })) return null;
  const held = run.quests.items.includes(itemId);
  if (held === give) return null;
  const items = give ? [...run.quests.items, itemId] : run.quests.items.filter((item) => item !== itemId);
  return withRun(d97, { ...run, quests: { ...run.quests, items } }, [
    { event: give ? "d97_item_given" : "d97_item_taken", fields: { runId: run.runId, itemId, anchorId } },
  ]);
}

/** `D97_GIVE_ITEM { itemId, anchorId }`: a character hands the player an item. */
export function giveItem(input: D97RunInput, payload: ItemPayload): D97Transition | null {
  return itemCase(input, payload, true);
}

/** `D97_TAKE_ITEM { itemId, anchorId }`: a character takes a carried item. */
export function takeItem(input: D97RunInput, payload: ItemPayload): D97Transition | null {
  return itemCase(input, payload, false);
}

/** `D97_SET_FLAG { flagId, value, anchorId }`: set or clear a story flag. */
export function setFlag(
  { d97, run }: D97RunInput,
  { flagId, value, anchorId }: { readonly flagId: D97FlagId; readonly value: boolean; readonly anchorId: DreamAnchorId },
): D97Transition | null {
  if (!speakerOffers(run, anchorId, { kind: "setFlag", flagId, value })) return null;
  if (run.flags.includes(flagId) === value) return null;
  const flags = value ? [...run.flags, flagId] : run.flags.filter((flag) => flag !== flagId);
  return withRun(d97, { ...run, flags }, [
    { event: "d97_flag_set", fields: { runId: run.runId, flagId, value, anchorId } },
  ]);
}

/**
 * `D97_OPEN_SERVICE`: a conversation hands the player to the speaker's
 * service. The hand-off is logged; the surface it opens owns its own state.
 * (`D97_OPEN_SHOP` is the shop's own case, in ./d97-shop.ts.)
 */
export function handOff(
  { d97, run }: D97RunInput,
  { anchorId, service }: { readonly anchorId: DreamAnchorId; readonly service: D97ServiceKind },
): D97Transition | null {
  if (!speakerOffers(run, anchorId, { kind: "openService", service })) return null;
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
