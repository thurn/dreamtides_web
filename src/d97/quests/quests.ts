// Quest model v0 (README § S33, Appendix B §B15): pure functions over the
// stored quest state. The player holds one quest at a time; offering another
// while one is held is refused, and abandoning is free. A quest's steps are
// done in order, except that a lost object can be picked up whenever its quest
// is held. A quest whose steps are all done is ready, and turning it in at its
// turn-in anchor completes it. Every refusal returns null.

import type {
  D97QuestDefinition,
  D97QuestStatus,
  D97QuestStep,
  D97QuestStepStatus,
} from "../../content/d97/dialogue/schema";
import type { D97ActScaledEssence } from "../../content/d97/quests";
import type { D97ItemId, D97QuestId, D97QuestStepId, DreamAnchorId } from "../../types/identifiers";
import type { D97ActiveQuest, D97QuestState } from "./types";

/** The quests a fold can resolve, by UUID. */
export type D97QuestCatalog = ReadonlyMap<D97QuestId, D97QuestDefinition>;

/** A run's quest state before any quest. */
export function emptyQuestState(): D97QuestState {
  return { active: null, completedQuestIds: [], pendingReward: null, items: [] };
}

function activeFor(state: D97QuestState, questId: D97QuestId): D97ActiveQuest | null {
  return state.active?.questId === questId ? state.active : null;
}

/** The first step of the held `quest` not yet done, or null. */
export function currentStep(state: D97QuestState, quest: D97QuestDefinition): D97QuestStep | null {
  const active = activeFor(state, quest.id);
  if (active === null) return null;
  return quest.steps.find((step) => !active.completedStepIds.includes(step.id)) ?? null;
}

/** `quest`'s status for the player. */
export function questStatus(state: D97QuestState, quest: D97QuestDefinition): D97QuestStatus {
  if (state.completedQuestIds.includes(quest.id)) return "completed";
  if (activeFor(state, quest.id) === null) return "available";
  return currentStep(state, quest) === null ? "ready" : "active";
}

/** One step's status: done, the current step, or not reached. */
export function questStepStatus(
  state: D97QuestState,
  quest: D97QuestDefinition,
  stepId: D97QuestStepId,
): D97QuestStepStatus {
  if (state.completedQuestIds.includes(quest.id)) return "done";
  const active = activeFor(state, quest.id);
  if (active === null) return "pending";
  if (active.completedStepIds.includes(stepId)) return "done";
  return currentStep(state, quest)?.id === stepId ? "current" : "pending";
}

function withStepDone(state: D97QuestState, stepId: D97QuestStepId): D97QuestState {
  const active = state.active;
  if (active === null) return state;
  return { ...state, active: { ...active, completedStepIds: [...active.completedStepIds, stepId] } };
}

/** The items a quest owns: its carried items and its lost objects. */
export function questItemIds(quest: D97QuestDefinition): D97ItemId[] {
  const found = quest.steps.flatMap((step) => (step.kind === "findObject" ? [step.itemId] : []));
  return [...new Set([...quest.carriedItemIds, ...found])];
}

function withoutItems(items: readonly D97ItemId[], removing: readonly D97ItemId[]): D97ItemId[] {
  return items.filter((item) => !removing.includes(item));
}

export interface D97QuestAcceptance {
  readonly state: D97QuestState;
  /** Defeat steps done on acceptance: their targets were already beaten. */
  readonly autoCompletedStepIds: readonly D97QuestStepId[];
}

/**
 * Accept `quest` from its giver at `anchorId`: refused while any quest is
 * held, for a completed quest, or away from its giver. The giver hands over
 * the quest's carried items, and leading defeat steps whose targets are
 * already beaten are done at once.
 */
export function acceptQuest(
  state: D97QuestState,
  quest: D97QuestDefinition,
  anchorId: DreamAnchorId,
  beatenAnchorIds: readonly DreamAnchorId[],
): D97QuestAcceptance | null {
  if (state.active !== null || state.completedQuestIds.includes(quest.id)) return null;
  if (anchorId !== quest.giverAnchorId) return null;
  let next: D97QuestState = {
    ...state,
    active: { questId: quest.id, completedStepIds: [] },
    items: [...state.items, ...quest.carriedItemIds.filter((item) => !state.items.includes(item))],
  };
  const autoCompletedStepIds: D97QuestStepId[] = [];
  for (let step = currentStep(next, quest); step?.kind === "defeat"; step = currentStep(next, quest)) {
    if (!beatenAnchorIds.includes(step.anchorId)) break;
    next = withStepDone(next, step.id);
    autoCompletedStepIds.push(step.id);
  }
  return { state: next, autoCompletedStepIds };
}

/**
 * Do the held quest's current visit or deliver step `stepId` at its anchor.
 * A delivery hands its item over, and is refused without it.
 */
