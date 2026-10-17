// D97 quest tunables (Appendix A §A12, §A7). Rules code reads these values;
// it never spells them as literals.

import type { D97QuestKind } from "./dialogue/schema";

/** An Essence amount `base + perAct × a`, where `a` is the giver's act. */
export interface D97ActScaledEssence {
  readonly base: number;
  readonly perAct: number;
}

export interface D97QuestTuning {
  /** Essence paid by an Essence-reward quest, by kind. */
  readonly essenceReward: Readonly<Record<D97QuestKind, D97ActScaledEssence>>;
  /** Cards offered by a card-choice reward, sampled from the reward bag. */
  readonly cardChoiceSize: number;
}

export const D97_QUESTS: D97QuestTuning = {
  essenceReward: {
    defeat: { base: 25, perAct: 25 },
    errand: { base: 25, perAct: 25 },
    delivery: { base: 25, perAct: 25 },
    lostObject: { base: 50, perAct: 25 },
  },
  cardChoiceSize: 3,
};
