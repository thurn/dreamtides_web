// The D97 quest state a run folds (README § S33: one quest at a time,
// abandoning is free). Plain JSON-safe data; every reference a UUID.

import type { CardId } from "../../types/card-identity";
import type { D97ItemId, D97QuestId, D97QuestStepId } from "../../types/identifiers";

/** The quest the player holds and the steps they have done. */
export interface D97ActiveQuest {
  readonly questId: D97QuestId;
  /** Done steps, in the order they were done. */
  readonly completedStepIds: readonly D97QuestStepId[];
}

/** A card-choice reward rolled at turn-in, waiting for the player's pick. */
export interface D97PendingQuestReward {
  readonly questId: D97QuestId;
  /** The offer, sampled from the reward bag without removal. */
  readonly cardIds: readonly CardId[];
}

export interface D97QuestState {
  /** The one held quest, or null. */
  readonly active: D97ActiveQuest | null;
  /** Turned-in quests, in completion order. */
  readonly completedQuestIds: readonly D97QuestId[];
  readonly pendingReward: D97PendingQuestReward | null;
  /** Carried quest items; they can't be sold or discarded. */
  readonly items: readonly D97ItemId[];
}