export function advanceQuest(
  state: D97QuestState,
  quest: D97QuestDefinition,
  stepId: D97QuestStepId,
  anchorId: DreamAnchorId,
): D97QuestState | null {
  const step = currentStep(state, quest);
  if (step?.id !== stepId || step.anchorId !== anchorId) return null;
  if (step.kind === "visit") return withStepDone(state, step.id);
  if (step.kind !== "deliver" || !state.items.includes(step.itemId)) return null;
  return { ...withStepDone(state, step.id), items: withoutItems(state.items, [step.itemId]) };
}

/** The held quest's lost-object step at `anchorId` that is not yet done. */
export function objectStepAt(
  state: D97QuestState,
  quests: D97QuestCatalog,
  anchorId: DreamAnchorId,
): Extract<D97QuestStep, { kind: "findObject" }> | null {
  const active = state.active;
  const quest = active === null ? undefined : quests.get(active.questId);
  if (active === null || quest === undefined) return null;
  for (const step of quest.steps) {
    if (step.kind === "findObject" && step.anchorId === anchorId && !active.completedStepIds.includes(step.id)) {
      return step;
    }
  }
  return null;
}

/** Pick up the lost object at `anchorId`: refused unless its quest is held. */
export function pickUpObject(
  state: D97QuestState,
  quests: D97QuestCatalog,
  anchorId: DreamAnchorId,
): { readonly state: D97QuestState; readonly step: D97QuestStep } | null {
  const step = objectStepAt(state, quests, anchorId);
  if (step === null) return null;
  const items = state.items.includes(step.itemId) ? state.items : [...state.items, step.itemId];
  return { state: { ...withStepDone(state, step.id), items }, step };
}

/**
 * The battle hook: the anchor at `anchorId` was beaten. Does the held quest's
 * current defeat step on it, if any; null when no step advances.
 */
export function recordDefeat(
  state: D97QuestState,
  quest: D97QuestDefinition,
  anchorId: DreamAnchorId,
): { readonly state: D97QuestState; readonly step: D97QuestStep } | null {
  const step = currentStep(state, quest);
  if (step?.kind !== "defeat" || step.anchorId !== anchorId) return null;
  return { state: withStepDone(state, step.id), step };
}

/**
 * Turn the ready `quest` in at its turn-in anchor: the quest completes and
 * hands back every item it owns.
 */
export function completeQuest(
  state: D97QuestState,
  quest: D97QuestDefinition,
  anchorId: DreamAnchorId,
): D97QuestState | null {
  if (questStatus(state, quest) !== "ready" || anchorId !== quest.turnInAnchorId) return null;
  return {
    ...state,
    active: null,
    completedQuestIds: [...state.completedQuestIds, quest.id],
    items: withoutItems(state.items, questItemIds(quest)),
  };
}

/**
 * Abandon the held quest for free. Its items go back, and it can be taken
 * again from the start.
 */
export function abandonQuest(state: D97QuestState, quest: D97QuestDefinition): D97QuestState | null {
  if (activeFor(state, quest.id) === null) return null;
  return { ...state, active: null, items: withoutItems(state.items, questItemIds(quest)) };
}

/** The Essence an Essence-reward quest pays in act `act`. */
export function questEssence(formula: D97ActScaledEssence, act: number): number {
  return formula.base + formula.perAct * act;
}

/** Whether the object anchor at `anchorId` shows: only while its quest is held. */
export function objectAnchorVisible(
  state: D97QuestState,
  quests: D97QuestCatalog,
  anchorId: DreamAnchorId,
): boolean {
  return objectStepAt(state, quests, anchorId) !== null;
}

/** The head icon a quest puts over a character: `!` offers, `?` advances. */
export type D97QuestBadge = "questOffer" | "questStep";

/**
 * Quest head icons by anchor. `!` marks the giver of each available quest
 * while no quest is held; `?` marks the held quest's current visit or deliver
 * target, or its turn-in anchor once it is ready. A `?` wins over a `!`.
 */
export function questBadges(state: D97QuestState, quests: D97QuestCatalog): ReadonlyMap<DreamAnchorId, D97QuestBadge> {
  const badges = new Map<DreamAnchorId, D97QuestBadge>();
  if (state.active === null) {
    for (const quest of quests.values()) {
      if (questStatus(state, quest) === "available") badges.set(quest.giverAnchorId, "questOffer");
    }
    return badges;
  }
  const quest = quests.get(state.active.questId);
  if (quest === undefined) return badges;
  const step = currentStep(state, quest);
  if (step === null) badges.set(quest.turnInAnchorId, "questStep");
  else if (step.kind === "visit" || step.kind === "deliver") badges.set(step.anchorId, "questStep");
  return badges;
}
