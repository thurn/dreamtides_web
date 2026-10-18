// Opening a reward-bag capacity stage (Appendix A §A2): stage 1 opens when
// the run starts (`./d97-run.ts`); stages 2–5 open when the player first
// enters Acts 2–5, and stage 6 when Apollyon falls. Those events have no
// rules yet, so this is the seam their cases call, in the same fold step as
// the event that opens the stage: a stage is a consequence of an event the
// log already holds, never an intent of its own, so it has no event spec.
// Pure and logged with UUIDs; opening a stage already reached changes
// nothing and logs nothing.

import type { D97BagStageTrigger } from "../../content/d97/collection";
import { activeRewardBag, bagSize, openBagStage, type D97RewardBagContent } from "../../d97/collection/reward-bag";
import type { D97RewardBags } from "../../d97/collection/types";
import type { ReducerLogRecord } from "../../eventlog/types";
import type { AvatarId, D97RunId } from "../../types/identifiers";

/** The run fields opening a stage reads and writes. */
interface D97BagRun {
  readonly runId: D97RunId;
  readonly avatarId: AvatarId;
  readonly bags: D97RewardBags;
}

/**
 * Open the reward-bag stage `trigger` names for every Avatar's bag, raising
 * each card's capacity to that stage's ring capacity, and log it.
 */
export function openRunBagStage<R extends D97BagRun>(
  run: R,
  trigger: D97BagStageTrigger,
  content: D97RewardBagContent,
): { readonly run: R; readonly logRecords: readonly ReducerLogRecord[] } {
  const { bags, opened } = openBagStage(run.bags, trigger, content.rewardBagTuning);
  if (opened === null) return { run, logRecords: [] };
  const next: R = { ...run, bags };
  return {
    run: next,
    logRecords: [
      {
        event: "d97_bag_stage_opened",
        fields: {
          runId: run.runId,
          trigger: trigger.kind,
          ...(trigger.kind === "actEntered" ? { act: trigger.act } : {}),
          fromStage: run.bags.stage,
          stage: opened.stage,
          ring1Capacity: opened.ring1Capacity,
          ring2Capacity: opened.ring2Capacity,
          avatarId: run.avatarId,
          bagSize: bagSize(activeRewardBag(content, next)),
        },
      },
    ],
  };
}
